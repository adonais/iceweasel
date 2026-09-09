/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_GeneratorResumeAnalysis_h
#define jit_GeneratorResumeAnalysis_h

#include "mozilla/Span.h"

#include "js/Vector.h"
#include "vm/BytecodeLocation.h"
#include "vm/JSScript.h"

namespace js {
namespace jit {

// [SMDOC] Resuming generators and async functions in Warp
//
// GeneratorResumeAnalysis is a bytecode analysis pass that precomputes the
// information WarpBuilder needs to build MIR for the resume paths of a
// generator (or async function, which resumes the same way).
//
// To resume a generator, the function is called with the IsResumingGenerator
// bit set in the FrameDescriptor. Baseline handles a resume with a branch in
// the script's prologue: if the flag is set, it restores the frame's locals,
// expression stack, and environment chain from the generator object, and then
// uses the resume index to jump to the JSOp::AfterYield following the yield or
// await op that suspended the frame.
//
// WarpBuilder can't do this, because that jump may target the middle of a
// loop. An edge from the prologue into a loop's body does not go through the
// loop header, so the loop gets a second entry point and the graph becomes
// irreducible, which Ion does not support. (The one exception is OSR, where a
// single OsrEntry block jumps to the target loop header.)
//
// The fix is to route every resume through the headers of the loops containing
// it. The prologue only jumps to AfterYield ops outside any loop, or to the
// header of an enclosing loop; each loop holding an AfterYield op re-tests
// IsResumingGenerator and dispatches again, either to an AfterYield in its own
// body or to an inner loop header. An AfterYield nested N loops deep is reached
// through N headers, and every edge into a loop is an ordinary loop entry.
//
// Each level's IsResumingGenerator test together with its branch on the resume
// index is a dispatch: one in the prologue, and one in the header of every loop
// containing an AfterYield. Note that a jump table for the resume index is
// often unnecessary: no index check is needed if there's a single dispatch
// entry, and a comparison can be used when there are two entries.
//
// The resume indices of a script's yield and await ops are contiguous and in
// bytecode order, and each dispatch covers a contiguous range of them: its
// entries are sorted by resume index and have no holes.
//
// A generator without loops will have a single dispatch, in the prologue:
//
//   function* f(x) {
//     yield 1;
//     return x;
//   }
//
// bytecode:
//
//     00017: InitialYield 0     # resume index 0
//     00021: AfterYield
//     ...
//     00051: Yield 1            # resume index 1
//     00055: AfterYield
//     ...
//     00105: FinalYieldRval
//
// for which Warp builds (pseudocode):
//
//       if (IsResumingGenerator()) {
//         // Restores the frame's locals but, unlike Baseline, not the
//         // expression stack slots.
//         restoreFrameFromGenerator();
//         switch (resumeIndex) {         // (or the equivalent if-else)
//           case 0: goto afterYield0;
//           case 1: goto afterYield1;
//         }
//       }
//       ...normal prologue...
//       InitialYield;
//     afterYield0:
//       // Each AfterYield op restores the expression stack slots, if any.
//       ...
//       Yield;
//     afterYield1:
//       ...
//
// With yields inside a loop, that loop's header gets a dispatch of its own, and
// the prologue's dispatch branches to the loop header:
//
//   function* g(x) {
//     for (var i = 0; i < x; i++) {
//       yield i;
//       yield i * 2;
//     }
//   }
//
// bytecode:
//
//     00017: InitialYield 0     # resume index 0
//     00021: AfterYield
//     ...
//     00040: LoopHead
//     ...
//     00093: Yield 1            # resume index 1
//     00097: AfterYield
//     ...
//     00133: Yield 2            # resume index 2
//     00137: AfterYield
//     ...
//     00155: Goto 40 (-115)     # backedge
//
// for which Warp builds:
//
//       if (IsResumingGenerator()) {
//         restoreFrameFromGenerator();
//         switch (resumeIndex) {
//           case 0:         goto afterYield0;
//           case 1: case 2: goto loopHead;
//         }
//       }
//       ...normal prologue...
//       InitialYield;
//     afterYield0:
//       i = 0;
//     loopHead:
//       if (IsResumingGenerator()) {
//         switch (resumeIndex) {         // (or the equivalent if-else)
//           case 1: goto afterYield1;
//           case 2: goto afterYield2;
//         }
//       }
//       if (!(i < x)) goto afterLoop;
//       ...
//       Yield;
//     afterYield1:
//       ...
//       Yield;
//     afterYield2:
//       i++;
//       goto loopHead; // Backedge.
//     afterLoop:
//       ...
//
// This analysis pass collects the list of entries for each of those dispatches:
// one list for the prologue, and one for every loop containing at least one
// AfterYield. A single dispatch entry targets either:
//
//  - a JSOp::AfterYield (for a single resume index) in the dispatching level's
//    own body. In g above, case 0 is such an entry in the prologue's dispatch,
//    and cases 1 and 2 are ones in the loop header's dispatch.
//
//  - an inner loop that contains AfterYield ops. A single entry is used for the
//    range of resume indices inside that loop. This is why cases 1 and 2 share
//    an edge in g's prologue.
//
// Across all dispatches, the total number of entries is exactly the number of
// AfterYield ops + the number of loops containing an AfterYield op.

// A contiguous [begin, end) range of resume indices.
struct ResumeIndexRange {
  uint32_t begin = 0;
  uint32_t end = 0;

  bool empty() const { return begin == end; }

  uint32_t last() const {
    MOZ_ASSERT(!empty());
    return end - 1;
  }
};

// A single edge out of a resume dispatch. It targets either a JSOp::AfterYield
// (single resume index) or an inner loop's header (range of resume indices).
class DispatchEntry {
  ResumeIndexRange resumeIndices_;

  // Sentinel value of innerLoopHeadOffset_ for AfterYield entries.
  static constexpr uint32_t NoInnerLoop = UINT32_MAX;
  uint32_t innerLoopHeadOffset_;

  DispatchEntry(ResumeIndexRange resumeIndices, uint32_t innerLoopHeadOffset)
      : resumeIndices_(resumeIndices),
        innerLoopHeadOffset_(innerLoopHeadOffset) {
    MOZ_ASSERT(!resumeIndices.empty());
  }

 public:
  static DispatchEntry AfterYield(uint32_t resumeIndex) {
    return DispatchEntry(ResumeIndexRange{resumeIndex, resumeIndex + 1},
                         NoInnerLoop);
  }
  static DispatchEntry InnerLoop(uint32_t innerLoopHeadOffset,
                                 ResumeIndexRange resumeIndices) {
    MOZ_ASSERT(innerLoopHeadOffset != NoInnerLoop);
    return DispatchEntry(resumeIndices, innerLoopHeadOffset);
  }

  bool isAfterYield() const { return innerLoopHeadOffset_ == NoInnerLoop; }
  ResumeIndexRange resumeIndices() const { return resumeIndices_; }

  uint32_t resumeIndex() const {
    MOZ_ASSERT(isAfterYield());
    return resumeIndices_.begin;
  }

  // Bytecode offset of the inner loop's JSOp::LoopHead.
  uint32_t innerLoopHeadOffset() const {
    MOZ_ASSERT(!isAfterYield());
    return innerLoopHeadOffset_;
  }
};
using DispatchEntrySpan = mozilla::Span<const DispatchEntry>;

// The dispatches a Warp compilation needs to reach a generator or async
// function's AfterYield ops, as described by the [SMDOC] above. Computed from
// the bytecode before any MIR exists, and read-only after that.
class GeneratorResumeAnalysis {
  JSScript* script_;

  // The number of AfterYield ops in the script. Their resume indices are
  // [0, numAfterYields_).
  uint32_t numAfterYields_ = 0;

  // A [begin, end) slice of dispatchEntries_.
  struct DispatchEntryRange {
    uint32_t begin = 0;
    uint32_t end = 0;

    DispatchEntryRange() = default;
    DispatchEntryRange(uint32_t begin, uint32_t end) : begin(begin), end(end) {
      MOZ_ASSERT(begin < end);
    }
  };

  // All dispatch entries, concatenated. Each dispatch (the prologue one, and
  // one per loop containing an AfterYield) owns a contiguous
  // DispatchEntryRange.
  Vector<DispatchEntry, 8, SystemAllocPolicy> dispatchEntries_;

  // The dispatch entries for the script's prologue.
  DispatchEntryRange prologueDispatch_;

  // The dispatch entries for loops.
  struct LoopDispatch {
    uint32_t loopHeadOffset;
    DispatchEntryRange entries;
  };
  Vector<LoopDispatch, 4, SystemAllocPolicy> loopDispatches_;

  DispatchEntrySpan entriesIn(DispatchEntryRange range) const {
    MOZ_ASSERT(range.begin < range.end);
    MOZ_ASSERT(range.end <= dispatchEntries_.length());
    size_t len = range.end - range.begin;
    return DispatchEntrySpan(dispatchEntries_.begin() + range.begin, len);
  }

#ifdef JS_JITSPEW
  void spewDispatches() const;
#endif

 public:
  explicit GeneratorResumeAnalysis(JSScript* script);

  [[nodiscard]] bool init();

  bool hasResumes() const { return numAfterYields_ > 0; }

  // The JSOp::AfterYield with this resume index.
  BytecodeLocation afterYieldLocationAt(uint32_t resumeIndex) const {
    MOZ_ASSERT(resumeIndex < numAfterYields_);
    return script_->offsetToLocation(script_->resumeOffsets()[resumeIndex]);
  }

  DispatchEntrySpan prologueDispatchEntries() const {
    MOZ_ASSERT(hasResumes());
    return entriesIn(prologueDispatch_);
  }
  DispatchEntrySpan loopDispatchEntries(BytecodeLocation loopHead) const;
};

}  // namespace jit
}  // namespace js

#endif /* jit_GeneratorResumeAnalysis_h */
