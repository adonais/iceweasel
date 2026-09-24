/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "frontend/ForOfLoopControl.h"

#include "frontend/BytecodeEmitter.h"  // BytecodeEmitter
#include "frontend/EmitterScope.h"     // EmitterScope
#include "vm/CompletionKind.h"         // CompletionKind
#include "vm/Opcodes.h"                // JSOp

using namespace js;
using namespace js::frontend;

ForOfLoopControl::ForOfLoopControl(BytecodeEmitter* bce, int32_t iterDepth,
                                   SelfHostedIter selfHostedIter,
                                   IteratorKind iterKind)
    : LoopControl(bce, StatementKind::ForOfLoop),
      iterDepth_(iterDepth),
      selfHostedIter_(selfHostedIter),
      iterKind_(iterKind),
      continuations_(bce->fc) {}

bool ForOfLoopControl::emitBeginCodeNeedingIteratorClose(BytecodeEmitter* bce) {
  tryCatch_.emplace(bce, TryEmitter::Kind::TryCatch,
                    TryEmitter::ControlKind::NonSyntactic);

  if (!tryCatch_->emitTry()) {
    return false;
  }

  return true;
}

bool ForOfLoopControl::prepareForForOfLoopIteration(
    BytecodeEmitter* bce, const EmitterScope* headLexicalEmitterScope,
    bool hasAwaitUsing) {
  MOZ_ASSERT(headLexicalEmitterScope);
  if (headLexicalEmitterScope->hasDisposables()) {
    forOfDisposalEmitter_.emplace(bce, hasAwaitUsing);
    return forOfDisposalEmitter_->prepareForForOfLoopIteration();
  }
  return true;
}

bool ForOfLoopControl::emitEndCodeNeedingIteratorClose(BytecodeEmitter* bce) {
  if (!tryCatch_->emitCatch(TryEmitter::ExceptionStack::Yes)) {
    //              [stack] ITER ... EXCEPTION STACK
    return false;
  }

  // Explicit Resource Management Proposal
  // https://arai-a.github.io/ecma262-compare/?pr=3000&id=sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset
  // Step 9.i.i.1 Set result to
  // Completion(DisposeResources(iterationEnv.[[DisposeCapability]], result)).
  if (forOfDisposalEmitter_.isSome()) {
    //              [stack] ITER ... EXCEPTION STACK
    if (!bce->emit1(JSOp::Swap)) {
      //              [stack] ITER ... STACK EXCEPTION
      return false;
    }
    if (!bce->emit1(JSOp::True)) {
      //              [stack] ITER ... STACK EXCEPTION THROWING
      return false;
    }
    if (!forOfDisposalEmitter_->prepareForForOfIteratorClose()) {
      //              [stack] ITER ... STACK EXCEPTION THROWING
      return false;
    }
    if (!bce->emit1(JSOp::Pop)) {
      //              [stack] ITER ... STACK EXCEPTION
      return false;
    }
    if (!bce->emit1(JSOp::Swap)) {
      //              [stack] ITER ... EXCEPTION STACK
      return false;
    }
  }

  unsigned slotFromTop = bce->bytecodeSection().stackDepth() - iterDepth_;
  if (!bce->emitDupAt(slotFromTop)) {
    //              [stack] ITER ... EXCEPTION STACK ITER
    return false;
  }

  if (!emitIteratorCloseInScope(bce, *bce->innermostEmitterScope(),
                                CompletionKind::Throw)) {
    //              [stack] ITER ... EXCEPTION STACK
    return false;
  }

  if (!bce->emit1(JSOp::ThrowWithStack)) {
    //              [stack] ITER ...
    return false;
  }

  if (!tryCatch_->emitEnd()) {
    return false;
  }

  tryCatch_.reset();

  return true;
}

bool ForOfLoopControl::emitIteratorCloseInScope(BytecodeEmitter* bce,
                                                EmitterScope& currentScope,
                                                CompletionKind completionKind) {
  return bce->emitIteratorCloseInScope(currentScope, iterKind_, completionKind,
                                       selfHostedIter_);
}

bool ForOfLoopControl::emitJumpToIteratorClose(BytecodeEmitter* bce,
                                               NestableControl* target,
                                               NonLocalExitKind kind) {
  //                [stack] NEXT ITER VALUE
  MOZ_ASSERT(bce->bytecodeSection().stackDepth() == *nonLocalExitStackDepth());

  MOZ_ASSERT_IF(target == this, kind == NonLocalExitKind::Break);

  // Look up or create a continuation for this target + kind.
  Continuation* continuation = nullptr;
  for (Continuation& c : continuations_) {
    if (c.target == target && c.kind == kind) {
      continuation = &c;
      break;
    }
  }
  if (!continuation) {
    if (!continuations_.emplaceBack(target, kind)) {
      return false;
    }
    continuation = &continuations_.back();
  }

  return bce->emitJump(JSOp::Goto, &continuation->jumps);
}

bool ForOfLoopControl::emitIteratorCloseForNonLocalExits(BytecodeEmitter* bce) {
  //                [stack] NEXT ITER VALUE
  MOZ_ASSERT(bce->bytecodeSection().stackDepth() == *nonLocalExitStackDepth());

  // This code is emitted after the loop, so this loop's scope is the innermost
  // emitter scope.
  MOZ_ASSERT(bce->innermostEmitterScope() == emitterScope());
  EmitterScope& currentScope = *emitterScope();

  if (!bce->emit1(JSOp::Pop)) {
    //              [stack] NEXT ITER
    return false;
  }

  // Pop the iterator's next method.
  if (!bce->emit1(JSOp::Swap)) {
    //              [stack] ITER NEXT
    return false;
  }
  if (!bce->emit1(JSOp::Pop)) {
    //              [stack] ITER
    return false;
  }

  // Explicit Resource Management Proposal
  // https://arai-a.github.io/ecma262-compare/?pr=3000&id=sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset
  // Step 9.k.i. Set result to
  // Completion(DisposeResources(iterationEnv.[[DisposeCapability]], result)).
  //
  // Dispose the loop head's own resources if it has any.
  mozilla::Maybe<NonLocalIteratorCloseUsingEmitter> disposeBeforeIterClose;
  if (forOfDisposalEmitter_.isSome()) {
    disposeBeforeIterClose.emplace(bce);
    if (!disposeBeforeIterClose->prepareForIteratorClose(currentScope)) {
      //            [stack] EXC-DISPOSE? DISPOSE-THROWING? ITER
      return false;
    }
  }

  if (!bce->emit1(JSOp::Dup)) {
    //              [stack] EXC-DISPOSE? DISPOSE-THROWING? ITER ITER
    return false;
  }

  if (!emitIteratorCloseInScope(bce, currentScope, CompletionKind::Normal)) {
    //              [stack] EXC-DISPOSE? DISPOSE-THROWING? ITER
    return false;
  }

  if (disposeBeforeIterClose.isSome()) {
    if (!disposeBeforeIterClose->emitEnd()) {
      //            [stack] ITER
      return false;
    }
  }

  if (!bce->emit1(JSOp::Pop)) {
    //              [stack]
    return false;
  }

  return true;
}

bool ForOfLoopControl::emitEnd(BytecodeEmitter* bce) {
  if (continuations_.empty()) {
    // No non-local exits.
    return true;
  }

  const int32_t normalDepth = bce->bytecodeSection().stackDepth();
  MOZ_ASSERT(normalDepth == *nonLocalExitStackDepth() - 3);

  JumpList done;
  if (!bce->emitJumpNoFallthrough(JSOp::Goto, &done)) {
    return false;
  }

  const size_t numContinuations = continuations_.length();

  for (const auto& continuation : continuations_) {
    bce->bytecodeSection().setStackDepth(*nonLocalExitStackDepth());
    if (!bce->emitJumpTargetAndPatch(continuation.jumps)) {
      //            [stack] NEXT ITER VALUE
      return false;
    }

    if (!emitIteratorCloseForNonLocalExits(bce)) {
      //            [stack]
      return false;
    }

    if (continuation.target == this) {
      // This loop is the target of the `break`, so jump to `done`.
      if (!bce->emitJumpNoFallthrough(JSOp::Goto, &done)) {
        return false;
      }
    } else {
      // Continue the non-local exit.
      NonLocalExitControl nle(bce, continuation.kind);
      if (!nle.emitNonLocalJump(continuation.target, this)) {
        return false;
      }
    }

    MOZ_RELEASE_ASSERT(continuations_.length() == numContinuations,
                       "iterator closing must not add new continuations");
  }

  bce->bytecodeSection().setStackDepth(normalDepth);
  return bce->emitJumpTargetAndPatch(done);
}
