/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_arm64_CodeGenerator_arm64_h
#define jit_arm64_CodeGenerator_arm64_h

#include "jit/arm64/Assembler-arm64.h"
#include "jit/shared/CodeGenerator-shared.h"

namespace js {
namespace jit {

class CodeGeneratorARM64;
class OutOfLineTableSwitch;

using OutOfLineWasmTruncateCheck =
    OutOfLineWasmTruncateCheckBase<CodeGeneratorARM64>;

class CodeGeneratorARM64 : public CodeGeneratorShared {
  friend class MoveResolverARM64;

 protected:
  CodeGeneratorARM64(MIRGenerator* gen, LIRGraph* graph, MacroAssembler* masm,
                     const wasm::CodeMetadata* wasmCodeMeta);

  MoveOperand toMoveOperand(const LAllocation a) const;

  void bailoutIf(Assembler::Condition condition, LSnapshot* snapshot);
  void bailoutIfTest(Assembler::Condition condition, ARMRegister rt,
                     LSnapshot* snapshot);
  void bailoutIfFalseBool(Register reg, LSnapshot* snapshot) {
    masm.test32(reg, Imm32(0xFF));
    return bailoutIf(Assembler::Zero, snapshot);
  }

  void emitBailoutOOL(LSnapshot* snapshot);

  bool generateOutOfLineCode();

  // Emits a branch that directs control flow to the true block if |cond| is
  // true, and the false block if |cond| is false.
  void emitBranch(Assembler::Condition cond, MBasicBlock* ifTrue,
                  MBasicBlock* ifFalse);

  void emitTableSwitchDispatch(MTableSwitch* mir, Register index,
                               Register base);

  void emitBigIntPtrDiv(LBigIntPtrDiv* ins, Register dividend, Register divisor,
                        Register output);
  void emitBigIntPtrMod(LBigIntPtrMod* ins, Register dividend, Register divisor,
                        Register output);

  void generateInvalidateEpilogue();

 public:
  void visitOutOfLineTableSwitch(OutOfLineTableSwitch* ool);
  void visitOutOfLineWasmTruncateCheck(OutOfLineWasmTruncateCheck* ool);
};

using CodeGeneratorSpecific = CodeGeneratorARM64;

}  // namespace jit
}  // namespace js

#endif /* jit_arm64_CodeGenerator_arm64_h */
