/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/loong64/disasm/Disasm-loong64.h"

#include "mozilla/IntegerPrintfMacros.h"

#include <stdarg.h>
#include <stdio.h>

#include "jit/loong64/Assembler-loong64.h"

namespace js::jit::disasm {
namespace {

constexpr uint32_t OpcodeMask(uint32_t bits) {
  return UINT32_MAX << (32 - bits);
}

constexpr uint32_t Extract(uint32_t word, uint32_t shift, uint32_t bits) {
  return (word >> shift) & ((uint32_t(1) << bits) - 1);
}

constexpr int32_t SignExtend(uint32_t value, uint32_t bits) {
  return int32_t(value << (32 - bits)) >> (32 - bits);
}

static void MOZ_FORMAT_PRINTF(2, 3)
    FormatTo(mozilla::Span<char> output, const char* format, ...) {
  if (output.empty()) {
    return;
  }

  va_list args;
  va_start(args, format);
  vsnprintf(output.data(), output.size(), format, args);
  va_end(args);
}

class Decoder {
 public:
  Decoder(const NameConverter& converter, mozilla::Span<char> output)
      : converter_(converter), output_(output) {}

  int disassemble(const Instruction* instruction) const;

 private:
  const char* cpu(uint32_t reg) const {
    return converter_.nameOfCPURegister(reg);
  }
  const char* fpu(uint32_t reg) const {
    return converter_.nameOfFPURegister(reg);
  }
  const char* target(const Instruction* instruction, int32_t offset) const {
    uintptr_t address = reinterpret_cast<uintptr_t>(instruction) + offset;
    return converter_.nameOfAddress(reinterpret_cast<const uint8_t*>(address));
  }

  bool formatRdRjRk(const char* mnemonic, uint32_t word) const;
  bool formatRdRkRj(const char* mnemonic, uint32_t word) const;
  bool formatRdRj(const char* mnemonic, uint32_t word) const;
  bool formatFcsrRj(const char* mnemonic, uint32_t word) const;
  bool formatRdFcsr(const char* mnemonic, uint32_t word) const;
  bool formatRdRjSigned12(const char* mnemonic, uint32_t word) const;
  bool formatRdRjUnsigned12(const char* mnemonic, uint32_t word) const;
  bool formatRdRjSigned14Scaled(const char* mnemonic, uint32_t word) const;
  bool formatRdRjSigned16(const char* mnemonic, uint32_t word) const;
  bool formatRdSigned20(const char* mnemonic, uint32_t word) const;
  bool formatRdRjUnsigned5(const char* mnemonic, uint32_t word) const;
  bool formatRdRjUnsigned6(const char* mnemonic, uint32_t word) const;
  bool formatRdRjRkSa2(const char* mnemonic, uint32_t word) const;
  bool formatRdRjRkSa2PlusOne(const char* mnemonic, uint32_t word) const;
  bool formatRdRjRkSa3(const char* mnemonic, uint32_t word) const;
  bool formatRdRjMsbWLsbW(const char* mnemonic, uint32_t word) const;
  bool formatRdRjMsbDLsbD(const char* mnemonic, uint32_t word) const;
  bool formatFdFjFk(const char* mnemonic, uint32_t word) const;
  bool formatFdFj(const char* mnemonic, uint32_t word) const;
  bool formatFdFjFkFa(const char* mnemonic, uint32_t word) const;
  bool formatFdFjFkCa(const char* mnemonic, uint32_t word) const;
  bool formatFdRj(const char* mnemonic, uint32_t word) const;
  bool formatRdFj(const char* mnemonic, uint32_t word) const;
  bool formatFdRjRk(const char* mnemonic, uint32_t word) const;
  bool formatFdRjSigned12(const char* mnemonic, uint32_t word) const;
  bool formatCdFj(const char* mnemonic, uint32_t word) const;
  bool formatFdCj(const char* mnemonic, uint32_t word) const;
  bool formatCdRj(const char* mnemonic, uint32_t word) const;
  bool formatRdCj(const char* mnemonic, uint32_t word) const;
  bool formatCdFjFk(const char* mnemonic, uint32_t word) const;
  bool formatHintRjSigned12(const char* mnemonic, uint32_t word) const;
  bool formatUnsigned15(const char* mnemonic, uint32_t word) const;
  bool formatBranch16(const char* mnemonic, const Instruction* instruction,
                      uint32_t word) const;
  bool formatBranch21(const char* mnemonic, const Instruction* instruction,
                      uint32_t word) const;
  bool formatBcz(const Instruction* instruction, uint32_t word) const;
  bool formatBranch26(const char* mnemonic, const Instruction* instruction,
                      uint32_t word) const;
  bool formatRdRjBranch16(const char* mnemonic, uint32_t word) const;
  bool formatFCompare(bool isDouble, uint32_t word) const;

  bool decodeOp6(const Instruction* instruction) const;
  bool decodeOp7(const Instruction* instruction) const;
  bool decodeOp8(const Instruction* instruction) const;
  bool decodeOp10(const Instruction* instruction) const;
  bool decodeOp11(const Instruction* instruction) const;
  bool decodeOp12(const Instruction* instruction) const;
  bool decodeOp14(const Instruction* instruction) const;
  bool decodeOp15(const Instruction* instruction) const;
  bool decodeOp16(const Instruction* instruction) const;
  bool decodeOp17(const Instruction* instruction) const;
  bool decodeOp22(const Instruction* instruction) const;
  bool decodeOp24(const Instruction* instruction) const;

  const NameConverter& converter_;
  mozilla::Span<char> output_;
};

bool Decoder::formatRdRjRk(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %s", mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           cpu(Extract(word, RKShift, RKBits)));
  return true;
}

bool Decoder::formatRdRkRj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %s", mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RKShift, RKBits)),
           cpu(Extract(word, RJShift, RJBits)));
  return true;
}

bool Decoder::formatRdRj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s", mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)));
  return true;
}

bool Decoder::formatFcsrRj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s $fcsr%" PRIu32 ", %s", mnemonic,
           Extract(word, FDShift, FDBits), cpu(Extract(word, RJShift, RJBits)));
  return true;
}

bool Decoder::formatRdFcsr(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, $fcsr%" PRIu32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)), Extract(word, FJShift, FJBits));
  return true;
}

bool Decoder::formatRdRjSigned12(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %" PRId32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           SignExtend(Extract(word, Imm12Shift, Imm12Bits), 12));
  return true;
}

bool Decoder::formatRdRjUnsigned12(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, 0x%" PRIx32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           Extract(word, Imm12Shift, Imm12Bits));
  return true;
}

bool Decoder::formatRdRjSigned14Scaled(const char* mnemonic,
                                       uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %" PRId32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           SignExtend(Extract(word, Imm14Shift, Imm14Bits), 14) * 4);
  return true;
}

bool Decoder::formatRdRjSigned16(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %" PRId32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           SignExtend(Extract(word, Imm16Shift, Imm16Bits), 16));
  return true;
}

bool Decoder::formatRdSigned20(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %" PRId32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           SignExtend(Extract(word, Imm20Shift, Imm20Bits), 20));
  return true;
}

bool Decoder::formatRdRjUnsigned5(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, 0x%" PRIx32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           Extract(word, Imm5Shift, Imm5Bits));
  return true;
}

bool Decoder::formatRdRjUnsigned6(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, 0x%" PRIx32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           Extract(word, Imm6Shift, Imm6Bits));
  return true;
}

bool Decoder::formatRdRjRkSa2(const char* mnemonic, uint32_t word) const {
  FormatTo(
      output_, "%-12s %s, %s, %s, 0x%" PRIx32, mnemonic,
      cpu(Extract(word, RDShift, RDBits)), cpu(Extract(word, RJShift, RJBits)),
      cpu(Extract(word, RKShift, RKBits)), Extract(word, SAShift, SA2Bits));
  return true;
}

bool Decoder::formatRdRjRkSa2PlusOne(const char* mnemonic,
                                     uint32_t word) const {
  FormatTo(
      output_, "%-12s %s, %s, %s, 0x%" PRIx32, mnemonic,
      cpu(Extract(word, RDShift, RDBits)), cpu(Extract(word, RJShift, RJBits)),
      cpu(Extract(word, RKShift, RKBits)), Extract(word, SAShift, SA2Bits) + 1);
  return true;
}

bool Decoder::formatRdRjRkSa3(const char* mnemonic, uint32_t word) const {
  FormatTo(
      output_, "%-12s %s, %s, %s, 0x%" PRIx32, mnemonic,
      cpu(Extract(word, RDShift, RDBits)), cpu(Extract(word, RJShift, RJBits)),
      cpu(Extract(word, RKShift, RKBits)), Extract(word, SAShift, SA3Bits));
  return true;
}

bool Decoder::formatRdRjMsbWLsbW(const char* mnemonic, uint32_t word) const {
  FormatTo(
      output_, "%-12s %s, %s, 0x%" PRIx32 ", 0x%" PRIx32, mnemonic,
      cpu(Extract(word, RDShift, RDBits)), cpu(Extract(word, RJShift, RJBits)),
      Extract(word, MSBWShift, MSBWBits), Extract(word, LSBWShift, LSBWBits));
  return true;
}

bool Decoder::formatRdRjMsbDLsbD(const char* mnemonic, uint32_t word) const {
  FormatTo(
      output_, "%-12s %s, %s, 0x%" PRIx32 ", 0x%" PRIx32, mnemonic,
      cpu(Extract(word, RDShift, RDBits)), cpu(Extract(word, RJShift, RJBits)),
      Extract(word, MSBDShift, MSBDBits), Extract(word, LSBDShift, LSBDBits));
  return true;
}

bool Decoder::formatFdFjFk(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %s", mnemonic,
           fpu(Extract(word, FDShift, FDBits)),
           fpu(Extract(word, FJShift, FJBits)),
           fpu(Extract(word, FKShift, FKBits)));
  return true;
}

bool Decoder::formatFdFj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s", mnemonic,
           fpu(Extract(word, FDShift, FDBits)),
           fpu(Extract(word, FJShift, FJBits)));
  return true;
}

bool Decoder::formatFdFjFkFa(const char* mnemonic, uint32_t word) const {
  FormatTo(
      output_, "%-12s %s, %s, %s, %s", mnemonic,
      fpu(Extract(word, FDShift, FDBits)), fpu(Extract(word, FJShift, FJBits)),
      fpu(Extract(word, FKShift, FKBits)), fpu(Extract(word, FAShift, FABits)));
  return true;
}

bool Decoder::formatFdFjFkCa(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %s, $fcc%" PRIu32, mnemonic,
           fpu(Extract(word, FDShift, FDBits)),
           fpu(Extract(word, FJShift, FJBits)),
           fpu(Extract(word, FKShift, FKBits)), Extract(word, CAShift, CABits));
  return true;
}

bool Decoder::formatFdRj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s", mnemonic,
           fpu(Extract(word, FDShift, FDBits)),
           cpu(Extract(word, RJShift, RJBits)));
  return true;
}

bool Decoder::formatRdFj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s", mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           fpu(Extract(word, FJShift, FJBits)));
  return true;
}

bool Decoder::formatFdRjRk(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %s", mnemonic,
           fpu(Extract(word, FDShift, FDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           cpu(Extract(word, RKShift, RKBits)));
  return true;
}

bool Decoder::formatFdRjSigned12(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %" PRId32, mnemonic,
           fpu(Extract(word, FDShift, FDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           SignExtend(Extract(word, Imm12Shift, Imm12Bits), 12));
  return true;
}

bool Decoder::formatCdFj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s $fcc%" PRIu32 ", %s", mnemonic,
           Extract(word, CDShift, CDBits), fpu(Extract(word, FJShift, FJBits)));
  return true;
}

bool Decoder::formatFdCj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, $fcc%" PRIu32, mnemonic,
           fpu(Extract(word, FDShift, FDBits)), Extract(word, CJShift, CJBits));
  return true;
}

bool Decoder::formatCdRj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s $fcc%" PRIu32 ", %s", mnemonic,
           Extract(word, CDShift, CDBits), cpu(Extract(word, RJShift, RJBits)));
  return true;
}

bool Decoder::formatRdCj(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, $fcc%" PRIu32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)), Extract(word, CJShift, CJBits));
  return true;
}

bool Decoder::formatCdFjFk(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s $fcc%" PRIu32 ", %s, %s", mnemonic,
           Extract(word, CDShift, CDBits), fpu(Extract(word, FJShift, FJBits)),
           fpu(Extract(word, FKShift, FKBits)));
  return true;
}

bool Decoder::formatHintRjSigned12(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s 0x%" PRIx32 ", %s, %" PRId32, mnemonic,
           Extract(word, RDShift, RDBits), cpu(Extract(word, RJShift, RJBits)),
           SignExtend(Extract(word, Imm12Shift, Imm12Bits), 12));
  return true;
}

bool Decoder::formatUnsigned15(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s 0x%" PRIx32, mnemonic, Extract(word, 0, 15));
  return true;
}

bool Decoder::formatBranch16(const char* mnemonic,
                             const Instruction* instruction,
                             uint32_t word) const {
  int32_t offset = SignExtend(Extract(word, Imm16Shift, Imm16Bits), 16) * 4;
  FormatTo(output_, "%-12s %s, %s, %" PRId32 " -> %s", mnemonic,
           cpu(Extract(word, RJShift, RJBits)),
           cpu(Extract(word, RDShift, RDBits)), offset,
           target(instruction, offset));
  return true;
}

bool Decoder::formatBranch21(const char* mnemonic,
                             const Instruction* instruction,
                             uint32_t word) const {
  uint32_t encoded =
      Extract(word, Imm16Shift, Imm16Bits) | (Extract(word, 0, 5) << 16);
  int32_t offset = SignExtend(encoded, 21) * 4;
  FormatTo(output_, "%-12s %s, %" PRId32 " -> %s", mnemonic,
           cpu(Extract(word, RJShift, RJBits)), offset,
           target(instruction, offset));
  return true;
}

bool Decoder::formatBcz(const Instruction* instruction, uint32_t word) const {
  uint32_t condition = Extract(word, 8, 2);
  if (condition > 1) {
    return false;
  }
  uint32_t encoded =
      Extract(word, Imm16Shift, Imm16Bits) | (Extract(word, 0, 5) << 16);
  int32_t offset = SignExtend(encoded, 21) * 4;
  FormatTo(output_, "%-12s $fcc%" PRIu32 ", %" PRId32 " -> %s",
           condition == 1 ? "bcnez" : "bceqz", Extract(word, CJShift, CJBits),
           offset, target(instruction, offset));
  return true;
}

bool Decoder::formatBranch26(const char* mnemonic,
                             const Instruction* instruction,
                             uint32_t word) const {
  uint32_t encoded =
      Extract(word, Imm16Shift, Imm16Bits) | (Extract(word, 0, 10) << 16);
  int32_t offset = SignExtend(encoded, 26) * 4;
  FormatTo(output_, "%-12s %" PRId32 " -> %s", mnemonic, offset,
           target(instruction, offset));
  return true;
}

bool Decoder::formatRdRjBranch16(const char* mnemonic, uint32_t word) const {
  FormatTo(output_, "%-12s %s, %s, %" PRId32, mnemonic,
           cpu(Extract(word, RDShift, RDBits)),
           cpu(Extract(word, RJShift, RJBits)),
           SignExtend(Extract(word, Imm16Shift, Imm16Bits), 16) * 4);
  return true;
}

bool Decoder::formatFCompare(bool isDouble, uint32_t word) const {
  switch (Extract(word, CONDShift, CONDBits)) {
    case AssemblerLOONG64::COR:
      return formatCdFjFk(isDouble ? "fcmp.cor.d" : "fcmp.cor.s", word);
    case AssemblerLOONG64::CEQ:
      return formatCdFjFk(isDouble ? "fcmp.ceq.d" : "fcmp.ceq.s", word);
    case AssemblerLOONG64::CNE:
      return formatCdFjFk(isDouble ? "fcmp.cne.d" : "fcmp.cne.s", word);
    case AssemblerLOONG64::CLE:
      return formatCdFjFk(isDouble ? "fcmp.cle.d" : "fcmp.cle.s", word);
    case AssemblerLOONG64::CLT:
      return formatCdFjFk(isDouble ? "fcmp.clt.d" : "fcmp.clt.s", word);
    case AssemblerLOONG64::CUN:
      return formatCdFjFk(isDouble ? "fcmp.cun.d" : "fcmp.cun.s", word);
    case AssemblerLOONG64::CUEQ:
      return formatCdFjFk(isDouble ? "fcmp.cueq.d" : "fcmp.cueq.s", word);
    case AssemblerLOONG64::CUNE:
      return formatCdFjFk(isDouble ? "fcmp.cune.d" : "fcmp.cune.s", word);
    case AssemblerLOONG64::CULE:
      return formatCdFjFk(isDouble ? "fcmp.cule.d" : "fcmp.cule.s", word);
    case AssemblerLOONG64::CULT:
      return formatCdFjFk(isDouble ? "fcmp.cult.d" : "fcmp.cult.s", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp6(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(6)) {
    case op_beqz:
      return formatBranch21("beqz", instruction, word);
    case op_bnez:
      return formatBranch21("bnez", instruction, word);
    case op_bcz:
      return formatBcz(instruction, word);
    case op_jirl:
      return formatRdRjBranch16("jirl", word);
    case op_b:
      return formatBranch26("b", instruction, word);
    case op_bl:
      return formatBranch26("bl", instruction, word);
    case op_beq:
      return formatBranch16("beq", instruction, word);
    case op_bne:
      return formatBranch16("bne", instruction, word);
    case op_blt:
      return formatBranch16("blt", instruction, word);
    case op_bge:
      return formatBranch16("bge", instruction, word);
    case op_bltu:
      return formatBranch16("bltu", instruction, word);
    case op_bgeu:
      return formatBranch16("bgeu", instruction, word);
    case op_addu16i_d:
      return formatRdRjSigned16("addu16i.d", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp11(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(11)) {
    case op_bstr_w:
      return formatRdRjMsbWLsbW(
          Extract(word, 15, 1) ? "bstrpick.w" : "bstrins.w", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp12(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(12)) {
    case op_fmadd_s:
      return formatFdFjFkFa("fmadd.s", word);
    case op_fmadd_d:
      return formatFdFjFkFa("fmadd.d", word);
    case op_fmsub_s:
      return formatFdFjFkFa("fmsub.s", word);
    case op_fmsub_d:
      return formatFdFjFkFa("fmsub.d", word);
    case op_fnmadd_s:
      return formatFdFjFkFa("fnmadd.s", word);
    case op_fnmadd_d:
      return formatFdFjFkFa("fnmadd.d", word);
    case op_fnmsub_s:
      return formatFdFjFkFa("fnmsub.s", word);
    case op_fnmsub_d:
      return formatFdFjFkFa("fnmsub.d", word);
    case op_fcmp_cond_s:
      return formatFCompare(false, word);
    case op_fcmp_cond_d:
      return formatFCompare(true, word);
    default:
      return false;
  }
}

bool Decoder::decodeOp7(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(7)) {
    case op_lu12i_w:
      return formatRdSigned20("lu12i.w", word);
    case op_lu32i_d:
      return formatRdSigned20("lu32i.d", word);
    case op_pcaddi:
      return formatRdSigned20("pcaddi", word);
    case op_pcaddu12i:
      return formatRdSigned20("pcaddu12i", word);
    case op_pcaddu18i:
      return formatRdSigned20("pcaddu18i", word);
    case op_pcalau12i:
      return formatRdSigned20("pcalau12i", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp8(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(8)) {
    case op_ldptr_d:
      return formatRdRjSigned14Scaled("ldptr.d", word);
    case op_ldptr_w:
      return formatRdRjSigned14Scaled("ldptr.w", word);
    case op_ll_d:
      return formatRdRjSigned14Scaled("ll.d", word);
    case op_ll_w:
      return formatRdRjSigned14Scaled("ll.w", word);
    case op_sc_d:
      return formatRdRjSigned14Scaled("sc.d", word);
    case op_sc_w:
      return formatRdRjSigned14Scaled("sc.w", word);
    case op_stptr_d:
      return formatRdRjSigned14Scaled("stptr.d", word);
    case op_stptr_w:
      return formatRdRjSigned14Scaled("stptr.w", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp10(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(10)) {
    case op_addi_d:
      return formatRdRjSigned12("addi.d", word);
    case op_addi_w:
      return formatRdRjSigned12("addi.w", word);
    case op_andi:
      return formatRdRjUnsigned12("andi", word);
    case op_bstrins_d:
      return formatRdRjMsbDLsbD("bstrins.d", word);
    case op_bstrpick_d:
      return formatRdRjMsbDLsbD("bstrpick.d", word);
    case op_fld_d:
      return formatFdRjSigned12("fld.d", word);
    case op_fld_s:
      return formatFdRjSigned12("fld.s", word);
    case op_fst_d:
      return formatFdRjSigned12("fst.d", word);
    case op_fst_s:
      return formatFdRjSigned12("fst.s", word);
    case op_ld_b:
      return formatRdRjSigned12("ld.b", word);
    case op_ld_bu:
      return formatRdRjSigned12("ld.bu", word);
    case op_ld_d:
      return formatRdRjSigned12("ld.d", word);
    case op_ld_h:
      return formatRdRjSigned12("ld.h", word);
    case op_ld_hu:
      return formatRdRjSigned12("ld.hu", word);
    case op_ld_w:
      return formatRdRjSigned12("ld.w", word);
    case op_ld_wu:
      return formatRdRjSigned12("ld.wu", word);
    case op_lu52i_d:
      return formatRdRjSigned12("lu52i.d", word);
    case op_ori:
      return formatRdRjUnsigned12("ori", word);
    case op_preld:
      return formatHintRjSigned12("preld", word);
    case op_slti:
      return formatRdRjSigned12("slti", word);
    case op_sltui:
      return formatRdRjSigned12("sltui", word);
    case op_st_b:
      return formatRdRjSigned12("st.b", word);
    case op_st_d:
      return formatRdRjSigned12("st.d", word);
    case op_st_h:
      return formatRdRjSigned12("st.h", word);
    case op_st_w:
      return formatRdRjSigned12("st.w", word);
    case op_xori:
      return formatRdRjUnsigned12("xori", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp14(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(14)) {
    case op_bytepick_d:
      return formatRdRjRkSa3("bytepick.d", word);
    case op_fsel:
      return formatFdFjFkCa("fsel", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp15(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(15)) {
    case op_alsl_d:
      return formatRdRjRkSa2PlusOne("alsl.d", word);
    case op_alsl_w:
      return formatRdRjRkSa2PlusOne("alsl.w", word);
    case op_alsl_wu:
      return formatRdRjRkSa2PlusOne("alsl.wu", word);
    case op_bytepick_w:
      return formatRdRjRkSa2("bytepick.w", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp16(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(16)) {
    case op_rotri_d:
      return formatRdRjUnsigned6("rotri.d", word);
    case op_slli_d:
      return formatRdRjUnsigned6("slli.d", word);
    case op_srai_d:
      return formatRdRjUnsigned6("srai.d", word);
    case op_srli_d:
      return formatRdRjUnsigned6("srli.d", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp17(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(17)) {
    case op_add_d:
      return formatRdRjRk("add.d", word);
    case op_add_w:
      return formatRdRjRk("add.w", word);
    case op_amadd_b:
      return formatRdRkRj("amadd.b", word);
    case op_amadd_d:
      return formatRdRkRj("amadd.d", word);
    case op_amadd_db_b:
      return formatRdRkRj("amadd_db.b", word);
    case op_amadd_db_d:
      return formatRdRkRj("amadd_db.d", word);
    case op_amadd_db_h:
      return formatRdRkRj("amadd_db.h", word);
    case op_amadd_db_w:
      return formatRdRkRj("amadd_db.w", word);
    case op_amadd_h:
      return formatRdRkRj("amadd.h", word);
    case op_amadd_w:
      return formatRdRkRj("amadd.w", word);
    case op_amand_d:
      return formatRdRkRj("amand.d", word);
    case op_amand_db_d:
      return formatRdRkRj("amand_db.d", word);
    case op_amand_db_w:
      return formatRdRkRj("amand_db.w", word);
    case op_amand_w:
      return formatRdRkRj("amand.w", word);
    case op_amcas_b:
      return formatRdRkRj("amcas.b", word);
    case op_amcas_d:
      return formatRdRkRj("amcas.d", word);
    case op_amcas_h:
      return formatRdRkRj("amcas.h", word);
    case op_amcas_w:
      return formatRdRkRj("amcas.w", word);
    case op_amcas_db_b:
      return formatRdRkRj("amcas_db.b", word);
    case op_amcas_db_d:
      return formatRdRkRj("amcas_db.d", word);
    case op_amcas_db_h:
      return formatRdRkRj("amcas_db.h", word);
    case op_amcas_db_w:
      return formatRdRkRj("amcas_db.w", word);
    case op_ammax_d:
      return formatRdRkRj("ammax.d", word);
    case op_ammax_db_d:
      return formatRdRkRj("ammax_db.d", word);
    case op_ammax_db_du:
      return formatRdRkRj("ammax_db.du", word);
    case op_ammax_db_w:
      return formatRdRkRj("ammax_db.w", word);
    case op_ammax_db_wu:
      return formatRdRkRj("ammax_db.wu", word);
    case op_ammax_du:
      return formatRdRkRj("ammax.du", word);
    case op_ammax_w:
      return formatRdRkRj("ammax.w", word);
    case op_ammax_wu:
      return formatRdRkRj("ammax.wu", word);
    case op_ammin_d:
      return formatRdRkRj("ammin.d", word);
    case op_ammin_db_d:
      return formatRdRkRj("ammin_db.d", word);
    case op_ammin_db_du:
      return formatRdRkRj("ammin_db.du", word);
    case op_ammin_db_w:
      return formatRdRkRj("ammin_db.w", word);
    case op_ammin_db_wu:
      return formatRdRkRj("ammin_db.wu", word);
    case op_ammin_du:
      return formatRdRkRj("ammin.du", word);
    case op_ammin_w:
      return formatRdRkRj("ammin.w", word);
    case op_ammin_wu:
      return formatRdRkRj("ammin.wu", word);
    case op_amor_d:
      return formatRdRkRj("amor.d", word);
    case op_amor_db_d:
      return formatRdRkRj("amor_db.d", word);
    case op_amor_db_w:
      return formatRdRkRj("amor_db.w", word);
    case op_amor_w:
      return formatRdRkRj("amor.w", word);
    case op_amswap_b:
      return formatRdRkRj("amswap.b", word);
    case op_amswap_d:
      return formatRdRkRj("amswap.d", word);
    case op_amswap_db_b:
      return formatRdRkRj("amswap_db.b", word);
    case op_amswap_db_d:
      return formatRdRkRj("amswap_db.d", word);
    case op_amswap_db_h:
      return formatRdRkRj("amswap_db.h", word);
    case op_amswap_db_w:
      return formatRdRkRj("amswap_db.w", word);
    case op_amswap_h:
      return formatRdRkRj("amswap.h", word);
    case op_amswap_w:
      return formatRdRkRj("amswap.w", word);
    case op_amxor_d:
      return formatRdRkRj("amxor.d", word);
    case op_amxor_db_d:
      return formatRdRkRj("amxor_db.d", word);
    case op_amxor_db_w:
      return formatRdRkRj("amxor_db.w", word);
    case op_amxor_w:
      return formatRdRkRj("amxor.w", word);
    case op_and:
      return formatRdRjRk("and", word);
    case op_andn:
      return formatRdRjRk("andn", word);
    case op_break:
      return formatUnsigned15("break", word);
    case op_syscall:
      return formatUnsigned15("syscall", word);
    case op_dbar:
      return formatUnsigned15("dbar", word);
    case op_div_d:
      return formatRdRjRk("div.d", word);
    case op_div_du:
      return formatRdRjRk("div.du", word);
    case op_div_w:
      return formatRdRjRk("div.w", word);
    case op_div_wu:
      return formatRdRjRk("div.wu", word);
    case op_fadd_d:
      return formatFdFjFk("fadd.d", word);
    case op_fadd_s:
      return formatFdFjFk("fadd.s", word);
    case op_fcopysign_d:
      return formatFdFjFk("fcopysign.d", word);
    case op_fcopysign_s:
      return formatFdFjFk("fcopysign.s", word);
    case op_fdiv_d:
      return formatFdFjFk("fdiv.d", word);
    case op_fdiv_s:
      return formatFdFjFk("fdiv.s", word);
    case op_fldx_d:
      return formatFdRjRk("fldx.d", word);
    case op_fldx_s:
      return formatFdRjRk("fldx.s", word);
    case op_fmax_d:
      return formatFdFjFk("fmax.d", word);
    case op_fmax_s:
      return formatFdFjFk("fmax.s", word);
    case op_fmaxa_d:
      return formatFdFjFk("fmaxa.d", word);
    case op_fmaxa_s:
      return formatFdFjFk("fmaxa.s", word);
    case op_fmin_d:
      return formatFdFjFk("fmin.d", word);
    case op_fmin_s:
      return formatFdFjFk("fmin.s", word);
    case op_fmina_d:
      return formatFdFjFk("fmina.d", word);
    case op_fmina_s:
      return formatFdFjFk("fmina.s", word);
    case op_fmul_d:
      return formatFdFjFk("fmul.d", word);
    case op_fmul_s:
      return formatFdFjFk("fmul.s", word);
    case op_fstx_d:
      return formatFdRjRk("fstx.d", word);
    case op_fstx_s:
      return formatFdRjRk("fstx.s", word);
    case op_fsub_d:
      return formatFdFjFk("fsub.d", word);
    case op_fsub_s:
      return formatFdFjFk("fsub.s", word);
    case op_ibar:
      return formatUnsigned15("ibar", word);
    case op_ldx_b:
      return formatRdRjRk("ldx.b", word);
    case op_ldx_bu:
      return formatRdRjRk("ldx.bu", word);
    case op_ldx_d:
      return formatRdRjRk("ldx.d", word);
    case op_ldx_h:
      return formatRdRjRk("ldx.h", word);
    case op_ldx_hu:
      return formatRdRjRk("ldx.hu", word);
    case op_ldx_w:
      return formatRdRjRk("ldx.w", word);
    case op_ldx_wu:
      return formatRdRjRk("ldx.wu", word);
    case op_maskeqz:
      return formatRdRjRk("maskeqz", word);
    case op_masknez:
      return formatRdRjRk("masknez", word);
    case op_mod_d:
      return formatRdRjRk("mod.d", word);
    case op_mod_du:
      return formatRdRjRk("mod.du", word);
    case op_mod_w:
      return formatRdRjRk("mod.w", word);
    case op_mod_wu:
      return formatRdRjRk("mod.wu", word);
    case op_mul_d:
      return formatRdRjRk("mul.d", word);
    case op_mul_w:
      return formatRdRjRk("mul.w", word);
    case op_mulh_d:
      return formatRdRjRk("mulh.d", word);
    case op_mulh_du:
      return formatRdRjRk("mulh.du", word);
    case op_mulh_w:
      return formatRdRjRk("mulh.w", word);
    case op_mulh_wu:
      return formatRdRjRk("mulh.wu", word);
    case op_mulw_d_w:
      return formatRdRjRk("mulw.d.w", word);
    case op_mulw_d_wu:
      return formatRdRjRk("mulw.d.wu", word);
    case op_nor:
      return formatRdRjRk("nor", word);
    case op_or:
      return formatRdRjRk("or", word);
    case op_orn:
      return formatRdRjRk("orn", word);
    case op_rotr_d:
      return formatRdRjRk("rotr.d", word);
    case op_rotr_w:
      return formatRdRjRk("rotr.w", word);
    case op_rotri_w:
      return formatRdRjUnsigned5("rotri.w", word);
    case op_sll_d:
      return formatRdRjRk("sll.d", word);
    case op_sll_w:
      return formatRdRjRk("sll.w", word);
    case op_slli_w:
      return formatRdRjUnsigned5("slli.w", word);
    case op_slt:
      return formatRdRjRk("slt", word);
    case op_sltu:
      return formatRdRjRk("sltu", word);
    case op_sra_d:
      return formatRdRjRk("sra.d", word);
    case op_sra_w:
      return formatRdRjRk("sra.w", word);
    case op_srai_w:
      return formatRdRjUnsigned5("srai.w", word);
    case op_srl_d:
      return formatRdRjRk("srl.d", word);
    case op_srl_w:
      return formatRdRjRk("srl.w", word);
    case op_srli_w:
      return formatRdRjUnsigned5("srli.w", word);
    case op_stx_b:
      return formatRdRjRk("stx.b", word);
    case op_stx_d:
      return formatRdRjRk("stx.d", word);
    case op_stx_h:
      return formatRdRjRk("stx.h", word);
    case op_stx_w:
      return formatRdRjRk("stx.w", word);
    case op_sub_d:
      return formatRdRjRk("sub.d", word);
    case op_sub_w:
      return formatRdRjRk("sub.w", word);
    case op_xor:
      return formatRdRjRk("xor", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp22(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(22)) {
    case op_bitrev_4b:
      return formatRdRj("bitrev.4b", word);
    case op_bitrev_8b:
      return formatRdRj("bitrev.8b", word);
    case op_bitrev_d:
      return formatRdRj("bitrev.d", word);
    case op_bitrev_w:
      return formatRdRj("bitrev.w", word);
    case op_clo_d:
      return formatRdRj("clo.d", word);
    case op_clo_w:
      return formatRdRj("clo.w", word);
    case op_clz_d:
      return formatRdRj("clz.d", word);
    case op_clz_w:
      return formatRdRj("clz.w", word);
    case op_cto_d:
      return formatRdRj("cto.d", word);
    case op_cto_w:
      return formatRdRj("cto.w", word);
    case op_ctz_d:
      return formatRdRj("ctz.d", word);
    case op_ctz_w:
      return formatRdRj("ctz.w", word);
    case op_ext_w_b:
      return formatRdRj("ext.w.b", word);
    case op_ext_w_h:
      return formatRdRj("ext.w.h", word);
    case op_fabs_d:
      return formatFdFj("fabs.d", word);
    case op_fabs_s:
      return formatFdFj("fabs.s", word);
    case op_fcvt_d_s:
      return formatFdFj("fcvt.d.s", word);
    case op_fcvt_s_d:
      return formatFdFj("fcvt.s.d", word);
    case op_ffint_d_l:
      return formatFdFj("ffint.d.l", word);
    case op_ffint_d_w:
      return formatFdFj("ffint.d.w", word);
    case op_ffint_s_l:
      return formatFdFj("ffint.s.l", word);
    case op_ffint_s_w:
      return formatFdFj("ffint.s.w", word);
    case op_fmov_d:
      return formatFdFj("fmov.d", word);
    case op_fmov_s:
      return formatFdFj("fmov.s", word);
    case op_fneg_d:
      return formatFdFj("fneg.d", word);
    case op_fneg_s:
      return formatFdFj("fneg.s", word);
    case op_frint_d:
      return formatFdFj("frint.d", word);
    case op_frint_s:
      return formatFdFj("frint.s", word);
    case op_fsqrt_d:
      return formatFdFj("fsqrt.d", word);
    case op_fsqrt_s:
      return formatFdFj("fsqrt.s", word);
    case op_ftint_l_d:
      return formatFdFj("ftint.l.d", word);
    case op_ftint_l_s:
      return formatFdFj("ftint.l.s", word);
    case op_ftint_w_d:
      return formatFdFj("ftint.w.d", word);
    case op_ftint_w_s:
      return formatFdFj("ftint.w.s", word);
    case op_ftintrm_l_d:
      return formatFdFj("ftintrm.l.d", word);
    case op_ftintrm_l_s:
      return formatFdFj("ftintrm.l.s", word);
    case op_ftintrm_w_d:
      return formatFdFj("ftintrm.w.d", word);
    case op_ftintrm_w_s:
      return formatFdFj("ftintrm.w.s", word);
    case op_ftintrne_l_d:
      return formatFdFj("ftintrne.l.d", word);
    case op_ftintrne_l_s:
      return formatFdFj("ftintrne.l.s", word);
    case op_ftintrne_w_d:
      return formatFdFj("ftintrne.w.d", word);
    case op_ftintrne_w_s:
      return formatFdFj("ftintrne.w.s", word);
    case op_ftintrp_l_d:
      return formatFdFj("ftintrp.l.d", word);
    case op_ftintrp_l_s:
      return formatFdFj("ftintrp.l.s", word);
    case op_ftintrp_w_d:
      return formatFdFj("ftintrp.w.d", word);
    case op_ftintrp_w_s:
      return formatFdFj("ftintrp.w.s", word);
    case op_ftintrz_l_d:
      return formatFdFj("ftintrz.l.d", word);
    case op_ftintrz_l_s:
      return formatFdFj("ftintrz.l.s", word);
    case op_ftintrz_w_d:
      return formatFdFj("ftintrz.w.d", word);
    case op_ftintrz_w_s:
      return formatFdFj("ftintrz.w.s", word);
    case op_movfcsr2gr:
      return formatRdFcsr("movfcsr2gr", word);
    case op_movfr2cf:
      return formatCdFj("movfr2cf", word);
    case op_movfr2gr_d:
      return formatRdFj("movfr2gr.d", word);
    case op_movfr2gr_s:
      return formatRdFj("movfr2gr.s", word);
    case op_movfrh2gr_s:
      return formatRdFj("movfrh2gr.s", word);
    case op_movgr2cf:
      return formatCdRj("movgr2cf", word);
    case op_movgr2fcsr:
      return formatFcsrRj("movgr2fcsr", word);
    case op_movgr2fr_d:
      return formatFdRj("movgr2fr.d", word);
    case op_movgr2fr_w:
      return formatFdRj("movgr2fr.w", word);
    case op_movgr2frh_w:
      return formatFdRj("movgr2frh.w", word);
    case op_revb_2h:
      return formatRdRj("revb.2h", word);
    case op_revb_2w:
      return formatRdRj("revb.2w", word);
    case op_revb_4h:
      return formatRdRj("revb.4h", word);
    case op_revb_d:
      return formatRdRj("revb.d", word);
    case op_revh_2w:
      return formatRdRj("revh.2w", word);
    case op_revh_d:
      return formatRdRj("revh.d", word);
    default:
      return false;
  }
}

bool Decoder::decodeOp24(const Instruction* instruction) const {
  uint32_t word = instruction->encode();
  switch (word & OpcodeMask(24)) {
    case op_movcf2fr:
      return formatFdCj("movcf2fr", word);
    case op_movcf2gr:
      return formatRdCj("movcf2gr", word);
    default:
      return false;
  }
}

int Decoder::disassemble(const Instruction* instruction) const {
  if (!(decodeOp6(instruction) || decodeOp7(instruction) ||
        decodeOp8(instruction) || decodeOp10(instruction) ||
        decodeOp11(instruction) || decodeOp12(instruction) ||
        decodeOp14(instruction) || decodeOp15(instruction) ||
        decodeOp16(instruction) || decodeOp17(instruction) ||
        decodeOp22(instruction) || decodeOp24(instruction))) {
    FormatTo(output_, ".word 0x%08" PRIx32, instruction->encode());
  }
  return sizeof(uint32_t);
}

}  // namespace

const char* NameConverter::nameOfCPURegister(uint32_t reg) const {
  return Registers::GetName(reg);
}

const char* NameConverter::nameOfFPURegister(uint32_t reg) const {
  return FloatRegisters::GetName(reg);
}

const char* NameConverter::nameOfAddress(const uint8_t* address) const {
  SprintfLiteral(addressBuffer_, "%p", address);
  return addressBuffer_;
}

int Disassembler::disassemble(mozilla::Span<char> output,
                              const Instruction* instruction) const {
  Decoder decoder(converter_, output);
  return decoder.disassemble(instruction);
}

int Disassembler::disassemble(mozilla::Span<char> output,
                              const uint8_t* instruction) const {
  return disassemble(output, reinterpret_cast<const Instruction*>(instruction));
}

}  // namespace js::jit::disasm
