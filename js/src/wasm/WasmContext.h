/*
 * Copyright 2020 Mozilla Foundation
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

#ifndef wasm_context_h
#define wasm_context_h

#include "mozilla/Vector.h"

#ifdef ENABLE_WASM_JSPI
#  include "gc/Barrier.h"
#endif  // ENABLE_WASM_JSPI

#include "js/NativeStackLimits.h"

#ifdef _WIN32
struct _NT_TIB;
#endif

namespace js::wasm {

struct Handlers;
class ContObject;
class ContStack;
using ContStackVector = mozilla::Vector<ContStack*, 0, SystemAllocPolicy>;

#ifdef ENABLE_WASM_JSPI

// A stack target describes a stack that can be switched to using the
// stack-switching feature. There is one for the 'main stack' and one for each
// continuation stack.
//
// StackTarget is declared here to break a cyle with WasmStacks.h.
struct StackTarget {
  // The continuation stack, if any. This is a weak self-reference, as
  // it's only non-null when stored on the same ContStack.
  ContStack* stack = nullptr;

  // The limit that jit code should use on this stack. This will be constant
  // over the lifetime of the stack.
  JS::NativeStackLimit jitLimit = JS::NativeStackLimitMin;

  // The Win32 TIB stack base and limit fields. With lazy commit these may
  // change as the stack grows.
#  if defined(_WIN32)
  void* tibStackBase = nullptr;
  void* tibStackLimit = nullptr;
#  endif

  bool isMainStack() const { return !stack; }
};

#endif  // ENABLE_WASM_JSPI

// wasm::Context lives in JSContext and contains the wasm-related per-context
// state.

class Context {
 public:
  Context();
  ~Context();

  static constexpr size_t offsetOfStackLimit() {
    return offsetof(Context, stackLimit);
  }
  void initStackLimit(JSContext* cx);

#ifdef ENABLE_WASM_JSPI
  static constexpr size_t offsetOfCurrentStack() {
    return offsetof(Context, currentStack_);
  }
  static constexpr size_t offsetOfBaseHandlers() {
    return offsetof(Context, baseHandlers_);
  }
  static constexpr size_t offsetOfMainStackTarget() {
    return offsetof(Context, mainStackTarget_);
  }
#  ifdef _WIN32
  static constexpr size_t offsetOfTib() { return offsetof(Context, tib_); }

  // Load the current TIB stack fields and refresh our cached fields.
  void updateWin32TibFields();
#  endif

  ContStack* currentStack() { return currentStack_; }
  bool onContStack() const { return currentStack_ != nullptr; }
  const ContStackVector& stacks() const { return stacks_; }

  const StackTarget& mainStackTarget() const { return mainStackTarget_; }

  // Perform a linear search to find the stack that matches stack address. This
  // can be slow if there are many continuations.
  ContStack* findStackForAddress(JSContext* cx, uintptr_t stackAddress);
#endif  // ENABLE_WASM_JSPI

  // Used by wasm::EnsureThreadSignalHandlers(cx) to install thread signal
  // handlers once per JSContext/thread.
  bool triedToInstallSignalHandlers;
  bool haveSignalHandlers;

  // Like JSContext::jitStackLimit but used for wasm code. Wasm code doesn't
  // use the stack limit for interrupts, but it does update it for stack
  // switching.
  JS::NativeStackLimit stackLimit;

 private:
#ifdef ENABLE_WASM_JSPI
  // A stack target for use when switching to the main stack.
  StackTarget mainStackTarget_;

#  if defined(_WIN32)
  // On WIN64, the Thread Information Block stack limits must be updated on
  // stack switches to avoid failures on SP checks during vectored exeption
  // handling for traps. We cache the TIB here for easy manipulation.
  _NT_TIB* tib_ = nullptr;
#  endif

  // The currently active continuation. Null if we're executing on the
  // main stack, otherwise we're on a continuation stack. This is a non owning
  // pointer.
  ContStack* currentStack_;
  // The handlers pushed on the main stack to enter onto the current stack of
  // continuations. A cached version of currentStack_->findBaseHandlers().
  //
  // Non-null iff we are on a continuation's stack. Handlers are always the
  // last thing pushed on a stack before a `resume`, and so this also doubles
  // as the last SP value on the main stack before we switching into
  // continuation stacks. Wasm exits into VM code use this value to switch back
  // to the main stack.
  //
  // A continuation can call into VM/JS code on the main stack, which can then
  // call into a new stack of continuations. The switch to the main stack saves
  // and restores these fields, and we only track the top-most values for these
  // fields.
  Handlers* baseHandlers_;

  // All of the allocated continuation stacks. These are non-owning pointers
  // managed by ContStack.
  ContStackVector stacks_;

  // Let ContStack::registerSelf/unregisterSelf mutate the vector.
  friend ContStack;
#endif
};

}  // namespace js::wasm

#endif  // wasm_context_h
