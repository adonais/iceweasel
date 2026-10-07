/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_x86_shared_CodeGenerator_x86_shared_h
#define jit_x86_shared_CodeGenerator_x86_shared_h

#include "jit/shared/CodeGenerator-shared.h"
#include "js/ScalarType.h"  // js::Scalar::Type

namespace js {
namespace jit {

class CodeGeneratorX86Shared;
class ModOverflowCheck;
class OutOfLineTableSwitch;

using OutOfLineWasmTruncateCheck =
    OutOfLineWasmTruncateCheckBase<CodeGeneratorX86Shared>;

class CodeGeneratorX86Shared : public CodeGeneratorShared {
  friend class MoveResolverX86;

 protected:
  CodeGeneratorX86Shared(MIRGenerator* gen, LIRGraph* graph,
                         MacroAssembler* masm,
                         const wasm::CodeMetadata* wasmCodeMeta);

  Operand ToOperand(const LAllocation& a);
  Operand ToOperand(const LAllocation* a);

#ifdef JS_PUNBOX64
  Operand ToOperandOrRegister64(const LInt64Allocation& input);
#else
  Register64 ToOperandOrRegister64(const LInt64Allocation& input);
#endif

  MoveOperand toMoveOperand(LAllocation a) const;

  void bailoutIf(Assembler::Condition condition, LSnapshot* snapshot);
  void bailoutIf(Assembler::DoubleCondition condition, LSnapshot* snapshot);
  void bailoutIfFalseBool(Register reg, LSnapshot* snapshot) {
    masm.test32(reg, Imm32(0xFF));
    bailoutIf(Assembler::Zero, snapshot);
  }

  void emitBailoutOOL(LSnapshot* snapshot);

  bool generateOutOfLineCode();

  // Emits a branch that directs control flow to the true block if |cond| is
  // true, and the false block if |cond| is false.
  void emitBranch(Assembler::Condition cond, MBasicBlock* ifTrue,
                  MBasicBlock* ifFalse);
  void emitBranch(Assembler::DoubleCondition cond, MBasicBlock* ifTrue,
                  MBasicBlock* ifFalse, Assembler::NaNCond ifNaN);

  void emitTableSwitchDispatch(MTableSwitch* mir, Register index,
                               Register base);

  // Emit out-of-line code to zero |output| if |rhs| is zero. Used for truncated
  // division and modulus instructions.
  OutOfLineCode* emitOutOfLineZeroForDivideByZero(Register rhs,
                                                  Register output);

  void generateInvalidateEpilogue();

  template <typename T>
  Operand toMemoryAccessOperand(T* lir, int32_t disp);

 public:
  void emitUndoALUOperationOOL(LInstruction* ins);

  // Out of line visitors.
  void visitModOverflowCheck(ModOverflowCheck* ool);
  void visitOutOfLineTableSwitch(OutOfLineTableSwitch* ool);
  void visitOutOfLineWasmTruncateCheck(OutOfLineWasmTruncateCheck* ool);
};

}  // namespace jit
}  // namespace js

#endif /* jit_x86_shared_CodeGenerator_x86_shared_h */
