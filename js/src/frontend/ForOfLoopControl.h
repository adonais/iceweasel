/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef frontend_ForOfLoopControl_h
#define frontend_ForOfLoopControl_h

#include "mozilla/Maybe.h"  // mozilla::Maybe

#include <stdint.h>  // int32_t, uint32_t

#include "frontend/BytecodeControlStructures.h"  // NestableControl, LoopControl
#include "frontend/IteratorKind.h"               // IteratorKind
#include "frontend/JumpList.h"                   // JumpList
#include "frontend/SelfHostedIter.h"             // SelfHostedIter
#include "frontend/TryEmitter.h"                 // TryEmitter
#include "frontend/UsingEmitter.h"               // ForOfDisposalEmitter
#include "js/AllocPolicy.h"                      // TempAllocPolicy
#include "js/Vector.h"                           // js::Vector
#include "vm/CompletionKind.h"                   // CompletionKind

namespace js {
namespace frontend {

struct BytecodeEmitter;
class BytecodeOffset;
class EmitterScope;

class ForOfLoopControl : public LoopControl {
  // The stack depth of the iterator.
  int32_t iterDepth_;

  // For-of loops, when throwing from non-iterator code (i.e. from the body
  // or from evaluating the LHS of the loop condition), need to call
  // IteratorClose.  This is done by enclosing the body of the loop with
  // try-catch and calling IteratorClose in the `catch` block.
  //
  // For non-local exits like `break` and `return`, we associate each exit with
  // a Continuation. We emit a separate IteratorClose section for each
  // Continuation after the loop body and the try-catch. This ensures we don't
  // try to close the iterator a second time if IteratorClose throws an
  // exception.
  //
  //   for (x of y) {
  //     // Operations for iterator (IteratorNext etc) are outside of
  //     // try-block.
  //     try {
  //       ...
  //       if (...) goto close-for-break;  // `break` continuation
  //       if (...) goto close-for-return; // `return` continuation
  //     } catch (e) {
  //       // When propagating an exception, we swallow any exceptions
  //       // thrown while closing the iterator.
  //       CloseIter(iter, CompletionKind::Throw);
  //       throw e;
  //     }
  //   }
  //   goto done;
  //   close-for-break:
  //     CloseIter(iter, CompletionKind::Normal);
  //     goto done;
  //   close-for-return:
  //     CloseIter(iter, CompletionKind::Normal);
  //     ... remaining return bytecode ...
  //   done:
  mozilla::Maybe<TryEmitter> tryCatch_;

  SelfHostedIter selfHostedIter_;

  IteratorKind iterKind_;

  mozilla::Maybe<ForOfDisposalEmitter> forOfDisposalEmitter_;

  // A non-local exit out of this loop must close the iterator. Exits with the
  // same (target, kind) pair share a Continuation.
  struct Continuation {
    NestableControl* target;
    NonLocalExitKind kind;
    JumpList jumps;

    Continuation(NestableControl* target, NonLocalExitKind kind)
        : target(target), kind(kind) {}
  };
  Vector<Continuation, 2, TempAllocPolicy> continuations_;

  [[nodiscard]] bool emitIteratorCloseForNonLocalExits(BytecodeEmitter* bce);

 public:
  ForOfLoopControl(BytecodeEmitter* bce, int32_t iterDepth,
                   SelfHostedIter selfHostedIter, IteratorKind iterKind);

  [[nodiscard]] bool prepareForForOfLoopIteration(
      BytecodeEmitter* bce, const EmitterScope* headLexicalEmitterScope,
      bool hasAwaitUsing);

  [[nodiscard]] bool emitBeginCodeNeedingIteratorClose(BytecodeEmitter* bce);
  [[nodiscard]] bool emitEndCodeNeedingIteratorClose(BytecodeEmitter* bce);

  [[nodiscard]] bool emitIteratorCloseInScope(BytecodeEmitter* bce,
                                              EmitterScope& currentScope,
                                              CompletionKind completionKind);
  [[nodiscard]] bool emitJumpToIteratorClose(BytecodeEmitter* bce,
                                             NestableControl* target,
                                             NonLocalExitKind kind);
  [[nodiscard]] bool emitEnd(BytecodeEmitter* bce);
};
template <>
inline bool NestableControl::is<ForOfLoopControl>() const {
  return kind_ == StatementKind::ForOfLoop;
}

} /* namespace frontend */
} /* namespace js */

#endif /* frontend_ForOfLoopControl_h */
