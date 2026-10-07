/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_none_CodeGenerator_none_h
#define jit_none_CodeGenerator_none_h

#include "jit/shared/CodeGenerator-shared.h"

namespace js {
namespace jit {

class CodeGeneratorNone : public CodeGeneratorShared {
 protected:
  CodeGeneratorNone(MIRGenerator* gen, LIRGraph* graph, MacroAssembler* masm,
                    const wasm::CodeMetadata* wasmCodeMeta)
      : CodeGeneratorShared(gen, graph, masm, wasmCodeMeta) {
    MOZ_CRASH();
  }

  MoveOperand toMoveOperand(LAllocation) const { MOZ_CRASH(); }
  void bailoutIfFalseBool(Register, LSnapshot*) { MOZ_CRASH(); }
  void bailoutIf(Assembler::Condition, LSnapshot*) { MOZ_CRASH(); }
  bool generateOutOfLineCode() { MOZ_CRASH(); }
  void emitTableSwitchDispatch(MTableSwitch*, Register, Register) {
    MOZ_CRASH();
  }
  void emitBigIntPtrDiv(LBigIntPtrDiv*, Register, Register, Register) {
    MOZ_CRASH();
  }
  void emitBigIntPtrMod(LBigIntPtrMod*, Register, Register, Register) {
    MOZ_CRASH();
  }
  void generateInvalidateEpilogue() { MOZ_CRASH(); }
};

using CodeGeneratorSpecific = CodeGeneratorNone;

}  // namespace jit
}  // namespace js

#endif /* jit_none_CodeGenerator_none_h */
