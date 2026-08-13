/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/riscv64/MoveEmitter-riscv64.h"

#include "jit/riscv64/Assembler-riscv64.h"

#include "jit/MacroAssembler-inl.h"

using namespace js;
using namespace js::jit;

void MoveEmitterRiscv64::breakCycle(const MoveOperand& to, MoveOp::Type type) {
  // There is some pattern:
  //   (A -> B)
  //   (B -> A)
  //
  // This case handles (A -> B), which we reach first. We save B, then allow
  // the original move to continue.
  if (cycleGeneralReg_ != InvalidReg) {
    switch (type) {
      case MoveOp::FLOAT32:
        if (to.isMemory()) {
          masm.load32(getAdjustedAddress(to), cycleGeneralReg_);
        } else {
          masm.moveFloat32ToGPR(to.floatReg(), cycleGeneralReg_);
        }
        break;
      case MoveOp::DOUBLE:
        if (to.isMemory()) {
          masm.loadPtr(getAdjustedAddress(to), cycleGeneralReg_);
        } else {
          masm.moveDoubleToGPR64(to.floatReg(), Register64(cycleGeneralReg_));
        }
        break;
      case MoveOp::INT32:
        if (to.isMemory()) {
          masm.load32(getAdjustedAddress(to), cycleGeneralReg_);
        } else {
          masm.move32(to.reg(), cycleGeneralReg_);
        }
        break;
      case MoveOp::GENERAL:
        if (to.isMemory()) {
          masm.loadPtr(getAdjustedAddress(to), cycleGeneralReg_);
        } else {
          masm.movePtr(to.reg(), cycleGeneralReg_);
        }
        break;
      default:
        MOZ_CRASH("Unexpected move type");
    }
  } else {
    switch (type) {
      case MoveOp::FLOAT32:
        if (to.isMemory()) {
          ScratchFloat32Scope fpscratch32(masm);
          masm.loadFloat32(getAdjustedAddress(to), fpscratch32);
          masm.storeFloat32(fpscratch32, cycleSlot());
        } else {
          masm.storeFloat32(to.floatReg(), cycleSlot());
        }
        break;
      case MoveOp::DOUBLE:
        if (to.isMemory()) {
          ScratchDoubleScope fpscratch64(masm);
          masm.loadDouble(getAdjustedAddress(to), fpscratch64);
          masm.storeDouble(fpscratch64, cycleSlot());
        } else {
          masm.storeDouble(to.floatReg(), cycleSlot());
        }
        break;
      case MoveOp::INT32:
        if (to.isMemory()) {
          UseScratchRegisterScope temps(&masm);
          Register scratch2 = temps.Acquire();
          masm.load32(getAdjustedAddress(to), scratch2);
          masm.store32(scratch2, cycleSlot());
        } else {
          masm.store32(to.reg(), cycleSlot());
        }
        break;
      case MoveOp::GENERAL:
        if (to.isMemory()) {
          UseScratchRegisterScope temps(&masm);
          Register scratch2 = temps.Acquire();
          masm.loadPtr(getAdjustedAddress(to), scratch2);
          masm.storePtr(scratch2, cycleSlot());
        } else {
          masm.storePtr(to.reg(), cycleSlot());
        }
        break;
      default:
        MOZ_CRASH("Unexpected move type");
    }
  }
}

void MoveEmitterRiscv64::completeCycle(const MoveOperand& from,
                                       const MoveOperand& to,
                                       MoveOp::Type type) {
  // There is some pattern:
  //   (A -> B)
  //   (B -> A)
  //
  // This case handles (B -> A), which we reach last. We emit a move from the
  // saved value of B, to A.
  if (cycleGeneralReg_ != InvalidReg) {
    switch (type) {
      case MoveOp::FLOAT32:
        if (to.isMemory()) {
          masm.store32(cycleGeneralReg_, getAdjustedAddress(to));
        } else {
          masm.moveGPRToFloat32(cycleGeneralReg_, to.floatReg());
        }
        break;
      case MoveOp::DOUBLE:
        if (to.isMemory()) {
          masm.storePtr(cycleGeneralReg_, getAdjustedAddress(to));
        } else {
          masm.moveGPR64ToDouble(Register64(cycleGeneralReg_), to.floatReg());
        }
        break;
      case MoveOp::INT32:
        if (to.isMemory()) {
          masm.store32(cycleGeneralReg_, getAdjustedAddress(to));
        } else {
          masm.move32(cycleGeneralReg_, to.reg());
        }
        break;
      case MoveOp::GENERAL:
        if (to.isMemory()) {
          masm.storePtr(cycleGeneralReg_, getAdjustedAddress(to));
        } else {
          masm.movePtr(cycleGeneralReg_, to.reg());
        }
        break;
      default:
        MOZ_CRASH("Unexpected move type");
    }
  } else {
    switch (type) {
      case MoveOp::FLOAT32:
        if (to.isMemory()) {
          ScratchFloat32Scope fpscratch32(masm);
          masm.loadFloat32(cycleSlot(), fpscratch32);
          masm.storeFloat32(fpscratch32, getAdjustedAddress(to));
        } else {
          masm.loadFloat32(cycleSlot(), to.floatReg());
        }
        break;
      case MoveOp::DOUBLE:
        if (to.isMemory()) {
          ScratchDoubleScope fpscratch64(masm);
          masm.loadDouble(cycleSlot(), fpscratch64);
          masm.storeDouble(fpscratch64, getAdjustedAddress(to));
        } else {
          masm.loadDouble(cycleSlot(), to.floatReg());
        }
        break;
      case MoveOp::INT32:
        if (to.isMemory()) {
          UseScratchRegisterScope temps(&masm);
          Register scratch2 = temps.Acquire();
          masm.load32(cycleSlot(), scratch2);
          masm.store32(scratch2, getAdjustedAddress(to));
        } else {
          masm.load32(cycleSlot(), to.reg());
        }
        break;
      case MoveOp::GENERAL:
        if (to.isMemory()) {
          UseScratchRegisterScope temps(&masm);
          Register scratch2 = temps.Acquire();
          masm.loadPtr(cycleSlot(), scratch2);
          masm.storePtr(scratch2, getAdjustedAddress(to));
        } else {
          masm.loadPtr(cycleSlot(), to.reg());
        }
        break;
      default:
        MOZ_CRASH("Unexpected move type");
    }
  }
}

void MoveEmitterRiscv64::emit(const MoveResolver& moves) {
  UseScratchRegisterScope temps(&masm);

  // At least two scratch registers need to be available:
  // - One scratch register for UseScratchRegisterScope uses within the move
  //   emitter itself.
  // - One scratch register for memory loads when the address doesn't fit into
  //   imm12, cf. `MacroAssemblerRiscv64::computeAddress()`.
  MOZ_ASSERT(temps.countAvailable() >= 2);

  if (moves.numCycles()) {
    if (temps.countAvailable() > 2) {
      // We're lucky to have more than two spare scratch registers still
      // available. Grab another one as temporary storage for breaking cycles.
      cycleGeneralReg_ = temps.Acquire();
    } else {
      // Reserve stack for cycle resolution
      static_assert(SpillSlotSize == 8);
      masm.reserveStack(SpillSlotSize);
      pushedAtCycle_ = masm.framePushed();
    }
  }

  for (size_t i = 0; i < moves.numMoves(); i++) {
    emit(moves.getMove(i));
  }

  cycleGeneralReg_ = InvalidReg;
}

void MoveEmitterRiscv64::emit(const MoveOp& move) {
  const MoveOperand& from = move.from();
  const MoveOperand& to = move.to();

  if (move.isCycleBegin()) {
    MOZ_ASSERT(!inCycle_ && !move.isCycleEnd());
    MOZ_ASSERT(move.cycleBeginSlot() == 0);
    breakCycle(to, move.endCycleType());
    inCycle_ = true;
  } else if (move.isCycleEnd()) {
    MOZ_ASSERT(inCycle_);
    MOZ_ASSERT(move.cycleEndSlot() == 0);
    completeCycle(from, to, move.type());
    inCycle_ = false;
    return;
  }

  switch (move.type()) {
    case MoveOp::FLOAT32:
      emitFloat32Move(from, to);
      break;
    case MoveOp::DOUBLE:
      emitDoubleMove(from, to);
      break;
    case MoveOp::INT32:
      emitInt32Move(from, to);
      break;
    case MoveOp::GENERAL:
      emitMove(from, to);
      break;
    default:
      MOZ_CRASH("Unexpected move type");
  }
}

void MoveEmitterRiscv64::emitMove(const MoveOperand& from,
                                  const MoveOperand& to) {
  if (from.isGeneralReg()) {
    if (to.isGeneralReg()) {
      masm.movePtr(from.reg(), to.reg());
    } else if (to.isMemory()) {
      masm.storePtr(from.reg(), getAdjustedAddress(to));
    } else {
      MOZ_CRASH("Invalid emitMove arguments.");
    }
  } else if (from.isMemory()) {
    if (to.isGeneralReg()) {
      masm.loadPtr(getAdjustedAddress(from), to.reg());
    } else if (to.isMemory()) {
      UseScratchRegisterScope temps(&masm);
      Register scratch2 = temps.Acquire();
      masm.loadPtr(getAdjustedAddress(from), scratch2);
      masm.storePtr(scratch2, getAdjustedAddress(to));
    } else {
      MOZ_CRASH("Invalid emitMove arguments.");
    }
  } else if (from.isEffectiveAddress()) {
    if (to.isGeneralReg()) {
      masm.computeEffectiveAddress(getAdjustedAddress(from), to.reg());
    } else if (to.isMemory()) {
      UseScratchRegisterScope temps(&masm);
      Register scratch2 = temps.Acquire();
      masm.computeEffectiveAddress(getAdjustedAddress(from), scratch2);
      masm.storePtr(scratch2, getAdjustedAddress(to));
    } else {
      MOZ_CRASH("Invalid emitMove arguments.");
    }
  } else {
    MOZ_CRASH("Invalid emitMove arguments.");
  }
}

void MoveEmitterRiscv64::emitInt32Move(const MoveOperand& from,
                                       const MoveOperand& to) {
  if (from.isGeneralReg()) {
    if (to.isGeneralReg()) {
      masm.move32(from.reg(), to.reg());
    } else if (to.isMemory()) {
      masm.store32(from.reg(), getAdjustedAddress(to));
    } else {
      MOZ_CRASH("Invalid emitInt32Move arguments.");
    }
  } else if (from.isMemory()) {
    if (to.isGeneralReg()) {
      masm.load32(getAdjustedAddress(from), to.reg());
    } else if (to.isMemory()) {
      UseScratchRegisterScope temps(&masm);
      Register scratch2 = temps.Acquire();
      masm.load32(getAdjustedAddress(from), scratch2);
      masm.store32(scratch2, getAdjustedAddress(to));
    } else {
      MOZ_CRASH("Invalid emitInt32Move arguments.");
    }
  } else if (from.isEffectiveAddress()) {
    if (to.isGeneralReg()) {
      masm.computeEffectiveAddress(getAdjustedAddress(from), to.reg());
    } else if (to.isMemory()) {
      UseScratchRegisterScope temps(&masm);
      Register scratch2 = temps.Acquire();
      masm.computeEffectiveAddress(getAdjustedAddress(from), scratch2);
      masm.store32(scratch2, getAdjustedAddress(to));
    } else {
      MOZ_CRASH("Invalid emitInt32Move arguments.");
    }
  } else {
    MOZ_CRASH("Invalid emitInt32Move arguments.");
  }
}

void MoveEmitterRiscv64::emitFloat32Move(const MoveOperand& from,
                                         const MoveOperand& to) {
  if (from.isFloatReg()) {
    if (to.isFloatReg()) {
      masm.fmv_s(to.floatReg(), from.floatReg());
    } else if (to.isGeneralReg()) {
      // This should only be used when passing float parameter in a1,a2,a3
      MOZ_ASSERT(to.reg() == a1 || to.reg() == a2 || to.reg() == a3);
      masm.fmv_x_w(to.reg(), from.floatReg());
    } else {
      MOZ_ASSERT(to.isMemory());
      masm.storeFloat32(from.floatReg(), getAdjustedAddress(to));
    }
  } else if (to.isFloatReg()) {
    MOZ_ASSERT(from.isMemory());
    masm.loadFloat32(getAdjustedAddress(from), to.floatReg());
  } else if (to.isGeneralReg()) {
    MOZ_ASSERT(from.isMemory());
    // This should only be used when passing float parameter in a1,a2,a3
    MOZ_ASSERT(to.reg() == a1 || to.reg() == a2 || to.reg() == a3);
    masm.loadPtr(getAdjustedAddress(from), to.reg());
  } else {
    MOZ_ASSERT(from.isMemory());
    MOZ_ASSERT(to.isMemory());
    ScratchFloat32Scope fpscratch32(masm);
    masm.loadFloat32(getAdjustedAddress(from), fpscratch32);
    masm.storeFloat32(fpscratch32, getAdjustedAddress(to));
  }
}

void MoveEmitterRiscv64::emitDoubleMove(const MoveOperand& from,
                                        const MoveOperand& to) {
  if (from.isFloatReg()) {
    if (to.isFloatReg()) {
      masm.fmv_d(to.floatReg(), from.floatReg());
    } else if (to.isGeneralReg()) {
      masm.fmv_x_d(to.reg(), from.floatReg());
    } else {
      MOZ_ASSERT(to.isMemory());
      masm.storeDouble(from.floatReg(), getAdjustedAddress(to));
    }
  } else if (to.isFloatReg()) {
    if (from.isMemory()) {
      masm.loadDouble(getAdjustedAddress(from), to.floatReg());
    } else {
      masm.fmv_d_x(to.floatReg(), from.reg());
    }
  } else {
    MOZ_ASSERT(from.isMemory());
    MOZ_ASSERT(to.isMemory());
    ScratchDoubleScope fpscratch64(masm);
    masm.loadDouble(getAdjustedAddress(from), fpscratch64);
    masm.storeDouble(fpscratch64, getAdjustedAddress(to));
  }
}

Address MoveEmitterRiscv64::cycleSlot() const {
  MOZ_ASSERT(pushedAtCycle_ != -1, "pushedAtCycle_ not initialized");
  int32_t offset = masm.framePushed() - pushedAtCycle_;
  return Address(StackPointer, offset);
}

int32_t MoveEmitterRiscv64::getAdjustedOffset(
    const MoveOperand& operand) const {
  MOZ_ASSERT(operand.isMemoryOrEffectiveAddress());
  if (operand.base() != StackPointer) {
    return operand.disp();
  }

  // Adjust offset if stack pointer has been moved.
  return operand.disp() + masm.framePushed() - pushedAtStart_;
}

Address MoveEmitterRiscv64::getAdjustedAddress(
    const MoveOperand& operand) const {
  return Address(operand.base(), getAdjustedOffset(operand));
}

void MoveEmitterRiscv64::finish() {
  assertDone();

  masm.freeStack(masm.framePushed() - pushedAtStart_);
}
