/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_Bailouts_h
#define jit_Bailouts_h

#include "mozilla/Assertions.h"  // MOZ_ASSERT

#include <stddef.h>  // size_t
#include <stdint.h>  // uint8_t, uint32_t

#include "jstypes.h"

#include "jit/IonTypes.h"  // js::jit::Bailout{Id,Kind}, js::jit::SnapshotOffset
#include "jit/MachineState.h"  // js::jit::MachineState
#include "js/TypeDecls.h"      // jsbytecode
#include "vm/JSContext.h"      // JSContext

namespace js {

class AbstractFramePtr;

namespace jit {

// [SMDOC] IonMonkey Bailouts
//
// A "bailout" is the process of recovering a baseline interpreter frame from an
// IonFrame.  Bailouts are implemented in js::jit::BailoutIonToBaseline, which
// has the following callers:
//
// *   js::jit::Bailout - This is used when a guard fails in the Ion code
//     itself; for example, an LGuardShape fails or an LAddI overflows. See
//     callers of CodeGenerator::bailoutFrom() for more examples.
//
// * js::jit::ExceptionHandlerBailout - Ion doesn't implement `catch` or
//     `finally`. If an exception is thrown and would be caught by an Ion frame,
//     we bail out instead.
//
// *   js::jit::InvalidationBailout - We returned to Ion code that was
//     invalidated while it was on the stack. See "OSI" below. Ion code can be
//     invalidated for several reasons: when GC evicts Ion code to save memory,
//     for example, or when assumptions baked into the jitted code are
//     invalidated by the VM.
//
// (Some stack inspection can be done without bailing out, including GC stack
// marking, Error object construction, and Gecko profiler sampling.)
//
// Consider the first case. When an Ion guard fails, we can't continue in
// Ion. There's no IC fallback case coming to save us; we've got a broken
// assumption baked into the code we're running. So we jump to an out-of-line
// code path that's responsible for abandoning Ion execution and resuming in
// the baseline interpreter: the bailout path.
//
// We were in the midst of optimized Ion code, so bits of program state may be
// in registers or spilled to the native stack; values may be unboxed; some
// objects may have been optimized away; thanks to inlining, whole call frames
// may be missing. The bailout path must put all these pieces back together
// into the structure the baseline interpreter expects.
//
// The data structure that makes this possible is called a *snapshot*.
// Snapshots are created during Ion codegen and associated with the IonScript;
// they tell how to recover each value in a BaselineFrame from the current
// machine state at a given point in the Ion JIT code. This is potentially
// different at every place in an Ion script where we might bail out. (See
// Snapshots.h.)
//
// The bailout path performs roughly the following steps:
//
// 1.  Push a snapshot index and the frame size to the native stack.
// 2.  Spill all registers.
// 3.  Call js::jit::Bailout to reconstruct the baseline frame(s).
// 4.  Copy the frame(s) to the right place on the native stack.
// 5.  Jump into the baseline interpreter.
//
// When C++ code invalidates Ion code, we do on-stack invalidation, or OSI, to
// arrange for every affected Ion frame on the stack to bail out as soon as
// control returns to it. OSI patches every instruction in the JIT code that's
// at a return address currently on the stack. See InvalidateActivation.
//
//
// ## Bailout path implementation details
//
// Ion code has a lot of guards, so each bailout path must be small. Steps 2
// and 3 above are therefore implemented by a shared per-Runtime trampoline,
// rt->jitRuntime()->getGenericBailoutHandler().
//
// We implement step 1 like this:
//
//     _bailout_ID_1:
//       push 1
//       jmp _deopt
//     _bailout_ID_2:
//       push 2
//       jmp _deopt
//     ...
//     _deopt:
//       push imm(FrameSize)
//       call _global_bailout_handler
//
// ## Bailout stack reconstruction
//
// BaselineStackBuilder uses the Snapshot to construct a copy (on the heap) of
// the stack that will replace the IonFrame. Each recovered Ion inline frame
// becomes a BaselineJS frame that resumes in the Baseline Interpreter. For each
// reconstructed inline call, the caller and callee BaselineJS frames are
// connected by a BaselineStub frame that resumes in a FallbackIC stub:
//
//    +============================+
//    | Original IonFrame's Caller |
//    +----------------------------+
//    |      BaselineJS Frame      |
//    +----------------------------+
//    |     BaselineStub Frame     |
//    +----------------------------+
//    |      BaselineJS Frame      |
//    +----------------------------+
//    |            ...             |
//    +----------------------------+
//    |  Final BaselineJS Frame    |
//    +----------------------------+
//
// The return addresses installed in these frames during reconstruction are to
// specific known return points in Bailout Stubs emitted by:
//
// - BaselineInterpreterGenerator::emitICBailoutStub and
// - FallbackICCodeCompiler::emitBailoutStub
//
// Hardware shadow stacks (e.g., CET on x86_64) use a hidden secondary stack to
// verify that return addresses were pushed by earlier calls. To be compatible
// with this, we can't simply write an address onto the stack. Each return
// address in the reconstructed stack must be pushed by an actual call. We
// therefore rebuild the stack one frame at a time.
//
// The BaselineStackBuilder rebuilds the stack one frame at a time, separated by
// these return address slots. Along with the contents of each frame, it appends
// a corresponding BailoutStubInfo containing two fields:
//
// - frameBoundary: the native stack boundary down to which (assuming the stack
// grows downwards) the current frame's contents must be copied. This excludes
// the return address slot representing the call into the next (outer) frame.
//
// - bailoutStub: the address of the bailout stub that actually contains the
// return address for the reconstructed frame and pushes it on the stack.
//
// The last BailoutStubInfo corresponding to the final BaselineJS frame where
// execution resumes in the BaselineInterpreter has a NULL bailoutStub since it
// doesn't call into another frame and so doesn't have a return address slot.
//
// The bailoutTail generated by MacroAssembler::generateBailoutTail loops
// through these BailoutStubInfo entries and copies the reconstructed frames on
// the native stack from the outer-most to inner-most frame. The process begins
// at the return address slot of the original IonFrame's caller.
//
// For each BailoutStubInfo entry, the bailoutTail:
//
// 1. Copies the contents of the frame into the native stack up to
// frameBoundary.
//
// 2. If bailoutStub is NULL the bailout stack has been fully copied and the
// bailoutTail proceeds with a call to js::jit::FinishBailoutToBaseline.
//
// 3. Otherwise, jump to the bailout stub at bailoutStub. The bailout stub
// performs an indirect call back to bailoutTail to push the expected return
// address on the stack and continue copying the next frame.

// BailoutStack is an architecture specific pointer to the stack, given by the
// bailout handler.
class BailoutStack;
class InvalidationBailoutStack;

class IonScript;
class InlineFrameIterator;
class JitActivation;
class JitActivationIterator;
class JSJitFrameIter;
struct ResumeFromException;

// Must be implemented by each architecture.

// This structure is constructed before recovering the baseline frames for a
// bailout. It records all information extracted from the stack, and which are
// needed for the JSJitFrameIter.
class BailoutFrameInfo {
  MachineState machine_;
  uint8_t* framePointer_;
  IonScript* topIonScript_;
  uint32_t snapshotOffset_;
  JitActivation* activation_;

  void attachOnJitActivation(const JitActivationIterator& activations);

 public:
  BailoutFrameInfo(const JitActivationIterator& activations, BailoutStack* sp);
  BailoutFrameInfo(const JitActivationIterator& activations,
                   InvalidationBailoutStack* sp);
  BailoutFrameInfo(const JitActivationIterator& activations,
                   const JSJitFrameIter& frame);
  ~BailoutFrameInfo();

  uint8_t* fp() const { return framePointer_; }
  SnapshotOffset snapshotOffset() const { return snapshotOffset_; }
  const MachineState* machineState() const { return &machine_; }
  IonScript* ionScript() const { return topIonScript_; }
  JitActivation* activation() const { return activation_; }
};

[[nodiscard]] bool EnsureHasEnvironmentObjects(JSContext* cx,
                                               AbstractFramePtr fp);

struct BaselineBailoutInfo;

// Called from a bailout thunk.
[[nodiscard]] bool Bailout(BailoutStack* sp, BaselineBailoutInfo** info);

// Called from the invalidation thunk.
[[nodiscard]] bool InvalidationBailout(InvalidationBailoutStack* sp,
                                       BaselineBailoutInfo** info);

class ExceptionBailoutInfo {
  size_t frameNo_;
  jsbytecode* resumePC_;
  size_t numExprSlots_;
  bool isFinally_ = false;
  RootedValue finallyException_;
  RootedValue finallyExceptionStack_;
  bool forcedReturn_;

 public:
  ExceptionBailoutInfo(JSContext* cx, size_t frameNo, jsbytecode* resumePC,
                       size_t numExprSlots)
      : frameNo_(frameNo),
        resumePC_(resumePC),
        numExprSlots_(numExprSlots),
        finallyException_(cx),
        finallyExceptionStack_(cx),
        forcedReturn_(cx->isPropagatingForcedReturn()) {}

  explicit ExceptionBailoutInfo(JSContext* cx)
      : frameNo_(0),
        resumePC_(nullptr),
        numExprSlots_(0),
        finallyException_(cx),
        finallyExceptionStack_(cx),
        forcedReturn_(cx->isPropagatingForcedReturn()) {}

  bool catchingException() const { return !!resumePC_; }
  bool propagatingIonExceptionForDebugMode() const { return !resumePC_; }

  size_t frameNo() const {
    MOZ_ASSERT(catchingException());
    return frameNo_;
  }
  jsbytecode* resumePC() const {
    MOZ_ASSERT(catchingException());
    return resumePC_;
  }
  size_t numExprSlots() const {
    MOZ_ASSERT(catchingException());
    return numExprSlots_;
  }

  bool isFinally() const { return isFinally_; }
  void setFinallyException(const JS::Value& exception,
                           const JS::Value& exceptionStack) {
    MOZ_ASSERT(!isFinally());
    isFinally_ = true;
    finallyException_ = exception;
    finallyExceptionStack_ = exceptionStack;
  }
  HandleValue finallyException() const {
    MOZ_ASSERT(isFinally());
    return finallyException_;
  }
  HandleValue finallyExceptionStack() const {
    MOZ_ASSERT(isFinally());
    return finallyExceptionStack_;
  }

  bool forcedReturn() const { return forcedReturn_; }
};

// Called from the exception handler to enter a catch or finally block.
[[nodiscard]] bool ExceptionHandlerBailout(JSContext* cx,
                                           const InlineFrameIterator& frame,
                                           ResumeFromException* rfe,
                                           const ExceptionBailoutInfo& excInfo);

[[nodiscard]] bool FinishBailoutToBaseline(BaselineBailoutInfo* bailoutInfoArg);

#ifdef DEBUG
[[nodiscard]] bool AssertBailoutStackDepth(JSContext* cx, JSScript* script,
                                           jsbytecode* pc, ResumeMode mode,
                                           uint32_t exprStackSlots);
#endif

}  // namespace jit
}  // namespace js

#endif /* jit_Bailouts_h */
