/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_MoveEmitter_x86_shared_h
#define jit_MoveEmitter_x86_shared_h

#include "mozilla/Maybe.h"

#include <stddef.h>
#include <stdint.h>

#include "jit/MoveResolver.h"
#include "jit/Registers.h"

namespace js {
namespace jit {

struct Address;
class MacroAssembler;
class Operand;

class MoveEmitterX86 {
  bool inCycle_;
  MacroAssembler& masm;

  // Original stack push value.
  uint32_t pushedAtStart_;

  // This is a store stack offset for the cycle-break spill slot, snapshotting
  // codegen->framePushed_ at the time it is allocated. -1 if not allocated.
  int32_t pushedAtCycle_;

#ifdef JS_CODEGEN_X86
  // Optional scratch register for performing moves.
  mozilla::Maybe<Register> scratchRegister_;
#endif

  void assertDone() { MOZ_ASSERT(!inCycle_); }
  Address cycleSlot();
  Address toAddress(const MoveOperand& operand) const;
  Operand toOperand(const MoveOperand& operand) const;
  Operand toPopOperand(const MoveOperand& operand) const;

  size_t characterizeCycle(const MoveResolver& moves, size_t i,
                           bool* allGeneralRegs, bool* allFloatRegs);
  bool maybeEmitOptimizedCycle(const MoveResolver& moves, size_t i,
                               bool allGeneralRegs, bool allFloatRegs,
                               size_t swapCount);
  void emitInt32Move(const MoveOperand& from, const MoveOperand& to,
                     const MoveResolver& moves, size_t i);
  void emitGeneralMove(const MoveOperand& from, const MoveOperand& to,
                       const MoveResolver& moves, size_t i);
  void emitFloat32Move(const MoveOperand& from, const MoveOperand& to);
  void emitDoubleMove(const MoveOperand& from, const MoveOperand& to);
  void emitSimd128Move(const MoveOperand& from, const MoveOperand& to);
  void breakCycle(const MoveOperand& to, MoveOp::Type type);
  void completeCycle(const MoveOperand& to, MoveOp::Type type);

  mozilla::Maybe<Register> findScratchRegister(const MoveResolver& moves,
                                               size_t i);

 public:
  explicit MoveEmitterX86(MacroAssembler& masm);
  ~MoveEmitterX86() { assertDone(); }
  void emit(const MoveResolver& moves);
  void finish();

#ifdef JS_CODEGEN_X86
  void setScratchRegister(Register reg) { scratchRegister_.emplace(reg); }
#endif
};

using MoveEmitter = MoveEmitterX86;

}  // namespace jit
}  // namespace js

#endif /* jit_MoveEmitter_x86_shared_h */
