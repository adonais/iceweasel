/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "frontend/BytecodeControlStructures.h"

#include "mozilla/DebugOnly.h"

#include "frontend/BytecodeEmitter.h"   // BytecodeEmitter
#include "frontend/EmitterScope.h"      // EmitterScope
#include "frontend/ForOfLoopControl.h"  // ForOfLoopControl
#include "frontend/SwitchEmitter.h"     // SwitchEmitter
#include "vm/Opcodes.h"                 // JSOp

using namespace js;
using namespace js::frontend;

using mozilla::Maybe;

NestableControl::NestableControl(BytecodeEmitter* bce, StatementKind kind)
    : Nestable<NestableControl>(&bce->innermostNestableControl),
      kind_(kind),
      emitterScope_(bce->innermostEmitterScopeNoCheck()) {}

BreakableControl::BreakableControl(BytecodeEmitter* bce, StatementKind kind)
    : NestableControl(bce, kind) {
  MOZ_ASSERT(is<BreakableControl>());
}

bool BreakableControl::patchBreaks(BytecodeEmitter* bce) {
  return bce->emitJumpTargetAndPatch(breaks);
}

LabelControl::LabelControl(BytecodeEmitter* bce, TaggedParserAtomIndex label,
                           BytecodeOffset startOffset)
    : BreakableControl(bce, StatementKind::Label),
      label_(label),
      startOffset_(startOffset) {}

LoopControl::LoopControl(BytecodeEmitter* bce, StatementKind loopKind)
    : BreakableControl(bce, loopKind), tdzCache_(bce) {
  MOZ_ASSERT(is<LoopControl>());

  LoopControl* enclosingLoop = findNearest<LoopControl>(enclosing());
  loopDepth_ = enclosingLoop ? enclosingLoop->loopDepth_ + 1 : 1;
}

bool LoopControl::emitContinueTarget(BytecodeEmitter* bce) {
  // Note: this is always called after emitting the loop body so we must have
  // emitted all 'continues' by now.
  return bce->emitJumpTargetAndPatch(continues);
}

bool LoopControl::emitLoopHead(BytecodeEmitter* bce,
                               const Maybe<uint32_t>& nextPos) {
  // Insert a Nop if needed to ensure the script does not start with a
  // JSOp::LoopHead. This avoids JIT issues with prologue code + try notes
  // or OSR. See bug 1602390 and bug 1602681.
  if (bce->bytecodeSection().offset().toUint32() == 0) {
    if (!bce->emit1(JSOp::Nop)) {
      return false;
    }
  }

  if (nextPos) {
    if (!bce->updateSourceCoordNotes(*nextPos)) {
      return false;
    }
  }

  MOZ_ASSERT(loopDepth_ > 0);

  head_ = {bce->bytecodeSection().offset()};

  BytecodeOffset off;
  if (!bce->emitJumpTargetOp(JSOp::LoopHead, &off)) {
    return false;
  }
  SetLoopHeadDepthHint(bce->bytecodeSection().code(off), loopDepth_);

  return true;
}

bool LoopControl::emitLoopEnd(BytecodeEmitter* bce, JSOp op,
                              TryNoteKind tryNoteKind) {
  JumpList jump;
  if (!bce->emitJumpNoFallthrough(op, &jump)) {
    return false;
  }
  bce->patchJumpsToTarget(jump, head_);

  // Create a fallthrough for closing iterators, and as a target for break
  // statements.
  JumpTarget breakTarget;
  if (!bce->emitJumpTarget(&breakTarget)) {
    return false;
  }
  if (!patchBreaks(bce)) {
    return false;
  }
  if (!bce->addTryNote(tryNoteKind, bce->bytecodeSection().stackDepth(),
                       headOffset(), breakTarget.offset)) {
    return false;
  }
  return true;
}

DestructuringControl::DestructuringControl(BytecodeEmitter* bce,
                                           SelfHostedIter selfHostedIter)
    : NestableControl(bce, StatementKind::Destructuring),
      selfHostedIter_(selfHostedIter) {
  //                [stack] ... OBJ NEXT ITER DONE
  MOZ_ASSERT(bce->bytecodeSection().stackDepth() >= 4);
}

bool DestructuringControl::emitJumpToIteratorClose(BytecodeEmitter* bce) {
  MOZ_ASSERT(bce->bytecodeSection().stackDepth() == *nonLocalExitStackDepth());
  return bce->emitJump(JSOp::Goto, &returnJumps_);
}

bool DestructuringControl::emitEnd(BytecodeEmitter* bce) {
  //                [stack] ... OBJ NEXT ITER DONE

  // The last DONE value is on top of the stack. If not DONE, call
  // IteratorClose.
  if (!bce->emitDestructuringIteratorClose(selfHostedIter_)) {
    //              [stack] ... OBJ
    return false;
  }

  // If the pattern contains a `yield` expression (eg `[x, y = yield z] = o;`),
  // we have to emit the non-local exit code used for forced returns. We can
  // skip this in the common case when there are no yields.

  if (!returnJumps_.offset.valid()) {
    return true;
  }

  mozilla::DebugOnly<int32_t> normalDepth = bce->bytecodeSection().stackDepth();
  JumpList done;
  if (!bce->emitJumpNoFallthrough(JSOp::Goto, &done)) {
    return false;
  }

  bce->bytecodeSection().setStackDepth(*nonLocalExitStackDepth());
  if (!bce->emitJumpTargetAndPatch(returnJumps_)) {
    return false;
  }

  if (!bce->emitDestructuringIteratorClose(selfHostedIter_)) {
    return false;
  }

  {
    NonLocalExitControl nle(bce, NonLocalExitKind::Return);
    if (!nle.emitNonLocalJump(nullptr, this)) {
      return false;
    }
  }

  MOZ_ASSERT(bce->bytecodeSection().stackDepth() == normalDepth);
  return bce->emitJumpTargetAndPatch(done);
}

TryFinallyControl::TryFinallyControl(BytecodeEmitter* bce, StatementKind kind)
    : NestableControl(bce, kind) {
  MOZ_ASSERT(is<TryFinallyControl>());
}

bool TryFinallyControl::allocateContinuation(NestableControl* target,
                                             NonLocalExitKind kind,
                                             uint32_t* idx) {
  for (uint32_t i = 0; i < continuations_.length(); i++) {
    if (continuations_[i].target_ == target &&
        continuations_[i].kind_ == kind) {
      *idx = i + SpecialContinuations::Count;
      return true;
    }
  }
  *idx = continuations_.length() + SpecialContinuations::Count;
  return continuations_.emplaceBack(target, kind);
}

bool TryFinallyControl::emitContinuations(BytecodeEmitter* bce) {
  SwitchEmitter::TableGenerator tableGen(bce);
  for (uint32_t i = 0; i < continuations_.length(); i++) {
    if (!tableGen.addNumber(i + SpecialContinuations::Count)) {
      return false;
    }
  }
  tableGen.finish(continuations_.length());
  MOZ_RELEASE_ASSERT(tableGen.isValid());

  InternalSwitchEmitter se(bce);
  if (!se.validateCaseCount(continuations_.length())) {
    return false;
  }
  if (!se.emitTable(tableGen)) {
    return false;
  }

  // Continuation index 0 is special-cased to be the fallthrough block.
  // Non-default switch cases are numbered 1-N.
  uint32_t caseIdx = SpecialContinuations::Count;
  for (TryFinallyContinuation& continuation : continuations_) {
    if (!se.emitCaseBody(caseIdx++, tableGen)) {
      return false;
    }
    // Resume the non-local control flow that was intercepted by
    // this finally.
    NonLocalExitControl nle(bce, continuation.kind_);
    if (!nle.emitNonLocalJump(continuation.target_, this)) {
      return false;
    }
  }

  // The only unhandled case is the fallthrough case, which is handled
  // by the switch default.
  if (!se.emitDefaultBody()) {
    return false;
  }
  if (!se.emitEnd()) {
    return false;
  }
  return true;
}

NonLocalExitControl::NonLocalExitControl(BytecodeEmitter* bce,
                                         NonLocalExitKind kind)
    : bce_(bce),
      savedScopeNoteIndex_(bce->bytecodeSection().scopeNoteList().length()),
      savedDepth_(bce->bytecodeSection().stackDepth()),
      openScopeNoteIndex_(bce->innermostEmitterScope()->noteIndex()),
      kind_(kind) {}

NonLocalExitControl::~NonLocalExitControl() {
  for (uint32_t n = savedScopeNoteIndex_;
       n < bce_->bytecodeSection().scopeNoteList().length(); n++) {
    bce_->bytecodeSection().scopeNoteList().recordEnd(
        n, bce_->bytecodeSection().offset());
  }
  bce_->bytecodeSection().setStackDepth(savedDepth_);
}

bool NonLocalExitControl::emitReturn(BytecodeOffset setRvalOffset) {
  MOZ_ASSERT(kind_ == NonLocalExitKind::Return);
  setRvalOffset_ = setRvalOffset;
  return emitNonLocalJump(nullptr);
}

bool NonLocalExitControl::leaveScope(EmitterScope* es) {
  if (!es->leave(bce_, /* nonLocal = */ true)) {
    return false;
  }

  // As we pop each scope due to the non-local jump, emit notes that
  // record the extent of the enclosing scope. These notes will have
  // their ends recorded in ~NonLocalExitControl().
  GCThingIndex enclosingScopeIndex = ScopeNote::NoScopeIndex;
  if (es->enclosingInFrame()) {
    enclosingScopeIndex = es->enclosingInFrame()->index();
  }
  if (!bce_->bytecodeSection().scopeNoteList().append(
          enclosingScopeIndex, bce_->bytecodeSection().offset(),
          openScopeNoteIndex_)) {
    return false;
  }
  openScopeNoteIndex_ = bce_->bytecodeSection().scopeNoteList().length() - 1;

  return true;
}

/*
 * Emit additional bytecode(s) for non-local jumps.
 */
bool NonLocalExitControl::emitNonLocalJump(NestableControl* target,
                                           NestableControl* startingAfter) {
  NestableControl* startingControl = startingAfter
                                         ? startingAfter->enclosing()
                                         : bce_->innermostNestableControl;
  EmitterScope* es = startingAfter ? startingAfter->emitterScope()
                                   : bce_->innermostEmitterScope();

  AutoCheckUnstableEmitterScope cues(bce_);

  // The JS expression stack (ignoring loop iterator values) is usually empty
  // when we get here because `break`, `continue`, and `return` are statements.
  // The only exception is a forced return for a |yield| expression.
#ifdef DEBUG
  bool mayHaveExpressionValues = kind_ == NonLocalExitKind::Return &&
                                 bce_->sc->isFunctionBox() &&
                                 bce_->sc->asFunctionBox()->isGenerator();
#endif
  auto popToStackDepth = [&](int32_t targetDepth,
                             bool hasSubroutineState = false) {
    int32_t npops = bce_->bytecodeSection().stackDepth() - targetDepth;
    MOZ_ASSERT(npops >= 0);
    if (npops == 0) {
      return true;
    }
    MOZ_ASSERT(hasSubroutineState || mayHaveExpressionValues);
    return bce_->emitPopN(npops);
  };

  // Walk the nestable control stack. If a control needs to execute a finally
  // block or close a for-of/destructuring iterator, we defer the rest of the
  // non-local exit until after that cleanup.
  //
  // For try-finally and for-of controls, we use a Continuation to record the
  // information needed to process the remaining outer controls and continue the
  // non-local exit. For destructuring, the only possible non-local exits are
  // returns, so we just track the list of jumps. We then emit a jump to the
  // control's cleanup code and return.
  //
  // After emitting the body of one of these controls, we emit bytecode for the
  // finally block or iterator closing and call emitNonLocalJump to resume the
  // non-local exit from there. This can repeat for enclosing controls until an
  // invocation reaches the end of the loop below and emits the final jump or
  // return.
  //
  // See the ForOfLoopControl class comment for the bytecode structure of
  // for-of iterator closing.
  for (NestableControl* control = startingControl; control != target;
       control = control->enclosing()) {
    // Walk the scope stack and leave the scopes we entered. Leaving a scope
    // may emit administrative ops like JSOp::PopLexicalEnv but never anything
    // that manipulates the stack.
    for (; es != control->emitterScope(); es = es->enclosingInFrame()) {
      if (!leaveScope(es)) {
        return false;
      }
    }

    switch (control->kind()) {
      case StatementKind::Finally: {
        TryFinallyControl& finallyControl = control->as<TryFinallyControl>();
        if (!popToStackDepth(*control->nonLocalExitStackDepth(),
                             finallyControl.emittingSubroutine())) {
          return false;
        }
        if (!finallyControl.emittingSubroutine()) {
          // Jump to the finally block.
          uint32_t idx;
          if (!finallyControl.allocateContinuation(target, kind_, &idx)) {
            return false;
          }
          return bce_->emitJumpToFinally(&finallyControl.finallyJumps_, idx);
        }
        break;
      }

      case StatementKind::Destructuring: {
        MOZ_ASSERT(kind_ == NonLocalExitKind::Return);
        MOZ_ASSERT(!target);
        if (!popToStackDepth(*control->nonLocalExitStackDepth())) {
          return false;
        }
        // Jump to the iterator close code at the end of the destructuring
        // bytecode.
        auto& destructuringControl = control->as<DestructuringControl>();
        return destructuringControl.emitJumpToIteratorClose(bce_);
      }

      case StatementKind::ForOfLoop: {
        if (!popToStackDepth(*control->nonLocalExitStackDepth())) {
          return false;
        }
        // Jump to the iterator close code after the loop body.
        ForOfLoopControl& forOfControl = control->as<ForOfLoopControl>();
        return forOfControl.emitJumpToIteratorClose(bce_, target, kind_);
      }

      case StatementKind::ForInLoop:
        if (!popToStackDepth(*control->nonLocalExitStackDepth())) {
          return false;
        }
        // The iterator and the current value are on the stack. Unlike the
        // for-of case above, we emit the JSOp::EndIter inline because it's a
        // single non-throwing bytecode op, so emitting it in the current
        // try-note region is safe.
        if (!bce_->emit1(JSOp::EndIter)) {
          //        [stack] ...
          return false;
        }
        break;

      default:
        break;
    }
  }

  // Leave intermediate scopes before emitting the final jump.
  EmitterScope* targetEmitterScope =
      target ? target->emitterScope() : bce_->varEmitterScope;
  for (; es != targetEmitterScope; es = es->enclosingInFrame()) {
    if (!leaveScope(es)) {
      return false;
    }
  }

  // The target's own values are still on the stack.
  MOZ_ASSERT_IF(target && target->nonLocalExitStackDepth().isSome(),
                bce_->bytecodeSection().stackDepth() ==
                    *target->nonLocalExitStackDepth());

  switch (kind_) {
    case NonLocalExitKind::Continue: {
      LoopControl* loop = &target->as<LoopControl>();
      if (!bce_->emitJump(JSOp::Goto, &loop->continues)) {
        return false;
      }
      break;
    }
    case NonLocalExitKind::Break: {
      if (target->is<ForOfLoopControl>()) {
        // A for-of loop that completes normally doesn't close its iterator, so
        // `break` can't use the loop's break target. Jump to the iterator-close
        // code after the loop instead.
        ForOfLoopControl& forOfControl = target->as<ForOfLoopControl>();
        if (!forOfControl.emitJumpToIteratorClose(bce_, target, kind_)) {
          return false;
        }
      } else {
        BreakableControl* breakable = &target->as<BreakableControl>();
        if (!bce_->emitJump(JSOp::Goto, &breakable->breaks)) {
          return false;
        }
      }
      break;
    }
    case NonLocalExitKind::Return:
      MOZ_ASSERT(!target);
      if (!bce_->finishReturn(setRvalOffset_)) {
        return false;
      }
      break;
  }

  return true;
}
