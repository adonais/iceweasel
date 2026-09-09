/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/GeneratorResumeAnalysis.h"

#include "jit/JitSpewer.h"
#include "vm/BytecodeIterator.h"
#include "vm/Opcodes.h"

#include "vm/BytecodeIterator-inl.h"
#include "vm/BytecodeLocation-inl.h"
#include "vm/JSScript-inl.h"

using namespace js;
using namespace js::jit;

GeneratorResumeAnalysis::GeneratorResumeAnalysis(JSScript* script)
    : script_(script) {
  MOZ_ASSERT(script->isGenerator() || script->isAsync());
}

bool GeneratorResumeAnalysis::init() {
  // |pendingEntries| has the entries of all dispatches we're currently
  // building. We add an entry for each AfterYield op. At a loop backedge we
  // move pending entries added since the LoopHead from pendingEntries to
  // dispatchEntries_, and add a pending entry for the loop.
  struct OpenLoop {
    uint32_t loopHeadOffset = 0;
    uint32_t firstResumeIndex = 0;
    uint32_t firstEntry = 0;
  };
  Vector<OpenLoop, 4, SystemAllocPolicy> loopStack;
  Vector<DispatchEntry, 8, SystemAllocPolicy> pendingEntries;

  // Move pendingEntries starting at firstEntry to dispatchEntries_.
  auto addEntries = [&](uint32_t firstEntry, DispatchEntryRange* range) {
    uint32_t begin = dispatchEntries_.length();
    if (!dispatchEntries_.append(pendingEntries.begin() + firstEntry,
                                 pendingEntries.end())) {
      return false;
    }
    pendingEntries.shrinkTo(firstEntry);
    *range = DispatchEntryRange(begin, dispatchEntries_.length());
    return true;
  };

  for (const BytecodeLocation& loc : AllBytecodesIterable(script_)) {
    if (loc.is(JSOp::LoopHead)) {
      OpenLoop loop{.loopHeadOffset = loc.bytecodeToOffset(script_),
                    .firstResumeIndex = numAfterYields_,
                    .firstEntry = uint32_t(pendingEntries.length())};
      if (!loopStack.append(loop)) {
        return false;
      }
    } else if (loc.isBackedge()) {
      OpenLoop loop = loopStack.popCopy();
      MOZ_ASSERT(loc.isBackedgeForLoophead(
          script_->offsetToLocation(loop.loopHeadOffset)));

      // Skip loops without AfterYield ops.
      if (pendingEntries.length() == loop.firstEntry) {
        MOZ_ASSERT(numAfterYields_ == loop.firstResumeIndex);
        continue;
      }

      // Add dispatch entries for this loop and record the loop's entry range.
      DispatchEntryRange entries;
      if (!addEntries(loop.firstEntry, &entries)) {
        return false;
      }
      if (!loopDispatches_.emplaceBack(loop.loopHeadOffset, entries)) {
        return false;
      }

      // Add a pending InnerLoop entry for the outer dispatch.
      ResumeIndexRange range(loop.firstResumeIndex, numAfterYields_);
      if (!pendingEntries.append(
              DispatchEntry::InnerLoop(loop.loopHeadOffset, range))) {
        return false;
      }
    } else if (loc.is(JSOp::AfterYield)) {
      MOZ_ASSERT(loc.getSuspendForAfterYield().getResumeIndex() ==
                 numAfterYields_);
      MOZ_ASSERT(script_->resumeOffsets()[numAfterYields_] ==
                 loc.bytecodeToOffset(script_));
      if (!pendingEntries.append(DispatchEntry::AfterYield(numAfterYields_))) {
        return false;
      }
      numAfterYields_++;
    }
  }
  MOZ_ASSERT(loopStack.empty());

  // We don't need any dispatches if there are no AfterYield ops. This happens
  // for async functions with no |await|.
  if (!hasResumes()) {
    MOZ_ASSERT(pendingEntries.empty());
    JitSpew(JitSpew_GeneratorResume, "No AfterYield ops in %s:%u:%u",
            script_->filename(), script_->lineno(),
            script_->column().oneOriginValue());
    return true;
  }

  // The remaining pending entries are for the prologue dispatch.
  if (!addEntries(0, &prologueDispatch_)) {
    return false;
  }
  MOZ_ASSERT(pendingEntries.empty());

  // There must be a single dispatch entry for each AfterYield op and for each
  // loop containing AfterYield ops.
  MOZ_ASSERT(dispatchEntries_.length() ==
             numAfterYields_ + loopDispatches_.length());

#ifdef JS_JITSPEW
  spewDispatches();
#endif
  return true;
}

#ifdef JS_JITSPEW
void GeneratorResumeAnalysis::spewDispatches() const {
  if (!JitSpewEnabled(JitSpew_GeneratorResume)) {
    return;
  }

  JitSpew(JitSpew_GeneratorResume,
          "Resume dispatches for %s:%u:%u (%u AfterYield ops)",
          script_->filename(), script_->lineno(),
          script_->column().oneOriginValue(), numAfterYields_);

  auto spewEntries = [&](DispatchEntrySpan entries) {
    for (const auto& entry : entries) {
      if (entry.isAfterYield()) {
        uint32_t resumeIndex = entry.resumeIndex();
        JitSpew(JitSpew_GeneratorResume,
                "    resumeIndex %u => AfterYield @ %u", resumeIndex,
                afterYieldLocationAt(resumeIndex).bytecodeToOffset(script_));
      } else {
        ResumeIndexRange range = entry.resumeIndices();
        JitSpew(JitSpew_GeneratorResume,
                "    resumeIndex %u-%u => LoopHead @ %u", range.begin,
                range.last(), entry.innerLoopHeadOffset());
      }
    }
  };

  JitSpew(JitSpew_GeneratorResume, "  prologue:");
  spewEntries(prologueDispatchEntries());

  // Loops are recorded when they close, so inner loops come first.
  for (const LoopDispatch& loop : loopDispatches_) {
    JitSpew(JitSpew_GeneratorResume, "  LoopHead @ %u:", loop.loopHeadOffset);
    spewEntries(entriesIn(loop.entries));
  }
}
#endif

DispatchEntrySpan GeneratorResumeAnalysis::loopDispatchEntries(
    BytecodeLocation loopHead) const {
  MOZ_ASSERT(loopHead.is(JSOp::LoopHead));

  uint32_t loopHeadOffset = loopHead.bytecodeToOffset(script_);
  for (const LoopDispatch& loop : loopDispatches_) {
    if (loop.loopHeadOffset == loopHeadOffset) {
      return entriesIn(loop.entries);
    }
  }

  return {};
}
