/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_riscv64_MoveEmitter_riscv64_h
#define jit_riscv64_MoveEmitter_riscv64_h

#include "mozilla/Assertions.h"

#include "jit/MacroAssembler.h"
#include "jit/riscv64/Architecture-riscv64.h"
namespace js {
namespace jit {

class MacroAssemblerRiscv64;
class MoveResolver;
struct Register;

class MoveEmitterRiscv64 {
  MacroAssembler& masm;

  // Original stack push value.
  uint32_t pushedAtStart_;

  // This stores a stack offset to a spill location, snapshotting
  // `masm.framePushed()` at the time it was allocated. It is -1 if no
  // stack space has been allocated for that particular spill.
  int32_t pushedAtCycle_ = -1;

  // A scratch general register used to break cycles. `InvalidReg` if no cycles
  // are present or no spare scratch registers are available.
  Register cycleGeneralReg_ = InvalidReg;

  bool inCycle_ = false;

  void assertDone() { MOZ_ASSERT(!inCycle_); }

  void emit(const MoveOp& move);
  void emitMove(const MoveOperand& from, const MoveOperand& to);
  void emitInt32Move(const MoveOperand& from, const MoveOperand& to);
  void emitFloat32Move(const MoveOperand& from, const MoveOperand& to);
  void emitDoubleMove(const MoveOperand& from, const MoveOperand& to);

  Address cycleSlot() const;
  int32_t getAdjustedOffset(const MoveOperand& operand) const;
  Address getAdjustedAddress(const MoveOperand& operand) const;

  void breakCycle(const MoveOperand& to, MoveOp::Type type);
  void completeCycle(const MoveOperand& from, const MoveOperand& to,
                     MoveOp::Type type);

 public:
  explicit MoveEmitterRiscv64(MacroAssembler& m)
      : masm(m), pushedAtStart_(masm.framePushed()) {}
  ~MoveEmitterRiscv64() { assertDone(); }

  void emit(const MoveResolver&);
  void finish();
};

typedef MoveEmitterRiscv64 MoveEmitter;

}  // namespace jit
}  // namespace js

#endif /* jit_riscv64_MoveEmitter_riscv64_h */
