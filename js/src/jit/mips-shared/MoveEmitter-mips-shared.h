/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_mips_shared_MoveEmitter_mips_shared_h
#define jit_mips_shared_MoveEmitter_mips_shared_h

#include "jit/MacroAssembler.h"
#include "jit/MoveResolver.h"

namespace js {
namespace jit {

class MoveEmitterMIPSShared {
 protected:
  MacroAssembler& masm;

  // Original stack push value.
  uint32_t pushedAtStart_;

  // This stores a stack offset to a spill location, snapshotting
  // `masm.framePushed()` at the time it was allocated. It is -1 if no
  // stack space has been allocated for that particular spill.
  int32_t pushedAtCycle_ = -1;

  // Scratch register available for temporary use. It may be assigned
  // InvalidReg.
  Register tempReg_ = InvalidReg;

  uint32_t inCycle_ = 0;

  void assertDone() { MOZ_ASSERT(inCycle_ == 0); }
  Register tempReg();
  Address cycleSlot(uint32_t slot) const;
  int32_t getAdjustedOffset(const MoveOperand& operand) const;
  Address getAdjustedAddress(const MoveOperand& operand) const;

  void emitMove(const MoveOperand& from, const MoveOperand& to);
  void emitInt32Move(const MoveOperand& from, const MoveOperand& to);
  void emitFloat32Move(const MoveOperand& from, const MoveOperand& to);
  virtual void emitDoubleMove(const MoveOperand& from,
                              const MoveOperand& to) = 0;
  virtual void breakCycle(const MoveOperand& to, MoveOp::Type type,
                          uint32_t slot) = 0;
  virtual void completeCycle(const MoveOperand& from, const MoveOperand& to,
                             MoveOp::Type type, uint32_t slot) = 0;
  void emit(const MoveOp& move);

 public:
  explicit MoveEmitterMIPSShared(MacroAssembler& masm)
      : masm(masm), pushedAtStart_(masm.framePushed()) {}
  ~MoveEmitterMIPSShared() { assertDone(); }
  void emit(const MoveResolver& moves);
  void finish();
};

}  // namespace jit
}  // namespace js

#endif /* jit_mips_shared_MoveEmitter_mips_shared_h */
