/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 *
 * Copyright 2025 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef wasm_stacks_h
#define wasm_stacks_h

#include "js/TypeDecls.h"
#include "util/TrailingArray.h"
#include "vm/JSContext.h"
#include "vm/NativeObject.h"
#include "wasm/WasmAnyRef.h"
#include "wasm/WasmConstants.h"
#include "wasm/WasmContext.h"
#include "wasm/WasmFrame.h"

namespace js {
class WasmTagObject;
class Nursery;
namespace jit {
class CodeOffset;
class Label;
}  // namespace jit
namespace wasm {
class CallSiteDesc;
}  // namespace wasm
}  // namespace js

namespace js::wasm {

// Always forward declare these interfaces to simplify conditional compilation
// in a few places.
struct SwitchTarget;
struct Handler;
struct Handlers;
class ContStack;
class ContObject;

#ifdef ENABLE_WASM_JSPI

struct ContStackDeleter {
  void operator()(const ContStack* cont);
};
using UniqueContStack = mozilla::UniquePtr<ContStack, ContStackDeleter>;

// A switch target contains information about the destination of a stack switch
// operation.
//
// This must be aligned to match WasmStackAlignment.
struct alignas(16) SwitchTarget {
  void* framePointer = nullptr;
  void* stackPointer = nullptr;
  void* resumePC = nullptr;
  wasm::Instance* instance = nullptr;
  // An optional pointer to where params for a stack switching operation can be
  // stored.
  void* paramsArea = nullptr;
  // The underlying stack this switch is on. This has the stack limits we need
  // to update to.
  const StackTarget* stack = nullptr;

  void trace(JSTracer* trc) const;
};

// A suspend handler for a given tag that indicates where to switch to.
struct Handler {
  // Rooted on the stack, and doesn't need barriers.
  WasmTagObject* tag = nullptr;
  // Reference to the containing handlers object.
  Handlers* handlers = nullptr;
  // Where to switch to when a suspend matches this tag.
  SwitchTarget target;
};

// An ordered list of handlers that is created by a `resume `instruction. It
// contains an ordered list of handlers to search when a `suspend` instruction
// is executed, and also owns the child continuation stack that was resumed.
//
// This must be aligned to match WasmStackAlignment.
struct alignas(16) Handlers : TrailingArray<Handlers> {
  // The continuation stack this handler is on. Null if we're on the main stack.
  // The next handler to search for can be found on this.
  ContStack* self = nullptr;

  // The owning reference for the child continuation stack.
  UniqueContStack child = nullptr;

  // Target for normal returns.
  SwitchTarget returnTarget{};

  // The number of handlers that trail this header.
  uint32_t numHandlers;

  // 32-bit's is enough for anyone.
  static_assert(MaxHandlers < UINT32_MAX);

  static constexpr size_t offsetOfHandler(size_t index) {
    return sizeof(wasm::Handlers) + index * sizeof(wasm::Handler);
  }

  static constexpr size_t sizeOf(size_t numHandlers) {
    MOZ_RELEASE_ASSERT(numHandlers <= wasm::MaxHandlers);
    return sizeof(wasm::Handlers) + sizeof(wasm::Handler) * numHandlers;
  }
  size_t sizeOf() const { return Handlers::sizeOf(numHandlers); }

  bool isMainStack() const { return returnTarget.stack->isMainStack(); }

  Handler* handler(uint32_t index) {
    MOZ_RELEASE_ASSERT(index < wasm::MaxHandlers);
    return offsetToPointer<Handler>(offsetOfHandler(index));
  }
  const Handler* handler(uint32_t index) const {
    MOZ_RELEASE_ASSERT(index < wasm::MaxHandlers);
    return offsetToPointer<Handler>(offsetOfHandler(index));
  }

  // This is always constructed by JIT code on the stack.
  Handlers() = delete;
  ~Handlers() = delete;

  void trace(JSTracer* trc) const;
};

// The underlying execution stack of a continuation. This class is the header
// of the stack and the actual execution stack is executed physically before
// this header.
//
// See [SMDOC] Wasm Stack Switching in WasmStacks.cpp for more information.
class ContStack {
  // Pointers to the underlying allocation.
  void* allocation_ = nullptr;
  size_t allocationSize_ = 0;

  // Pointers to the usable regions of the stack.
  JS::NativeStackBase stackBase_ = 0;
  JS::NativeStackLimit stackLimitForSystem_ = JS::NativeStackLimitMin;
  JS::NativeStackLimit stackLimitForJit_ = JS::NativeStackLimitMin;

  // The initial resume target and callee for the base frame to use.
  SwitchTarget initialResumeTarget_{};
  GCPtr<JSFunction*> initialResumeCallee_;

  // A target useable when switching to this stack.
  StackTarget target_{};

  // The parent handlers we can use when suspending. This is allocated on the
  // stack of a caller stack. We always have handlers if we are active.
  Handlers* handlers_ = nullptr;

  // The target that can be used to resume this stack if we're suspended and
  // can be resumed. This may be a different continuation stack than us if a
  // stack of continuations were suspended. That stack is the 'resume target'
  // and we are the 'resume base'. We are always an ancestor stack of the
  // resume target stack.
  SwitchTarget* resumeTarget_ = nullptr;

  // Whether this stack is registered in the wasm::Context, and if so what
  // index in the vector we are.
  mozilla::Maybe<size_t> registeredIndex_;

  ContStack() = default;
  ~ContStack();

  FrameWithInstances* baseFrame() {
    uintptr_t baseFrameAddress =
        reinterpret_cast<uintptr_t>(this) + ContStack::offsetOfBaseFrame();
    return reinterpret_cast<FrameWithInstances*>(baseFrameAddress);
  }

  static void free(const ContStack* stack);
  static void unregisterAndFree(JSContext* cx, UniqueContStack stack);
  friend ContStackDeleter;

 public:
  static UniqueContStack allocate(JSContext* cx,
                                  Handle<ContObject*> continuation,
                                  Handle<JSFunction*> target,
                                  void* contBaseFrameStub);
  static void unwind(JSContext* cx, wasm::Handlers* handlers);
  static void freeSuspended(JSContext* cx, UniqueContStack resumeBase);

  [[nodiscard]] bool registerSelf(JSContext* cx);
  void unregisterSelf(JSContext* cx);

  // Trace the fields on this stack, but no the frames.
  void traceFields(JSTracer* trc);
  // Trace the fields and all frames for a suspended stack. This must be the
  // resume base.
  void traceSuspended(JSTracer* trc);
  // Update all the frames for a moving GC. This must be the resume base.
  void updateSuspendedForMovingGC(Nursery& nursery);

  // Given the base frame pointer of a continuation stack, get this header.
  static ContStack* fromBaseFrameFP(void* fp) {
    return reinterpret_cast<ContStack*>(reinterpret_cast<uintptr_t>(fp) -
                                        offsetOfBaseFrameFP());
  }

  static int32_t offsetOfBaseFrame();
  static int32_t offsetOfBaseFrameFP();

  static constexpr int32_t offsetOfInitialResumeTarget() {
    return offsetof(ContStack, initialResumeTarget_);
  }
  static constexpr int32_t offsetOfInitialResumeCallee() {
    return offsetof(ContStack, initialResumeCallee_);
  }
  static constexpr int32_t offsetOfHandlers() {
    return offsetof(ContStack, handlers_);
  }
  static constexpr int32_t offsetOfStackTarget() {
    return offsetof(ContStack, target_);
  }
  static constexpr int32_t offsetOfResumeTarget() {
    return offsetof(ContStack, resumeTarget_);
  }

  // Return if we can resume this stack.
  bool canResume() const {
    MOZ_RELEASE_ASSERT(!!handlers_ != !!resumeTarget_);
    return !!resumeTarget_;
  }
  // Return if this stack has never been resumed.
  bool isInitial() const { return resumeTarget_ == &initialResumeTarget_; }

  Handlers* handlers() { return handlers_; }
  const Handlers* handlers() const { return handlers_; }
  ContStack* handlersStack() const {
    if (!handlers_) {
      return nullptr;
    }
    return handlers_->returnTarget.stack->stack;
  }
  const SwitchTarget* resumeTarget() const { return resumeTarget_; }
  ContStack* resumeTargetStack() const {
    if (!resumeTarget_) {
      return nullptr;
    }
    return resumeTarget_->stack->stack;
  }
  const StackTarget& stackTarget() const { return target_; }

  // The logical beginning or bottom of the stack, which is the physically
  // highest memory address in the stack allocation.
  JS::NativeStackBase stackBase() const { return stackBase_; }

  // The logical end or top of the stack for system code, which is the
  // physically lowest memory address in the stack allocation. This does not
  // include any 'red zone' space, and so it is not safe to use if a stub
  // or OS interrupt handler could run on the stack. Use
  // `stackMemoryLimitForJit` instead.
  JS::NativeStackLimit stackLimitForSystem() const {
    return stackLimitForSystem_;
  }

  // The logical end or top of the stack for JIT code, which is the
  // physically lowest memory address in the stack allocation. This does
  // include 'red zone' space for running stubs or OS interrupt handlers.
  JS::NativeStackLimit stackLimitForJit() const { return stackLimitForJit_; }

  bool hasStackAddress(uintptr_t stackAddress) const {
    return stackBase_ >= stackAddress && stackAddress > stackLimitForSystem_;
  }

  // Do a linear search to see if this stack is linked to the main stack.
  bool findIfActive() const {
    MOZ_RELEASE_ASSERT(!canResume());
    const Handlers* baseHandlers = findBaseHandlers();
    return baseHandlers && baseHandlers->isMainStack();
  }

  // Do a linear search to find the base handler for this continuation.
  const Handlers* findBaseHandlers() const {
    if (!handlers_) {
      return nullptr;
    }
    const Handlers* handlers = handlers_;
    while (handlers->self && handlers->self->handlers()) {
      handlers = handlers->self->handlers();
    }
    return handlers;
  }
};

// A suspended wasm continuation that can be resumed.
//
// See [SMDOC] Wasm Stack Switching in WasmStacks.cpp for more information.
class ContObject : public NativeObject {
 public:
  static const JSClass class_;

  enum {
    ResumeBaseSlot,
    SlotCount,
  };

  // Create a continuation that when resumed will call the `target` wasm
  // function. `contBaseFrameStub` is the corresponding stub created by
  // wasm::GenerateContBaseFrameStub for the wasm function type.
  static ContObject* create(JSContext* cx, Handle<JSFunction*> target,
                            void* contBaseFrameStub);
  // Create a continuation that is empty and cannot be resumed.
  static ContObject* createEmpty(JSContext* cx);

  static constexpr size_t offsetOfResumeBase() {
    return NativeObject::getFixedSlotOffset(ResumeBaseSlot);
  }

 private:
  static const JSClassOps classOps_;
  static const ClassExtension classExt_;

  ContStack* resumeBase() {
    Value stackSlot = getFixedSlot(ResumeBaseSlot);
    if (stackSlot.isUndefined()) {
      return nullptr;
    }
    return reinterpret_cast<ContStack*>(stackSlot.toPrivate());
  }

  // Destroy this continuation by taking the inner stack owned by it.
  UniqueContStack takeResumeBase() {
    UniqueContStack result = UniqueContStack(resumeBase());
    setFixedSlot(ResumeBaseSlot, JS::UndefinedValue());
    return result;
  }

  static void finalize(JS::GCContext* gcx, JSObject* obj);
  static void trace(JSTracer* trc, JSObject* obj);
};

// Adjust the VM stack limits for entering the stack target.
// Clobbers scratch. On Win32, also clobbers cx.
void EmitEnterStackTarget(jit::MacroAssembler& masm, jit::Register cx,
                          jit::Register stackTarget, jit::Register scratch);

// Switch to the given switch target and continue execution there.
// Clobbers all registers.
void EmitSwitchStack(jit::MacroAssembler& masm, jit::Register switchTarget,
                     jit::Register scratch1, jit::Register scratch2,
                     jit::Register scratch3);

// Zero out a switch target.
void EmitClearSwitchTarget(jit::MacroAssembler& masm,
                           jit::Register switchTarget);

// Search the handler chain to find the handler that matches a given tag.
// Output contains a pointer to the wasm::Handler that was matched.
// If no match is found then branch to `fail`.
void EmitFindHandler(jit::MacroAssembler& masm, jit::Register instance,
                     jit::Register tag, jit::Register output,
                     jit::Register scratch1, jit::Register scratch2,
                     jit::Register scratch3, jit::Register scratch4,
                     jit::Label* fail);

// Suspend to the given handler.
//
// Does not return. After the stack switch, execution resumes at
// *suspendCodeOffset with only InstanceReg live.
//
// Clobbers scratch1, scratch2, scratch3, and suspendedCont.
void EmitSuspend(jit::MacroAssembler& masm, jit::Register instance,
                 jit::Register suspendedCont, jit::Register handler,
                 jit::Register scratch1, jit::Register scratch2,
                 jit::Register scratch3, const CallSiteDesc& callSiteDesc,
                 jit::CodeOffset* suspendCodeOffset,
                 uint32_t* suspendFramePushed);

// Offsets used when initializing a handler for a resume.
struct HandlerJitOffsets {
  uint32_t tagInstanceDataOffset = UINT32_MAX;
  uint32_t resultsAreaOffset = UINT32_MAX;
};

// Resume a suspended continuation with the given handlers.
//
// Does not return. After the resumed stack returns, execution continues at
// *resumeCodeOffset with only InstanceReg live. Each handler landing pad
// jumps to the corresponding handlerLabels entry with only InstanceReg live.
//
// Clobbers scratch1, scratch2, scratch3, and cont.
void EmitResume(jit::MacroAssembler& masm, jit::Register instance,
                jit::Register cont, jit::Register handlersResultArea,
                jit::Register scratch1, jit::Register scratch2,
                jit::Register scratch3, jit::Label* fail,
                mozilla::Span<HandlerJitOffsets> handlerOffsets,
                mozilla::Span<jit::Label*> handlerLabels,
                const CallSiteDesc& callSiteDesc,
                jit::CodeOffset* resumeCodeOffset, uint32_t* resumeFramePushed);

#endif  // ENABLE_WASM_JSPI

}  // namespace js::wasm

#endif  // wasm_stacks_h
