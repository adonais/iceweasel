/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "wasm/WasmSummarizeInsn.h"

// for Loongson extension detection
#if defined(JS_CODEGEN_MIPS64)
#  include "jit/mips-shared/Architecture-mips-shared.h"
#endif

#if defined(JS_CODEGEN_RISCV64)
#  include "jit/riscv64/constant/Constant-riscv64.h"
#endif

#include "jit/Assembler.h"  // WasmTrapInstructionLength

using namespace js::jit;

namespace js {
namespace wasm {

// ====================================================================
// === InstructionBytes

// A virtual base class that provides instruction bytes for
// SummarizeTrapInstruction to examine.  The object is conceptually
// regarded as "pointing" at the first byte of the instruction.
class InstructionBytes {
 public:
  // Get the byte at `offset` from the first byte of the instruction
  virtual uint8_t get(size_t offset) const = 0;
  // Convenience function.  Check whether the first byte of the instruction
  // would be 32-bit aligned.  In case of doubt, return `true`.
  virtual bool isU32aligned() const = 0;
  // Convenience function.  Fetch a U32, little-endianly.
  uint32_t getU32LittleEndian(size_t offset) const {
    MOZ_ASSERT((offset & 3) == 0);
    uint32_t word = 0;
    for (uint32_t i = 0; i < 4; i++) {
      word = (word << 8) | uint32_t(get(offset + (3 - i)));
    }
    return word;
  }
};

// An InstructionBytes source that pulls bytes out of arbitrary memory.
class InstructionBytesAbsolute : public InstructionBytes {
  const uint8_t* insn_ = nullptr;

 public:
  explicit InstructionBytesAbsolute(const uint8_t* insn) : insn_(insn) {}
  bool isU32aligned() const override { return (uintptr_t(insn_) & 3) == 0; }
  uint8_t get(size_t offset) const override {
    MOZ_ASSERT(offset < 16);
    return insn_[offset];
  }
};

// An InstructionBytes source that reads bytes from an assembler buffer.
class InstructionBytesFromMasm : public wasm::InstructionBytes {
  const MacroAssembler& masm_;
  uint32_t baseOffset_ = 0;

 public:
  explicit InstructionBytesFromMasm(const MacroAssembler& masm,
                                    uint32_t baseOffset)
      : masm_(masm), baseOffset_(baseOffset) {
    MOZ_ASSERT(baseOffset < masm.readableSize());
  }
  bool isU32aligned() const override { return (baseOffset_ & 3) == 0; }
  uint8_t get(size_t offset) const override {
    return masm_.getByteAtOffset(size_t(baseOffset_) + offset);
  }
};

// ====================================================================
// === SummarizeTrapInstruction

// Sources of documentation of instruction-set encoding:
//
// Documentation for the ARM instruction sets can be found at
// https://developer.arm.com/documentation/ddi0487/latest.  The documentation
// is vast -- more than 10000 pages.  When looking up an instruction, be sure
// to look in the correct section for the target word size -- AArch64 (arm64)
// and AArch32 (arm32) instructions are listed in different sections.  And for
// AArch32, be sure to look only at the "A<digit> variant/encoding" and not at
// the "T<digit>" ones.  The latter are for Thumb encodings, which we don't
// generate.
//
// The Intel documentation is similarly comprehensive: search for "Intel® 64
// and IA-32 Architectures Software Developer’s Manual Combined Volumes: 1,
// 2A, 2B, 2C, 2D, 3A, 3B, 3C, 3D, and 4".  It's easy to find.

// ===================================================== x86_32 and x86_64 ====

#if defined(JS_CODEGEN_X64) || defined(JS_CODEGEN_X86)

// Returns true iff a "Mod R/M" byte indicates a memory transaction.
static bool ModRMisM(uint8_t modrm) {
  return (modrm & 0b11'000'000) != 0b11'000'000;
}

// Returns bits 6:4 of a Mod R/M byte, which (for our very limited purposes)
// is sometimes interpreted as an opcode extension.
static uint8_t ModRMmid3(uint8_t modrm) { return (modrm >> 3) & 0b00000111; }

// Some simple helpers for dealing with (bitsets of) instruction prefixes.
enum Prefix : uint32_t {
  PfxLock = 1 << 0,
  Pfx66 = 1 << 1,
  PfxF2 = 1 << 2,
  PfxF3 = 1 << 3,
  PfxRexW = 1 << 4,
  PfxVexL = 1 << 5
};
static bool isEmpty(uint32_t set) { return set == 0; }
static bool hasAllOf(uint32_t set, uint32_t mustBePresent) {
  return (set & mustBePresent) == mustBePresent;
}
static bool hasNoneOf(uint32_t set, uint32_t mustNotBePresent) {
  return (set & mustNotBePresent) == 0;
}
static bool hasOnly(uint32_t set, uint32_t onlyTheseMayBePresent) {
  return (set & ~onlyTheseMayBePresent) == 0;
}

// Implied opcode-escape prefixes; these are used for decoding VEX-prefixed
// (AVX) instructions only.  This is a real enumeration, not a bitset.
enum Escape { EscNone, Esc0F, Esc0F38, Esc0F3A };

// `insn` points to the first byte of an instruction.  `delta` is the offset of
// the ModRM byte (that is, the first byte of the memory address encoding) and
// is expected to actually encode a memory address [which we assert].  Returns
// the length of the entire address mode, including the ModRM byte itself (so
// the returned value is always >= 1).
static uint32_t AddressModeLength(const InstructionBytes& insn,
                                  uint32_t delta) {
  MOZ_ASSERT(delta < 16);

  const uint8_t modrm = insn.get(delta++);
  MOZ_ASSERT(ModRMisM(modrm));

  // Remove the register-operand field from modrm, leaving only the fields that
  // describe the memory address.  The register-operand field is 3 bits, which
  // leaves 5 bits of memory-operand field, in two parts.  Slide them together
  // to make a contiguous value in the range 0..31 inclusive.

  const uint8_t modrm_reduced =
      ((modrm & 0b11'000'000) >> 3) | (modrm & 0b000'00'111);

  switch (modrm_reduced) {
    // REX.B==0: (%rax) .. (%rdi), not including (%rsp) or (%rbp).
    // REX.B==1: (%r8)  .. (%r15), not including (%r12) or (%r13).
    case 0x00:
    case 0x01:
    case 0x02:
    case 0x03:
    case 0x06:
    case 0x07: {
      return 1;
    }
    // REX.B==0: d8(%rax) ... d8(%rdi), not including d8(%rsp)
    // REX.B==1: d8(%r8)  ... d8(%r15), not including d8(%r12)
    case 0x08:
    case 0x09:
    case 0x0A:
    case 0x0B:
    case 0x0D:
    case 0x0E:
    case 0x0F: {
      return 2;
    }
    // REX.B==0: d32(%rax) ... d32(%rdi), not including d32(%rsp)
    // REX.B==1: d32(%r8)  ... d32(%r15), not including d32(%r12)
    case 0x10:
    case 0x11:
    case 0x12:
    case 0x13:
    case 0x15:
    case 0x16:
    case 0x17: {
      return 5;
    }
    // REX.B==0: a register, %rax .. %rdi.  This shouldn't happen.
    // REX.B==1: a register, %r8  .. %r16.  This shouldn't happen.
    case 0x18:
    case 0x19:
    case 0x1A:
    case 0x1B:
    case 0x1C:
    case 0x1D:
    case 0x1E:
    case 0x1F: {
      MOZ_CRASH();
    }
    // RIP + disp32.
    case 0x05: {
      return 5;
    }
    // SIB, with no displacement.  Special case: when mod is zero and base
    // indicates RBP or R13, base is instead a 32-bit sign-extended literal.
    case 0x04: {
      const uint8_t sib = insn.get(delta++);
      const uint8_t base_r = sib & 7;
      // correct since #(R13) == 8 + #(RBP)
      bool base_is_RBP_or_R13 = base_r == 5 /*RBP*/;
      return base_is_RBP_or_R13 ? 6 : 2;
    }
    // SIB, with 8-bit displacement
    case 0x0C: {
      return 3;
    }
    // SIB, with 32-bit displacement
    case 0x14: {
      return 6;
    }
    default: {
      MOZ_CRASH();
    }
  }
}

// A helper function that computes the size of an immediate field from the
// operation width of the instruction, for instructions in which the immediate
// size isn't implied (by the opcode byte(s)) to be 1 byte.  See block comment
// below.
static uint8_t ImmediateSizeFromOperationSize(uint8_t opSizeInBytes) {
  switch (opSizeInBytes) {
    case 1:
    case 2:
    case 4:
      return opSizeInBytes;
    case 8:
      // 64-bit insns only get 32-bit immediates
      return 4;
    default:
      MOZ_CRASH();
  }
}

static SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  // A note on computing instruction lengths.  Almost all instructions include
  // a so-called ModR/M (modrm) byte.  If the modrm byte has been determined
  // to be at `delta + N` then the length of the instruction as a whole is
  // `delta + N + AddressModeLength(insn, delta + N)`.
  //
  // However, that doesn't take into account instructions that have a immediate
  // (constant) field that is *not* part of a memory address.  In such cases
  // we'll need to add on the size of the immediate field.  The majority of
  // instructions don't have an immediate field, so the above rule is enough,
  // for example:
  //
  //  mov %rax, %rbx
  //  add %r15, 0x1337(%rcx, %rdx, 8)  // 0x1337 and 8 are part of the address
  //
  // Instructions that do have an immediate field:
  //
  //   movabsq $1234567987654321, %r12     // 64-bit imm
  //   addl $0x4,  %edx                    // 8-bit imm
  //   addl $0x84, %edx                    // 32-bit imm
  //   pcmpistri $0x3a, %xmm1, %xmm15      // 8-bit imm
  //
  // In cases involving immediates, be careful to distinguish the following
  // three cases:
  //
  // * operation width is 1 byte, and so the immediate is 1 byte
  //
  // * operation size is 2, 4 or 8 bytes, and the immediate is 1 byte, which
  //   will be sign extended out to the operation size
  //
  // * operation size is 2, 4 or 8 bytes, and the immediate is correspondingly
  //   either 2 or 4 bytes.  In the 8 byte operation size case, the immediate is
  //   4 bytes and is sign-extended out to 8 bytes.
  //
  // The 64-bit instruction set does not include any instructions with an 8-byte
  // immediate, with the single exception of `movabsq`, which this function
  // doesn't (need to) identify.
  //
  // The modrm byte always comes after the prefixes, including VEX prefixes, and
  // the opcode byte(s), so we don't need to take them into account specially --
  // the general rule handles that.

  const bool is64bit = sizeof(void*) == 8;

  // This is the offset of where we are relative to the first byte of the
  // instruction.
  uint32_t delta = 0;

  // First off, use up the prefix bytes, so we wind up pointing `insn` at the
  // primary opcode byte, and at the same time accumulate the prefixes in
  // `prefixes`.
  uint32_t prefixes = 0;

  bool hasREX = false;
  bool hasVEX = false;

  // Parse the "legacy" prefixes (only those we care about).  Skip REX on
  // 32-bit x86.
  while (true) {
    if (insn.get(delta + 0) >= 0x40 && insn.get(delta + 0) <= 0x4F && is64bit) {
      hasREX = true;
      // It has a REX prefix, but is REX.W set?
      if (insn.get(delta + 0) >= 0x48) {
        prefixes |= PfxRexW;
      }
      delta++;
      continue;
    }
    if (insn.get(delta + 0) == 0x66) {
      prefixes |= Pfx66;
      delta++;
      continue;
    }
    if (insn.get(delta + 0) == 0xF0) {
      prefixes |= PfxLock;
      delta++;
      continue;
    }
    if (insn.get(delta + 0) == 0xF2) {
      prefixes |= PfxF2;
      delta++;
      continue;
    }
    if (insn.get(delta + 0) == 0xF3) {
      prefixes |= PfxF3;
      delta++;
      continue;
    }
    if (insn.get(delta + 0) == 0xC4 || insn.get(delta + 0) == 0xC5) {
      hasVEX = true;
      // And fall through to the `break`, leaving `delta` pointing at the start
      // of the VEX prefix.
    }
    break;
  }

  // Throw out some invalid prefix combinations.
  if (  // Can't have both F2 and F3
      hasAllOf(prefixes, PfxF2 | PfxF3) ||
      // Can't have both REX and VEX
      (hasREX && hasVEX) ||
      // Can't have both LOCK and VEX
      (hasVEX && (prefixes & PfxLock))) {
    return SummarizeResult();
  }

  if (!hasVEX) {
    // The instruction has legacy prefixes only.  Deal with all these cases
    // first.

    // Determine the data size (in bytes) for "standard form" non-SIMD, non-FP
    // instructions whose opcode byte(s) don't directly imply an 8-bit
    // operation.  If both REX.W and 0x66 are present then REX.W "wins".
    int opSize = 4;
    if (prefixes & Pfx66) {
      opSize = 2;
    }
    if (prefixes & PfxRexW) {
      MOZ_ASSERT(is64bit);
      opSize = 8;
    }

    // `insn` should now point at the primary opcode, at least for the cases
    // we care about.  Start identifying instructions.  The OP_/OP2_/OP3_
    // comments are references to names as declared in Encoding-x86-shared.h.

    // This is the most common trap insn, so deal with it early.  Created by
    // MacroAssembler::wasmTrapInstruction.
    // OP_2BYTE_ESCAPE OP2_UD2
    // 0F 0B = ud2
    if (insn.get(delta + 0) == 0x0F && insn.get(delta + 1) == 0x0B &&
        isEmpty(prefixes)) {
      static_assert(WasmTrapInstructionLength == 2);
      return SummarizeResult(TrapMachineInsn::OfficialUD, 2);
    }

    // ==== Atomics

    // 0F C0 = XADD reg8, reg8/mem8
    if (insn.get(delta + 0) == 0x0F && insn.get(delta + 1) == 0xC0 &&
        ModRMisM(insn.get(delta + 2)) && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // Atomic8
    }

    // 0F C1 = XADD regN, regN/memN, for N in {16, 32, 64}
    if (insn.get(delta + 0) == 0x0F && insn.get(delta + 1) == 0xC1 &&
        ModRMisM(insn.get(delta + 2)) && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock | Pfx66 | PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // A<opSize>
    }

    // 0F B0 = CMPXCHG reg8, reg8/mem8
    if (insn.get(delta + 0) == 0x0F && insn.get(delta + 1) == 0xB0 &&
        ModRMisM(insn.get(delta + 2)) && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // Atomic8
    }

    // 0F B1 = CMPXCHG regN, regN/memN, for in in {16, 32, 64}
    if (insn.get(delta + 0) == 0x0F && insn.get(delta + 1) == 0xB1 &&
        ModRMisM(insn.get(delta + 2)) && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock | Pfx66 | PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // A<opSize>
    }

    // 80 /0 = ADD src=immediate8, dst=mem8
    // 80 /5 = SUB src=immediate8, dst=mem8
    // 80 /4 = AND src=immediate8, dst=mem8
    // 80 /1 = OR  src=immediate8, dst=mem8
    // 80 /6 = XOR src=immediate8, dst=mem8
    if (insn.get(delta + 0) == 0x80 && ModRMisM(insn.get(delta + 1)) &&
        (ModRMmid3(insn.get(delta + 1)) == 0 /*add*/ ||
         ModRMmid3(insn.get(delta + 1)) == 5 /*sub*/ ||
         ModRMmid3(insn.get(delta + 1)) == 4 /*and*/ ||
         ModRMmid3(insn.get(delta + 1)) == 1 /*or*/ ||
         ModRMmid3(insn.get(delta + 1)) == 6 /*xor*/
         ) &&
        (prefixes & PfxLock) && hasOnly(prefixes, PfxLock)) {
      // Don't forget "+ 1" for the immediate.
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) + 1;
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // Atomic8
    }

    // 81 /0 = ADD src=immediateN, dst=memM, for N in {16, 32} ..
    // 81 /5 = SUB src=immediateN, dst=memM  .. and M in {16, 32, 64}
    // 81 /4 = AND src=immediateN, dst=memM
    // 81 /1 = OR  src=immediateN, dst=memM
    // 81 /6 = XOR src=immediateN, dst=memM
    if (insn.get(delta + 0) == 0x81 && ModRMisM(insn.get(delta + 1)) &&
        (ModRMmid3(insn.get(delta + 1)) == 0 /*add*/ ||
         ModRMmid3(insn.get(delta + 1)) == 5 /*sub*/ ||
         ModRMmid3(insn.get(delta + 1)) == 4 /*and*/ ||
         ModRMmid3(insn.get(delta + 1)) == 1 /*or*/ ||
         ModRMmid3(insn.get(delta + 1)) == 6 /*xor*/
         ) &&
        (prefixes & PfxLock) && hasOnly(prefixes, PfxLock | Pfx66)) {
      // Don't forget the immediate.
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) +
                        ImmediateSizeFromOperationSize(opSize);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // A<opSize>
    }

    // 83 /0 = ADD src=signed-immediate8, dst=memN, for N in {16, 32}
    // 83 /5 = SUB src=signed-immediate8, dst=memN
    // 83 /4 = AND src=signed-immediate8, dst=memN
    // 83 /1 = OR  src=signed-immediate8, dst=memN
    // 83 /6 = XOR src=signed-immediate8, dst=memN
    if (insn.get(delta + 0) == 0x83 && ModRMisM(insn.get(delta + 1)) &&
        (ModRMmid3(insn.get(delta + 1)) == 0 /*add*/ ||
         ModRMmid3(insn.get(delta + 1)) == 5 /*sub*/ ||
         ModRMmid3(insn.get(delta + 1)) == 4 /*and*/ ||
         ModRMmid3(insn.get(delta + 1)) == 1 /*or*/ ||
         ModRMmid3(insn.get(delta + 1)) == 6 /*xor*/
         ) &&
        (prefixes & PfxLock) && hasOnly(prefixes, PfxLock | Pfx66)) {
      // Don't forget "+ 1" for the immediate.  It is sign-extended out to N, so
      // this is an N-byte operation even though the immediate is only one byte.
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) + 1;
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // A<opSize>
    }

    // 00 = ADD src=reg8, dest=reg8/mem8
    // 28 = SUB src=reg8, dest=reg8/mem8
    // 20 = AND src=reg8, dest=reg8/mem8
    // 08 = OR  src=reg8, dest=reg8/mem8
    // 30 = XOR src=reg8, dest=reg8/mem8
    if ((insn.get(delta + 0) == 0x00 || insn.get(delta + 0) == 0x28 ||
         insn.get(delta + 0) == 0x20 || insn.get(delta + 0) == 0x08 ||
         insn.get(delta + 0) == 0x30) &&
        ModRMisM(insn.get(delta + 1)) && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // Atomic8
    }

    // 01 = ADD src=regN, dest=regN/memN, for N in {2, 4, 8}
    // 29 = SUB src=regN, dest=regN/memN, for N in {2, 4, 8}
    // 21 = AND src=regN, dest=regN/memN, for N in {2, 4, 8}
    // 09 = OR  src=regN, dest=regN/memN, for N in {2, 4, 8}
    // 31 = XOR src=regN, dest=regN/memN, for N in {2, 4, 8}
    if ((insn.get(delta + 0) == 0x01 || insn.get(delta + 0) == 0x29 ||
         insn.get(delta + 0) == 0x21 || insn.get(delta + 0) == 0x09 ||
         insn.get(delta + 0) == 0x31) &&
        ModRMisM(insn.get(delta + 1)) && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock | Pfx66 | PfxRexW)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // A<opSize>
    }

    // 0F C7 /1 = CMPXCHG8B (needed on 32-bit targets only)
    if (!is64bit && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0xC7 && ModRMisM(insn.get(delta + 2)) &&
        ModRMmid3(insn.get(delta + 2)) == 1 && (prefixes & PfxLock) &&
        hasOnly(prefixes, PfxLock)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // Atomic64
    }

    // Reject any other (non-VEX) instructions that have a lock prefix.  We
    // already rejected (above) the combination (VEX and LOCK).
    if (prefixes & PfxLock) {
      return SummarizeResult();
    }
    // After this point, we can assume that no instruction has a lock prefix.

    // OP_XCHG_GbEb
    // OP_XCHG_GvEv
    // 86 = XCHG reg8, reg8/mem8.
    // 87 = XCHG reg64/32/16, reg64/32/16 / mem64/32/16.
    // The memory variants are atomic even though there is no LOCK prefix.
    if (insn.get(delta + 0) == 0x86 && ModRMisM(insn.get(delta + 1)) &&
        isEmpty(prefixes)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // Atomic8
    }
    if (insn.get(delta + 0) == 0x87 && ModRMisM(insn.get(delta + 1)) &&
        hasOnly(prefixes, Pfx66 | PfxRexW)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(TrapMachineInsn::Atomic, length);  // A<opSize>
    }

    // ==== Scalar loads and stores

    // OP_MOV_EbGv
    // OP_MOV_GvEb
    // 88 = MOV src=reg, dst=mem/reg (8 bit int only)
    // 8A = MOV src=mem/reg, dst=reg (8 bit int only)
    if ((insn.get(delta + 0) == 0x88 || insn.get(delta + 0) == 0x8A) &&
        ModRMisM(insn.get(delta + 1)) && isEmpty(prefixes)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(insn.get(delta + 0) == 0x88
                                 ? TrapMachineInsn::Store8
                                 : TrapMachineInsn::Load8,
                             length);
    }

    // OP_MOV_EvGv
    // OP_MOV_GvEv
    // 89 = MOV src=reg, dst=mem/reg (64/32/16 bit int only)
    // 8B = MOV src=mem/reg, dst=reg (64/32/16 bit int only)
    if ((insn.get(delta + 0) == 0x89 || insn.get(delta + 0) == 0x8B) &&
        ModRMisM(insn.get(delta + 1)) && hasOnly(prefixes, Pfx66 | PfxRexW)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(insn.get(delta + 0) == 0x89
                                 ? TrapMachineInsnForStore(opSize)
                                 : TrapMachineInsnForLoad(opSize),
                             length);
    }

    // OP_GROUP11_EvIb GROUP11_MOV
    // C6 /0 = MOV src=immediate8, dst=mem (8 bit int only)
    if (insn.get(delta + 0) == 0xC6 && ModRMisM(insn.get(delta + 1)) &&
        ModRMmid3(insn.get(delta + 1)) == 0 && isEmpty(prefixes)) {
      // Don't forget "+ 1" for the immediate.
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) + 1;
      return SummarizeResult(TrapMachineInsn::Store8, length);
    }
    // OP_GROUP11_EvIz GROUP11_MOV
    // C7 /0 = MOV src=immediate32, dst=mem (64/32/16 bit int only)
    if (insn.get(delta + 0) == 0xC7 && ModRMisM(insn.get(delta + 1)) &&
        ModRMmid3(insn.get(delta + 1)) == 0 &&
        hasOnly(prefixes, Pfx66 | PfxRexW)) {
      // Don't forget the immediate.
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) +
                        ImmediateSizeFromOperationSize(opSize);
      return SummarizeResult(TrapMachineInsnForStore(opSize), length);
    }

    // OP_2BYTE_ESCAPE OP2_MOVZX_GvEb
    // OP_2BYTE_ESCAPE OP2_MOVSX_GvEb
    // 0F B6 = MOVZB{W,L,Q} src=reg/mem, dst=reg (8 -> 16, 32 or 64, int only)
    // 0F BE = MOVSB{W,L,Q} src=reg/mem, dst=reg (8 -> 16, 32 or 64, int only)
    if (insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0xB6 || insn.get(delta + 1) == 0xBE) &&
        ModRMisM(insn.get(delta + 2)) &&
        (opSize == 2 || opSize == 4 || opSize == 8) &&
        hasOnly(prefixes, Pfx66 | PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Load8, length);
    }
    // OP_2BYTE_ESCAPE OP2_MOVZX_GvEw
    // OP_2BYTE_ESCAPE OP2_MOVSX_GvEw
    // 0F B7 = MOVZW{L,Q} src=reg/mem, dst=reg (16 -> 32 or 64, int only)
    // 0F BF = MOVSW{L,Q} src=reg/mem, dst=reg (16 -> 32 or 64, int only)
    if (insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0xB7 || insn.get(delta + 1) == 0xBF) &&
        ModRMisM(insn.get(delta + 2)) && (opSize == 4 || opSize == 8) &&
        hasOnly(prefixes, PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Load16, length);
    }

    // OP_MOVSXD_GvEv
    // REX.W 63 = MOVSLQ src=reg32/mem32, dst=reg64
    if (hasAllOf(prefixes, PfxRexW) && insn.get(delta + 0) == 0x63 &&
        ModRMisM(insn.get(delta + 1)) && hasOnly(prefixes, Pfx66 | PfxRexW)) {
      uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
      return SummarizeResult(TrapMachineInsn::Load32, length);
    }

    // ==== SSE{2,3,E3,4} insns

    // OP_2BYTE_ESCAPE OP2_MOVPS_VpsWps
    // OP_2BYTE_ESCAPE OP2_MOVPS_WpsVps
    // 0F 10 = MOVUPS src=xmm/mem128, dst=xmm
    // 0F 11 = MOVUPS src=xmm, dst=xmm/mem128
    if (insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0x10 || insn.get(delta + 1) == 0x11) &&
        ModRMisM(insn.get(delta + 2)) && hasOnly(prefixes, PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(insn.get(delta + 1) == 0x10
                                 ? TrapMachineInsn::Load128
                                 : TrapMachineInsn::Store128,
                             length);
    }

    // OP_2BYTE_ESCAPE OP2_MOVLPS_VqEq
    // OP_2BYTE_ESCAPE OP2_MOVHPS_VqEq
    // 0F 12 = MOVLPS src=xmm64/mem64, dst=xmm
    // 0F 16 = MOVHPS src=xmm64/mem64, dst=xmm
    if (insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0x12 || insn.get(delta + 1) == 0x16) &&
        ModRMisM(insn.get(delta + 2)) && hasOnly(prefixes, PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Load64, length);
    }

    // OP_2BYTE_ESCAPE OP2_MOVLPS_EqVq
    // OP_2BYTE_ESCAPE OP2_MOVHPS_EqVq
    // 0F 13 = MOVLPS src=xmm64, dst=xmm64/mem64
    // 0F 17 = MOVHPS src=xmm64, dst=xmm64/mem64
    if (insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0x13 || insn.get(delta + 1) == 0x17) &&
        ModRMisM(insn.get(delta + 2)) && hasOnly(prefixes, PfxRexW)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Store64, length);
    }

    // PRE_SSE_F2 OP_2BYTE_ESCAPE OP2_MOVSD_VsdWsd
    // PRE_SSE_F2 OP_2BYTE_ESCAPE OP2_MOVSD_WsdVsd
    // F2 0F 10 = MOVSD src=mem64/xmm64, dst=xmm64
    // F2 0F 11 = MOVSD src=xmm64, dst=mem64/xmm64
    if (hasAllOf(prefixes, PfxF2) && insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0x10 || insn.get(delta + 1) == 0x11) &&
        ModRMisM(insn.get(delta + 2)) && hasOnly(prefixes, PfxRexW | PfxF2)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(insn.get(delta + 1) == 0x10
                                 ? TrapMachineInsn::Load64
                                 : TrapMachineInsn::Store64,
                             length);
    }

    // PRE_SSE_F2 OP_2BYTE_ESCAPE OP2_MOVDDUP_VqWq
    // F2 0F 12 = MOVDDUP src=mem64/xmm64, dst=xmm
    if (hasAllOf(prefixes, PfxF2) && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0x12 && ModRMisM(insn.get(delta + 2)) &&
        hasOnly(prefixes, PfxF2)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(TrapMachineInsn::Load64, length);
    }

    // PRE_SSE_F3 OP_2BYTE_ESCAPE OP2_MOVSS_VssWss (name does not exist)
    // PRE_SSE_F3 OP_2BYTE_ESCAPE OP2_MOVSS_WssVss (name does not exist)
    // F3 0F 10 = MOVSS src=mem32/xmm32, dst=xmm32
    // F3 0F 11 = MOVSS src=xmm32, dst=mem32/xmm32
    if (hasAllOf(prefixes, PfxF3) && insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0x10 || insn.get(delta + 1) == 0x11) &&
        ModRMisM(insn.get(delta + 2)) && hasOnly(prefixes, PfxRexW | PfxF3)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(insn.get(delta + 1) == 0x10
                                 ? TrapMachineInsn::Load32
                                 : TrapMachineInsn::Store32,
                             length);
    }

    // PRE_SSE_F3 OP_2BYTE_ESCAPE OP2_MOVDQ_VdqWdq
    // PRE_SSE_F3 OP_2BYTE_ESCAPE OP2_MOVDQ_WdqVdq
    // F3 0F 6F = MOVDQU src=mem128/xmm, dst=xmm
    // F3 0F 7F = MOVDQU src=xmm, dst=mem128/xmm
    if (hasAllOf(prefixes, PfxF3) && insn.get(delta + 0) == 0x0F &&
        (insn.get(delta + 1) == 0x6F || insn.get(delta + 1) == 0x7F) &&
        ModRMisM(insn.get(delta + 2)) && hasOnly(prefixes, PfxF3)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2);
      return SummarizeResult(insn.get(delta + 1) == 0x6F
                                 ? TrapMachineInsn::Load128
                                 : TrapMachineInsn::Store128,
                             length);
    }

    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_3A OP3_PINSRB_VdqEvIb
    // 66 0F 3A 20 /r ib = PINSRB $imm8, src=mem8/ireg8, dst=xmm128.  I'd guess
    // that REX.W is meaningless here and therefore we should exclude it.
    if (hasAllOf(prefixes, Pfx66) && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0x3A && insn.get(delta + 2) == 0x20 &&
        ModRMisM(insn.get(delta + 3)) && hasOnly(prefixes, Pfx66)) {
      uint32_t length = delta + 3 + AddressModeLength(insn, delta + 3) + 1;
      return SummarizeResult(TrapMachineInsn::Load8, length);
    }
    // PRE_SSE_66 OP_2BYTE_ESCAPE OP2_PINSRW
    // 66 0F C4 /r ib = PINSRW $imm8, src=mem16/ireg16, dst=xmm128.  REX.W is
    // probably meaningless here.
    if (hasAllOf(prefixes, Pfx66) && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0xC4 && ModRMisM(insn.get(delta + 2)) &&
        hasOnly(prefixes, Pfx66)) {
      uint32_t length = delta + 2 + AddressModeLength(insn, delta + 2) + 1;
      return SummarizeResult(TrapMachineInsn::Load16, length);
    }
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_3A OP3_INSERTPS_VpsUps
    // 66 0F 3A 21 /r ib = INSERTPS $imm8, src=mem32/xmm32, dst=xmm128.
    // REX.W is probably meaningless here.
    if (hasAllOf(prefixes, Pfx66) && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0x3A && insn.get(delta + 2) == 0x21 &&
        ModRMisM(insn.get(delta + 3)) && hasOnly(prefixes, Pfx66)) {
      uint32_t length = delta + 3 + AddressModeLength(insn, delta + 3) + 1;
      return SummarizeResult(TrapMachineInsn::Load32, length);
    }

    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_3A OP3_PEXTRB_EvVdqIb
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_3A OP3_PEXTRW_EwVdqIb
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_3A OP3_EXTRACTPS_EdVdqIb
    // 66 0F 3A 14 /r ib = PEXTRB src=xmm8, dst=reg8/mem8
    // 66 0F 3A 15 /r ib = PEXTRW src=xmm16, dst=reg16/mem16
    // 66 0F 3A 17 /r ib = EXTRACTPS src=xmm32, dst=reg32/mem32
    // REX.W is probably meaningless here.
    if (hasAllOf(prefixes, Pfx66) && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0x3A &&
        (insn.get(delta + 2) == 0x14 || insn.get(delta + 2) == 0x15 ||
         insn.get(delta + 2) == 0x17) &&
        ModRMisM(insn.get(delta + 3)) && hasOnly(prefixes, Pfx66)) {
      uint32_t length = delta + 3 + AddressModeLength(insn, delta + 3) + 1;
      return SummarizeResult(
          insn.get(delta + 2) == 0x14   ? TrapMachineInsn::Store8
          : insn.get(delta + 2) == 0x15 ? TrapMachineInsn::Store16
                                        : TrapMachineInsn::Store32,
          length);
    }

    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_38 OP3_PMOVSXBW_VdqWdq
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_38 OP3_PMOVSXWD_VdqWdq
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_38 OP3_PMOVSXDQ_VdqWdq
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_38 OP3_PMOVZXBW_VdqWdq
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_38 OP3_PMOVZXWD_VdqWdq
    // PRE_SSE_66 OP_2BYTE_ESCAPE ESCAPE_38 OP3_PMOVZXDQ_VdqWdq
    // 66 0F 38 20 /r = PMOVSXBW src=mem64/xmm64, dst=xmm
    // 66 0F 38 23 /r = PMOVSXWD src=mem64/xmm64, dst=xmm
    // 66 0F 38 25 /r = PMOVSXDQ src=mem64/xmm64, dst=xmm
    // 66 0F 38 30 /r = PMOVZXBW src=mem64/xmm64, dst=xmm
    // 66 0F 38 33 /r = PMOVZXWD src=mem64/xmm64, dst=xmm
    // 66 0F 38 35 /r = PMOVZXDQ src=mem64/xmm64, dst=xmm
    if (hasAllOf(prefixes, Pfx66) && insn.get(delta + 0) == 0x0F &&
        insn.get(delta + 1) == 0x38 &&
        (insn.get(delta + 2) == 0x20 || insn.get(delta + 2) == 0x23 ||
         insn.get(delta + 2) == 0x25 || insn.get(delta + 2) == 0x30 ||
         insn.get(delta + 2) == 0x33 || insn.get(delta + 2) == 0x35) &&
        ModRMisM(insn.get(delta + 3)) && hasOnly(prefixes, Pfx66)) {
      uint32_t length = delta + 3 + AddressModeLength(insn, delta + 3);
      return SummarizeResult(TrapMachineInsn::Load64, length);
    }

    // The insn only has legacy prefixes, and was not identified.
    return SummarizeResult();
  }

  // We're dealing with a VEX-prefixed insn.  Fish out relevant bits of the
  // VEX prefix.  VEX prefixes come in two kinds: a 3-byte prefix, first byte
  // 0xC4, which gives us 16 bits of extra data, and a 2-byte prefix, first
  // byte 0xC5, which gives us 8 bits of extra data.  The 2-byte variant
  // contains a subset of the data that the 3-byte variant does and
  // (presumably) is to be used when the default values of the omitted fields
  // are correct for the instruction that is encoded.
  //
  // An instruction can't have both VEX and REX prefixes, because a 3-byte VEX
  // prefix specifies everything a REX prefix does, that is, the four bits
  // REX.{WRXB} and allowing both to be present would allow conflicting values
  // for them.  Of these four bits, we only care about REX.W (as obtained here
  // from the VEX prefix).
  //
  // A VEX prefix can also specify (imply?) the presence of the legacy
  // prefixes 66, F2 and F3.  Although the byte sequence we will have parsed
  // for this insn doesn't actually contain any of those, we must decode as if
  // we had seen them as legacy prefixes.
  //
  // A VEX prefix can also specify (imply?) the presence of the opcode escape
  // byte sequences 0F, 0F38 and 0F3A.  These are collected up into `esc`.
  // Again, we must decode as if we had actually seen these, although we
  // haven't really.
  //
  // The VEX prefix also holds various other bits which we ignore, because
  // these specify details of registers etc which we don't care about.
  MOZ_ASSERT(hasVEX && !hasREX);
  MOZ_ASSERT(hasNoneOf(prefixes, PfxRexW | PfxLock));
  MOZ_ASSERT(insn.get(delta + 0) == 0xC4 || insn.get(delta + 0) == 0xC5);

  Escape esc = EscNone;

  if (insn.get(delta + 0) == 0xC4) {
    // This is a 3-byte VEX prefix (3 bytes including the 0xC4).
    switch (insn.get(delta + 1) & 0x1F) {
      case 1:
        esc = Esc0F;
        break;
      case 2:
        esc = Esc0F38;
        break;
      case 3:
        esc = Esc0F3A;
        break;
      default:
        return SummarizeResult();
    }
    switch (insn.get(delta + 2) & 3) {
      case 0:
        break;
      case 1:
        prefixes |= Pfx66;
        break;
      case 2:
        prefixes |= PfxF3;
        break;
      case 3:
        prefixes |= PfxF2;
        break;
    }
    if (insn.get(delta + 2) & 4) {
      // VEX.L distinguishes 128-bit (VEX.L==0) from 256-bit (VEX.L==1)
      // operations.
      prefixes |= PfxVexL;
    }
    if ((insn.get(delta + 2) & 0x80) && is64bit) {
      // Pull out REX.W, but only on 64-bit targets.  We'll need it for insn
      // decoding.  Recall that REX.W == 1 basically means "the
      // integer-register (GPR) aspect of this instruction requires a 64-bit
      // transaction", so we expect these to be relatively rare, since VEX is
      // primary used for SIMD instructions.
      prefixes |= PfxRexW;
    }
    // Step forwards to the primary opcode byte
    delta += 3;
  } else if (insn.get(delta + 0) == 0xC5) {
    // This is a 2-byte VEX prefix (2 bytes including the 0xC5).  Since it has
    // only 8 bits of useful payload, it adds less information than an 0xC4
    // prefix.
    esc = Esc0F;
    switch (insn.get(delta + 1) & 3) {
      case 0:
        break;
      case 1:
        prefixes |= Pfx66;
        break;
      case 2:
        prefixes |= PfxF3;
        break;
      case 3:
        prefixes |= PfxF2;
        break;
    }
    if (insn.get(delta + 1) & 4) {
      prefixes |= PfxVexL;
    }
    delta += 2;
  }

  // This isn't allowed.
  if (hasAllOf(prefixes, PfxF2 | PfxF3)) {
    return SummarizeResult();
  }

  // This is useful for diagnosing decoding failures.
  // if (0) {
  //   fprintf(stderr, "FAIL  VEX  66=%d,F2=%d,F3=%d,REXW=%d,VEXL=%d esc=%s\n",
  //           (prefixes & Pfx66) ? 1 : 0, (prefixes & PfxF2) ? 1 : 0,
  //           (prefixes & PfxF3) ? 1 : 0, (prefixes & PfxRexW) ? 1 : 0,
  //           (prefixes & PfxVexL) ? 1 : 0,
  //           esc == Esc0F3A   ? "0F3A"
  //           : esc == Esc0F38 ? "0F38"
  //           : esc == Esc0F   ? "0F"
  //                            : "none");
  // }

  // (vex prefix) OP2_MOVPS_VpsWps
  // (vex prefix) OP2_MOVPS_WpsVps
  // 66=0,F2=0,F3=0,REXW=0,VEXL=0 esc=0F 10 = VMOVUPS src=xmm/mem128, dst=xmm
  // 66=0,F2=0,F3=0,REXW=0,VEXL=0 esc=0F 11 = VMOVUPS src=xmm, dst=xmm/mem128
  // REX.W is ignored.
  if (hasNoneOf(prefixes, Pfx66 | PfxF2 | PfxF3 | PfxRexW | PfxVexL) &&
      esc == Esc0F &&
      (insn.get(delta + 0) == 0x10 || insn.get(delta + 0) == 0x11) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(insn.get(delta + 0) == 0x10
                               ? TrapMachineInsn::Load128
                               : TrapMachineInsn::Store128,
                           length);
  }

  // (vex prefix) OP2_MOVSD_VsdWsd
  // (vex prefix) OP2_MOVSD_WsdVsd
  // 66=0,F2=1,F3=0,REXW=0,VEXL=0 esc=0F 10 = VMOVSD src=mem64, dst=xmm
  // 66=0,F2=1,F3=0,REXW=0,VEXL=0 esc=0F 11 = VMOVSD src=xmm, dst=mem64
  // REX.W and VEX.L are ignored.
  if (hasAllOf(prefixes, PfxF2) &&
      hasNoneOf(prefixes, Pfx66 | PfxF3 | PfxRexW | PfxVexL) && esc == Esc0F &&
      (insn.get(delta + 0) == 0x10 || insn.get(delta + 0) == 0x11) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(insn.get(delta + 0) == 0x10
                               ? TrapMachineInsn::Load64
                               : TrapMachineInsn::Store64,
                           length);
  }

  // (vex prefix) OP2_MOVSS_VssWss (name does not exist)
  // (vex prefix) OP2_MOVSS_WssVss (name does not exist)
  // 66=0,F2=0,F3=1,REXW=0,VEXL=0 esc=0F 10 = VMOVSS src=mem32, dst=xmm
  // 66=0,F2=0,F3=1,REXW=0,VEXL=0 esc=0F 11 = VMOVSS src=xmm, dst=mem32
  // REX.W and VEX.L are ignored.
  if (hasAllOf(prefixes, PfxF3) &&
      hasNoneOf(prefixes, Pfx66 | PfxF2 | PfxRexW | PfxVexL) && esc == Esc0F &&
      (insn.get(delta + 0) == 0x10 || insn.get(delta + 0) == 0x11) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(insn.get(delta + 0) == 0x10
                               ? TrapMachineInsn::Load32
                               : TrapMachineInsn::Store32,
                           length);
  }

  // (vex prefix) OP2_MOVDDUP_VqWq
  // 66=0,F2=1,F3=0,REXW=0,VEXL=0 esc=0F 12 = VMOVDDUP src=xmm/m64, dst=xmm
  // REX.W is ignored.
  if (hasAllOf(prefixes, PfxF2) &&
      hasNoneOf(prefixes, Pfx66 | PfxF3 | PfxRexW | PfxVexL) && esc == Esc0F &&
      insn.get(delta + 0) == 0x12 && ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(TrapMachineInsn::Load64, length);
  }

  // (vex prefix) OP2_MOVLPS_EqVq
  // (vex prefix) OP2_MOVHPS_EqVq
  // 66=0,F2=0,F3=0,REXW=0,VEXL=0 esc=0F 13 = VMOVLPS src=xmm, dst=mem64
  // 66=0,F2=0,F3=0,REXW=0,VEXL=0 esc=0F 17 = VMOVHPS src=xmm, dst=mem64
  // REX.W is ignored.  These do a 64-bit mem transaction despite the 'S' in
  // the name, because a pair of float32s are transferred.
  if (hasNoneOf(prefixes, Pfx66 | PfxF2 | PfxF3 | PfxRexW | PfxVexL) &&
      esc == Esc0F &&
      (insn.get(delta + 0) == 0x13 || insn.get(delta + 0) == 0x17) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(TrapMachineInsn::Store64, length);
  }

  // (vex prefix) OP2_MOVDQ_VdqWdq
  // (vex prefix) OP2_MOVDQ_WdqVdq
  // 66=0,F2=0,F3=1,REXW=0,VEXL=0 esc=0F 6F = VMOVDQU src=xmm/mem128, dst=xmm
  // 66=0,F2=0,F3=1,REXW=0,VEXL=0 esc=0F 7F = VMOVDQU src=xmm, dst=xmm/mem128
  // REX.W is ignored.
  if (hasAllOf(prefixes, PfxF3) &&
      hasNoneOf(prefixes, Pfx66 | PfxF2 | PfxRexW | PfxVexL) && esc == Esc0F &&
      (insn.get(delta + 0) == 0x6F || insn.get(delta + 0) == 0x7F) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(insn.get(delta + 0) == 0x6F
                               ? TrapMachineInsn::Load128
                               : TrapMachineInsn::Store128,
                           length);
  }

  // (vex prefix) OP2_PINSRW
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=OF C4
  //                              = PINSRW $imm8,src=ireg/mem16,src=xmm,dst=xmm
  // REX.W is ignored.
  if (hasAllOf(prefixes, Pfx66) &&
      hasNoneOf(prefixes, PfxF2 | PfxF3 | PfxRexW | PfxVexL) && esc == Esc0F &&
      insn.get(delta + 0) == 0xC4 && ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) + 1;
    return SummarizeResult(TrapMachineInsn::Load16, length);
  }

  // (vex prefix) OP3_PMOVSXBW_VdqWdq
  // (vex prefix) OP3_PMOVSXWD_VdqWdq
  // (vex prefix) OP3_PMOVSXDQ_VdqWdq
  // (vex prefix) OP3_PMOVZXBW_VdqWdq
  // (vex prefix) OP3_PMOVZXWD_VdqWdq
  // (vex prefix) OP3_PMOVZXDQ_VdqWdq
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 20 = VPMOVSXBW src=xmm/m64, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 23 = VPMOVSXWD src=xmm/m64, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 25 = VPMOVSXDQ src=xmm/m64, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 30 = VPMOVZXBW src=xmm/m64, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 33 = VPMOVZXWD src=xmm/m64, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 35 = VPMOVZXDQ src=xmm/m64, dst=xmm
  // REX.W is ignored.
  if (hasAllOf(prefixes, Pfx66) &&
      hasNoneOf(prefixes, PfxF2 | PfxF3 | PfxRexW | PfxVexL) &&
      esc == Esc0F38 &&
      (insn.get(delta + 0) == 0x20 || insn.get(delta + 0) == 0x23 ||
       insn.get(delta + 0) == 0x25 || insn.get(delta + 0) == 0x30 ||
       insn.get(delta + 0) == 0x33 || insn.get(delta + 0) == 0x35) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(TrapMachineInsn::Load64, length);
  }

  // (vex prefix) OP3_VBROADCASTB_VxWx
  // (vex prefix) OP3_VBROADCASTW_VxWx
  // (vex prefix) OP3_VBROADCASTSS_VxWd
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 78
  //                                   = VPBROADCASTB src=xmm8/mem8, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 79
  //                                   = VPBROADCASTW src=xmm16/mem16, dst=xmm
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F38 18
  //                                   = VBROADCASTSS src=m32, dst=xmm
  // VPBROADCASTB/W require REX.W == 0; VBROADCASTSS ignores REX.W.
  if (hasAllOf(prefixes, Pfx66) &&
      hasNoneOf(prefixes, PfxF2 | PfxF3 | PfxRexW | PfxVexL) &&
      esc == Esc0F38 &&
      (insn.get(delta + 0) == 0x78 || insn.get(delta + 0) == 0x79 ||
       insn.get(delta + 0) == 0x18) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1);
    return SummarizeResult(insn.get(delta + 0) == 0x78 ? TrapMachineInsn::Load8
                           : insn.get(delta + 0) == 0x79
                               ? TrapMachineInsn::Load16
                               : TrapMachineInsn::Load32,
                           length);
  }

  // (vex prefix) OP3_PEXTRB_EvVdqIb
  // (vex prefix) OP3_PEXTRW_EwVdqIb
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F3A 14
  //                                 = VPEXTRB $imm8, src=xmm, dst=ireg/mem8
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F3A 15
  //                                 = VPEXTRW $imm8, src=xmm, dst=ireg/mem16
  // These require REX.W == 0.
  if (hasAllOf(prefixes, Pfx66) &&
      hasNoneOf(prefixes, PfxF2 | PfxF3 | PfxRexW | PfxVexL) &&
      esc == Esc0F3A &&
      (insn.get(delta + 0) == 0x14 || insn.get(delta + 0) == 0x15) &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) + 1;
    return SummarizeResult(insn.get(delta + 0) == 0x14
                               ? TrapMachineInsn::Store8
                               : TrapMachineInsn::Store16,
                           length);
  }

  // (vex prefix) OP3_EXTRACTPS_EdVdqIb
  // 66=1,F2=0,F3=0,REXW=0,VEXL=0 esc=0F3A 17
  //                               = VEXTRACTPS $imm8, src=xmm, dst=ireg/mem32
  // REX.W is ignored.
  if (hasAllOf(prefixes, Pfx66) &&
      hasNoneOf(prefixes, PfxF2 | PfxF3 | PfxRexW | PfxVexL) &&
      esc == Esc0F3A && insn.get(delta + 0) == 0x17 &&
      ModRMisM(insn.get(delta + 1))) {
    uint32_t length = delta + 1 + AddressModeLength(insn, delta + 1) + 1;
    return SummarizeResult(TrapMachineInsn::Store32, length);
  }

  // The instruction was not identified.
  return SummarizeResult();
}

// ================================================================= arm64 ====

#elif defined(JS_CODEGEN_ARM64)

static SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  // Check instruction alignment.
  MOZ_ASSERT(insn.isU32aligned());

  const uint32_t insnBits = insn.getU32LittleEndian(0);

#  define INSN(_maxIx, _minIx) \
    ((insnBits >> (_minIx)) & ((uint32_t(1) << ((_maxIx) - (_minIx) + 1)) - 1))

  // MacroAssembler::wasmTrapInstruction uses this to create SIGILL.
  if (insnBits == 0xD4A00000) {
    static_assert(WasmTrapInstructionLength == 4);
    return SummarizeResult(TrapMachineInsn::OfficialUD, 4);
  }

  // A note about loads and stores.  Many (perhaps all) integer loads and
  // stores use bits 31:30 of the instruction as a size encoding, thusly:
  //
  //   11 -> 64 bit, 10 -> 32 bit, 01 -> 16 bit, 00 -> 8 bit
  //
  // It is also very common for corresponding load and store instructions to
  // differ by exactly one bit (logically enough).
  //
  // Meaning of register names:
  //
  //   Xn      The n-th GPR (all 64 bits), for 0 <= n <= 31
  //   Xn|SP   The n-th GPR (all 64 bits), for 0 <= n <= 30, or SP when n == 31
  //   Wn      The lower 32 bits of the n-th GPR
  //   Qn      All 128 bits of the n-th SIMD register
  //   Dn      Lower 64 bits of the n-th SIMD register
  //   Sn      Lower 32 bits of the n-th SIMD register

  // Plain and zero-extending loads/stores, reg + offset, scaled
  switch (INSN(31, 22)) {
    // 11 111 00100 imm12 n t = STR Xt, [Xn|SP, #imm12 * 8]
    case 0b11'111'00100:
      return SummarizeResult(TrapMachineInsn::Store64, 4);
    // 10 111 00100 imm12 n t = STR Wt, [Xn|SP, #imm12 * 4]
    case 0b10'111'00100:
      return SummarizeResult(TrapMachineInsn::Store32, 4);
    // 01 111 00100 imm12 n t = STRH Wt, [Xn|SP, #imm12 * 2]
    case 0b01'111'00100:
      return SummarizeResult(TrapMachineInsn::Store16, 4);
    // 00 111 00100 imm12 n t = STRB Wt, [Xn|SP, #imm12 * 1]
    case 0b00'111'00100:
      return SummarizeResult(TrapMachineInsn::Store8, 4);
    // 11 111 00101 imm12 n t = LDR Xt, [Xn|SP, #imm12 * 8]
    case 0b11'111'00101:
      return SummarizeResult(TrapMachineInsn::Load64, 4);
    // 10 111 00101 imm12 n t = LDR Wt, [Xn|SP, #imm12 * 4]
    case 0b10'111'00101:
      return SummarizeResult(TrapMachineInsn::Load32, 4);
    // 01 111 00101 imm12 n t = LDRH Wt, [Xn|SP, #imm12 * 2]
    case 0b01'111'00101:
      return SummarizeResult(TrapMachineInsn::Load16, 4);
    // 00 111 00101 imm12 n t = LDRB Wt, [Xn|SP, #imm12 * 1]
    case 0b00'111'00101:
      return SummarizeResult(TrapMachineInsn::Load8, 4);
  }

  // Plain, sign- and zero-extending loads/stores, reg + offset, unscaled

  if (INSN(11, 10) == 0b00) {
    switch (INSN(31, 21)) {
      // 11 111 00001 0 imm9 00 n t = LDUR Xt, [Xn|SP, #imm9]
      case 0b11'111'00001'0:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // 10 111 00001 0 imm9 00 n t = LDUR Wt, [Xn|SP, #imm9]
      case 0b10'111'00001'0:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // 01 111 00001 0 imm9 00 n t = LDURH Wt, [Xn|SP, #imm9]
      case 0b01'111'00001'0:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // We do have code to generate LDURB insns, but it appears to not be used.
      // 11 111 00000 0 imm9 00 n t = STUR Xt, [Xn|SP, #imm9]
      case 0b11'111'00000'0:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // 10 111 00000 0 imm9 00 n t = STUR Wt, [Xn|SP, #imm9]
      case 0b10'111'00000'0:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // 01 111 00000 0 imm9 00 n t = STURH Wt, [Xn|SP, #imm9]
      case 0b01'111'00000'0:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      // STURB missing?
      // Sign extending loads:
      // 10 111 000 10 0 imm9 00 n t = LDURSW Xt, [Xn|SP, #imm9]
      case 0b10'111'000'10'0:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // 01 111 000 11 0 imm9 00 n t = LDURSH Wt, [Xn|SP, #imm9]
      // 01 111 000 10 0 imm9 00 n t = LDURSH Xt, [Xn|SP, #imm9]
      case 0b01'111'000'11'0:
      case 0b01'111'000'10'0:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
    }
  }

  // Sign extending loads, reg + offset, scaled

  switch (INSN(31, 22)) {
    // 10 111 001 10 imm12 n t = LDRSW Xt, [Xn|SP, #imm12 * 4]
    case 0b10'111'001'10:
      return SummarizeResult(TrapMachineInsn::Load32, 4);
    // 01 111 001 10 imm12 n t = LDRSH Xt, [Xn|SP, #imm12 * 2]
    // 01 111 001 11 imm12 n t = LDRSH Wt, [Xn|SP, #imm12 * 2]
    case 0b01'111'001'10:
    case 0b01'111'001'11:
      return SummarizeResult(TrapMachineInsn::Load16, 4);
    // 00 111 001 10 imm12 n t = LDRSB Xt, [Xn|SP, #imm12 * 1]
    // 00 111 001 11 imm12 n t = LDRSB Wt, [Xn|SP, #imm12 * 1]
    case 0b00'111'001'10:
    case 0b00'111'001'11:
      return SummarizeResult(TrapMachineInsn::Load8, 4);
  }

  // Sign extending loads, reg + reg(extended/shifted)

  if (INSN(11, 10) == 0b10) {
    switch (INSN(31, 21)) {
      // 10 1110001 01 m opt s 10 n t = LDRSW Xt, [Xn|SP, R<m>{ext/sh}]
      case 0b10'1110001'01:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // 01 1110001 01 m opt s 10 n t = LDRSH Xt, [Xn|SP, R<m>{ext/sh}]
      case 0b01'1110001'01:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // 01 1110001 11 m opt s 10 n t = LDRSH Wt, [Xn|SP, R<m>{ext/sh}]
      case 0b01'1110001'11:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // 00 1110001 01 m opt s 10 n t = LDRSB Xt, [Xn|SP, R<m>{ext/sh}]
      case 0b00'1110001'01:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // 00 1110001 11 m opt s 10 n t = LDRSB Wt, [Xn|SP, R<m>{ext/sh}]
      case 0b00'1110001'11:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
    }
  }

  // Plain and zero-extending loads/stores, reg + reg(extended/shifted)

  if (INSN(11, 10) == 0b10) {
    switch (INSN(31, 21)) {
      // 11 111000001 m opt s 10 n t = STR Xt, [Xn|SP, Rm{ext/sh}]
      case 0b11'111000001:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // 10 111000001 m opt s 10 n t = STR Wt, [Xn|SP, Rm{ext/sh}]
      case 0b10'111000001:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // 01 111000001 m opt s 10 n t = STRH Wt, [Xn|SP, Rm{ext/sh}]
      case 0b01'111000001:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      // 00 111000001 m opt s 10 n t = STRB Wt, [Xn|SP, Rm{ext/sh}]
      case 0b00'111000001:
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      // 11 111000011 m opt s 10 n t = LDR Xt, [Xn|SP, Rm{ext/sh}]
      case 0b11'111000011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // 10 111000011 m opt s 10 n t = LDR Wt, [Xn|SP, Rm{ext/sh}]
      case 0b10'111000011:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // 01 111000011 m opt s 10 n t = LDRH Wt, [Xn|SP, Rm{ext/sh}]
      case 0b01'111000011:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // 00 111000011 m opt s 10 n t = LDRB Wt, [Xn|SP, Rm{ext/sh}]
      case 0b00'111000011:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
    }
  }

  // SIMD - scalar FP

  switch (INSN(31, 22)) {
    // 11 111 101 00 imm12 n t = STR Dt, [Xn|SP + imm12 * 8]
    case 0b11'111'101'00:
      return SummarizeResult(TrapMachineInsn::Store64, 4);
    // 10 111 101 00 imm12 n t = STR St, [Xn|SP + imm12 * 4]
    case 0b10'111'101'00:
      return SummarizeResult(TrapMachineInsn::Store32, 4);
    // 11 111 101 01 imm12 n t = LDR Dt, [Xn|SP + imm12 * 8]
    case 0b11'111'101'01:
      return SummarizeResult(TrapMachineInsn::Load64, 4);
    // 10 111 101 01 imm12 n t = LDR St, [Xn|SP + imm12 * 4]
    case 0b10'111'101'01:
      return SummarizeResult(TrapMachineInsn::Load32, 4);
  }

  if (INSN(11, 10) == 0b00) {
    switch (INSN(31, 21)) {
      // 11 111 100 00 0 imm9 00 n t = STUR Dt, [Xn|SP, #imm9]
      case 0b11'111'100'00'0:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // 10 111 100 00 0 imm9 00 n t = STUR St, [Xn|SP, #imm9]
      case 0b10'111'100'00'0:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // 11 111 100 01 0 imm9 00 n t = LDUR Dt, [Xn|SP, #imm9]
      case 0b11'111'100'01'0:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // 10 111 100 01 0 imm9 00 n t = LDUR St, [Xn|SP, #imm9]
      case 0b10'111'100'01'0:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
    }
  }

  if (INSN(11, 10) == 0b10) {
    switch (INSN(31, 21)) {
      // 11 111100 001 m opt s 10 n t = STR Dt, [Xn|SP, Rm{ext/sh}]
      case 0b11'111100'001:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // 10 111100 001 m opt s 10 n t = STR St, [Xn|SP, Rm{ext/sh}]
      case 0b10'111100'001:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // 11 111100 011 m opt s 10 n t = LDR Dt, [Xn|SP, Rm{ext/sh}]
      case 0b11'111100'011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // 10 111100 011 m opt s 10 n t = LDR St, [Xn|SP, Rm{ext/sh}]
      case 0b10'111100'011:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
    }
  }

  // SIMD - whole register

  if (INSN(11, 10) == 0b00) {
    // 00 111 100 10 0 imm9 00 n t = STUR Qt, [Xn|SP, #imm9]
    if (INSN(31, 21) == 0b00'111'100'10'0) {
      return SummarizeResult(TrapMachineInsn::Store128, 4);
    }
    // 00 111 100 11 0 imm9 00 n t = LDUR Qt, [Xn|SP, #imm9]
    if (INSN(31, 21) == 0b00'111'100'11'0) {
      return SummarizeResult(TrapMachineInsn::Load128, 4);
    }
  }

  // 00 111 101 10 imm12 n t = STR Qt, [Xn|SP + imm12 * 16]
  if (INSN(31, 22) == 0b00'111'101'10) {
    return SummarizeResult(TrapMachineInsn::Store128, 4);
  }
  // 00 111 101 11 imm12 n t = LDR Qt, [Xn|SP + imm12 * 16]
  if (INSN(31, 22) == 0b00'111'101'11) {
    return SummarizeResult(TrapMachineInsn::Load128, 4);
  }

  if (INSN(11, 10) == 0b10) {
    // 00 111100 101 m opt s 10 n t = STR Qt, [Xn|SP, Rm{ext/sh}]
    if (INSN(31, 21) == 0b00'111100'101) {
      return SummarizeResult(TrapMachineInsn::Store128, 4);
    }
    // 00 111100 111 m opt s 10 n t = LDR Qt, [Xn|SP, Rm{ext/sh}]
    if (INSN(31, 21) == 0b00'111100'111) {
      return SummarizeResult(TrapMachineInsn::Load128, 4);
    }
  }

  // Atomics - loads/stores "exclusive" (with reservation) (LL/SC)

  switch (INSN(31, 10)) {
    // 11 001000 010 11111 0 11111 n t = LDXR  Xt, [Xn|SP]
    case 0b11'001000'010'11111'0'11111:
      return SummarizeResult(TrapMachineInsn::Load64, 4);
    // 10 001000 010 11111 0 11111 n t = LDXR  Wt, [Xn|SP]
    case 0b10'001000'010'11111'0'11111:
      return SummarizeResult(TrapMachineInsn::Load32, 4);
    // 01 001000 010 11111 0 11111 n t = LDXRH Wt, [Xn|SP]
    case 0b01'001000'010'11111'0'11111:
      return SummarizeResult(TrapMachineInsn::Load16, 4);
    // 00 001000 010 11111 0 11111 n t = LDXRB Wt, [Xn|SP]
    case 0b00'001000'010'11111'0'11111:
      return SummarizeResult(TrapMachineInsn::Load8, 4);
      // We are never asked to examine store-exclusive instructions, because any
      // store-exclusive should be preceded by a load-exclusive instruction of
      // the same size and for the same address.  So the TrapSite is omitted for
      // the store-exclusive since the load-exclusive will trap first.
  }

  // Atomics - atomic memory operations which do (LD- variants) or do not
  // (ST-variants) return the original value at the location.

  // 11 111 0000 11 s 0 000 00 n 11111 = STADDL  Xs, [Xn|SP]
  // 10 111 0000 11 s 0 000 00 n 11111 = STADDL  Ws, [Xn|SP]
  // 01 111 0000 11 s 0 000 00 n 11111 = STADDLH Ws, [Xn|SP]
  // 00 111 0000 11 s 0 000 00 n 11111 = STADDLB Ws, [Xn|SP]
  // and the same for
  // ---------------- 0 001 00 ------- = STCLRL
  // ---------------- 0 010 00 ------- = STEORL
  // ---------------- 0 011 00 ------- = STSETL
  if (INSN(29, 21) == 0b111'0000'11 && INSN(4, 0) == 0b11111) {
    switch (INSN(15, 10)) {
      case 0b0'000'00:  // STADDL
      case 0b0'001'00:  // STCLRL
      case 0b0'010'00:  // STEORL
      case 0b0'011'00:  // STSETL
        return SummarizeResult(TrapMachineInsn::Atomic, 4);
    }
  }

  // 11 111 0001 11 s 0 000 00 n t = LDADDAL  Xs, Xt, [Xn|SP]
  // 10 111 0001 11 s 0 000 00 n t = LDADDAL  Ws, Wt, [Xn|SP]
  // 01 111 0001 11 s 0 000 00 n t = LDADDALH Ws, Wt, [Xn|SP]
  // 00 111 0001 11 s 0 000 00 n t = LDADDALB Ws, Wt, [Xn|SP]
  // and the same for
  // ---------------- 0 001 00 --- = LDCLRAL
  // ---------------- 0 010 00 --- = LDEORAL
  // ---------------- 0 011 00 --- = LDSETAL
  if (INSN(29, 21) == 0b111'0001'11) {
    switch (INSN(15, 10)) {
      case 0b0'000'00:  // LDADDAL
      case 0b0'001'00:  // LDCLRAL
      case 0b0'010'00:  // LDEORAL
      case 0b0'011'00:  // LDSETAL
        return SummarizeResult(TrapMachineInsn::Atomic, 4);
    }
  }

  // Atomics -- compare-and-swap and plain swap

  // 11 001000111 s 111111 n t = CASAL  Xs, Xt, [Xn|SP]
  // 10 001000111 s 111111 n t = CASAL  Ws, Wt, [Xn|SP]
  // 01 001000111 s 111111 n t = CASALH Ws, Wt, [Xn|SP]
  // 00 001000111 s 111111 n t = CASALB Ws, Wt, [Xn|SP]
  if (INSN(29, 21) == 0b001000111 && INSN(15, 10) == 0b111111) {
    return SummarizeResult(TrapMachineInsn::Atomic, 4);
  }

  // 11 11100011 1 s 100000 n t = SWPAL  Xs, Xt, [Xn|SP]
  // 10 11100011 1 s 100000 n t = SWPAL  Ws, Wt, [Xn|SP]
  // 01 11100011 1 s 100000 n t = SWPALH Ws, Wt, [Xn|SP]
  // 00 11100011 1 s 100000 n t = SWPALB Ws, Wt, [Xn|SP]
  if (INSN(29, 21) == 0b11100011'1 && INSN(15, 10) == 0b100000) {
    return SummarizeResult(TrapMachineInsn::Atomic, 4);
  }

#  undef INSN

  // The instruction was not identified.

  // This is useful for diagnosing decoding failures.
  // if (0) {
  //   fprintf(stderr, "insn = ");
  //   for (int i = 31; i >= 0; i--) {
  //     fprintf(stderr, "%c", ((insn >> i) & 1) ? '1' : '0');
  //     if (i < 31 && (i % 4) == 0) fprintf(stderr, " ");
  //   }
  //   fprintf(stderr, "\n");
  // }

  return SummarizeResult();
}

// =================================================================== arm ====

#elif defined(JS_CODEGEN_ARM)

static SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  // Almost all AArch32 instructions that use the ARM encoding (not Thumb) use
  // bits 31:28 as the guarding condition.  Since we do not expect to
  // encounter conditional loads or stores, most of the following is hardcoded
  // to check that those bits are 1110 (0xE), which is the "always execute"
  // condition.  An exception is Neon instructions, which are never
  // conditional and so have those bits set to 1111 (0xF).

  // Check instruction alignment.
  MOZ_ASSERT(insn.isU32aligned());

  const uint32_t insnBits = insn.getU32LittleEndian(0);

#  define INSN(_maxIx, _minIx) \
    ((insnBits >> (_minIx)) & ((uint32_t(1) << ((_maxIx) - (_minIx) + 1)) - 1))

  // MacroAssembler::wasmTrapInstruction uses this to create SIGILL.
  if (insnBits == 0xE7F000F0) {
    static_assert(WasmTrapInstructionLength == 4);
    return SummarizeResult(TrapMachineInsn::OfficialUD, 4);
  }

  // 31   27   23   19 15 11
  // cond 0101 U000 Rn Rt imm12 = STR<cond>  Rt, [Rn, +/- #imm12]
  // cond 0101 U001 Rn Rt imm12 = LDR<cond>  Rt, [Rn, +/- #imm12]
  // cond 0101 U100 Rn Rt imm12 = STRB<cond> Rt, [Rn, +/- #imm12]
  // cond 0101 U101 Rn Rt imm12 = LDRB<cond> Rt, [Rn, +/- #imm12]
  // if cond != 1111 and Rn != 1111
  // U = 1 for +, U = 0 for -
  if (INSN(31, 28) == 0b1110  // unconditional
      && INSN(27, 24) == 0b0101 && INSN(19, 16) != 0b1111) {
    switch (INSN(22, 20)) {
      case 0b000:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      case 0b100:
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      default:
        break;
    }
  }

  // 31   27   23   19 15 11   7    3
  // cond 0001 U100 Rn Rt imm4 1011 imm4 = STRH<cond>  Rt, [Rn +/- #imm8]
  // cond 0001 U101 Rn Rt imm4 1101 imm4 = LDRSB<cond> Rt, [Rn +/- #imm8]
  // cond 0001 U101 Rn Rt imm4 1111 imm4 = LDRSH<cond> Rt, [Rn +/- #imm8]
  // cond 0001 U101 Rn Rt imm4 1011 imm4 = LDRH<cond>  Rt, [Rn +/- #imm8]
  // U = 1 for +, U = 0 for -
  if (INSN(31, 28) == 0b1110  // unconditional
      && INSN(27, 24) == 0b0001 && INSN(22, 21) == 0b10) {
    switch ((INSN(20, 20) << 4) | INSN(7, 4)) {
      case 0b0'1011:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      case 0b1'1101:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      case 0b1'1111:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      case 0b1'1011:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      default:
        break;
    }
  }

  // clang-format off
  //
  // 31   27   23   19 15 11    6  4 3
  // cond 0111 U000 Rn Rt shimm 00 0 Rm = STR<cond>  Rt, [Rn, +/- Rm, [lsl #shimm]]
  // cond 0111 U100 Rn Rt shimm 00 0 Rm = STRB<cond> Rt, [Rn, +/- Rm, [lsl #shimm]]
  // cond 0111 U001 Rn Rt shimm 00 0 Rm = LDR<cond>  Rt, [Rn, +/- Rm, [lsl #shimm]]
  // cond 0111 U101 Rn Rt shimm 00 0 Rm = LDRB<cond> Rt, [Rn, +/- Rm, [lsl #shimm]]
  // U = 1 for +, U = 0 for -
  //
  // clang-format on
  if (INSN(31, 28) == 0b1110                             // unconditional
      && INSN(27, 24) == 0b0111 && INSN(6, 4) == 0b00'0  // lsl
  ) {
    switch (INSN(22, 20)) {
      case 0b000:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      case 0b100:
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      default:
        break;
    }
  }

  // 31   27   23   19 15 11   7    3
  // cond 0001 U000 Rn Rt 0000 1011 Rm = STRH<cond>  Rt, [Rn, +/- Rm]
  // cond 0001 U001 Rn Rt 0000 1011 Rm = LDRH<cond>  Rt, [Rn, +/- Rm]
  // cond 0001 U001 Rn Rt 0000 1101 Rm = LDRSB<cond> Rt, [Rn, +/- Rm]
  // cond 0001 U001 Rn Rt 0000 1111 Rm = LDRSH<cond> Rt, [Rn, +/- Rm]
  if (INSN(31, 28) == 0b1110  // unconditional
      && INSN(27, 24) == 0b0001 && INSN(22, 21) == 0b00 &&
      INSN(11, 8) == 0b0000) {
    switch ((INSN(20, 20) << 4) | INSN(7, 4)) {
      case 0b0'1011:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      case 0b1'1011:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      case 0b1'1101:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      case 0b1'1111:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      default:
        break;
    }
  }

  // 31   27   23   19 15 11   7
  // cond 1101 UD00 Rn Vd 1010 imm8 = VSTR<cond> Sd, [Rn +/- #imm8]
  // cond 1101 UD00 Rn Vd 1011 imm8 = VSTR<cond> Dd, [Rn +/- #imm8]
  // cond 1101 UD01 Rn Vd 1010 imm8 = VLDR<cond> Sd, [Rn +/- #imm8]
  // cond 1101 UD01 Rn Vd 1011 imm8 = VLDR<cond> Dd, [Rn +/- #imm8]
  // U = 1 for +, U = 0 for -
  // D is an extension of Vd (so can be anything)
  if (INSN(31, 28) == 0b1110  // unconditional
      && INSN(27, 24) == 0b1101 && INSN(21, 21) == 0b0) {
    switch ((INSN(20, 20) << 4) | (INSN(11, 8))) {
      case 0b0'1010:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      case 0b0'1011:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      case 0b1'1010:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      case 0b1'1011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      default:
        break;
    }
  }

  // 31   27   23   19 15 11   7    3
  // 1111 0100 1D00 Rn Vd 1000 0000 1111 = VST1.32 {Dd[0], [Rn]
  // 1111 0100 1D10 Rn Vd 1000 0000 1111 = VLD1.32 {Dd[0], [Rn]
  if (INSN(31, 23) == 0b1111'0100'1 && INSN(20, 20) == 0 &&
      INSN(11, 0) == 0b1000'0000'1111) {
    return INSN(21, 21) == 1 ? SummarizeResult(TrapMachineInsn::Load32, 4)
                             : SummarizeResult(TrapMachineInsn::Store32, 4);
  }

  // 31   27   23   19 15 11   7    3
  // 1111 0100 0D00 Rn Vd 0111 1100 1111 = VST1.64 {Dd], [Rn]
  // 1111 0100 0D10 Rn Vd 0111 1100 1111 = VLD1.64 {Dd], [Rn]
  if (INSN(31, 23) == 0b1111'0100'0 && INSN(20, 20) == 0 &&
      INSN(11, 0) == 0b0111'1100'1111) {
    return INSN(21, 21) == 1 ? SummarizeResult(TrapMachineInsn::Load64, 4)
                             : SummarizeResult(TrapMachineInsn::Store64, 4);
  }

  // 31   27   23   19 15 11   7    3
  // cond 0001 1101 n  t  1111 1001 1111 = LDREXB<cond> Rt, [Rn]
  // cond 0001 1111 n  t  1111 1001 1111 = LDREXH<cond> Rt, [Rn]
  // cond 0001 1001 n  t  1111 1001 1111 = LDREX<cond>  Rt, [Rn]
  // cond 0001 1011 n  t  1111 1001 1111 = LDREXD<cond> Rt, [Rn]
  if (INSN(31, 23) == 0b1110'0001'1 && INSN(11, 0) == 0b1111'1001'1111) {
    switch (INSN(22, 20)) {
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      case 0b111:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      default:
        break;
    }
  }

#  undef INSN

  // The instruction was not identified.

  // This is useful for diagnosing decoding failures.
  // if (0) {
  //   fprintf(stderr, "insn = ");
  //   for (int i = 31; i >= 0; i--) {
  //     fprintf(stderr, "%c", ((insn >> i) & 1) ? '1' : '0');
  //     if (i < 31 && (i % 4) == 0) fprintf(stderr, " ");
  //   }
  //   fprintf(stderr, "\n");
  // }

  return SummarizeResult();
}

// =============================================================== riscv64 ====

#elif defined(JS_CODEGEN_RISCV64)

static SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  // Check instruction alignment.
  MOZ_ASSERT(insn.isU32aligned());

  const uint32_t insnBits = insn.getU32LittleEndian(0);

#  define INSN(_maxIx, _minIx) \
    ((insnBits >> (_minIx)) & ((uint32_t(1) << ((_maxIx) - (_minIx) + 1)) - 1))

  // MacroAssembler::wasmTrapInstruction uses this to create SIGILL.
  if (insnBits == 0xc0035073) {  // "csrwi csr_cycle, 0x6"
    static_assert(WasmTrapInstructionLength == 4);
    return SummarizeResult(TrapMachineInsn::OfficialUD, 4);
  }

  if (INSN(6, 0) == STORE) {
    switch (INSN(14, 12)) {
      case 0b011:  // sd
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      case 0b010:  // sw
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      case 0b001:  // sh
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      case 0b000:  // sb
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      default:
        break;
    }
  }

  if (INSN(6, 0) == LOAD) {
    switch (INSN(14, 12)) {
      case 0b110:  // lwu
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      case 0b101:  // lhu
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      case 0b100:  // lbu
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      case 0b011:  // ld
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      case 0b010:  // lw
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      case 0b001:  // lh
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      case 0b000:  // lb
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      default:
        break;
    }
  }

  if (INSN(6, 0) == LOAD_FP) {
    switch (INSN(14, 12)) {
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      case 0b010:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      default:
        break;
    }
  }

  if (INSN(6, 0) == STORE_FP) {
    switch (INSN(14, 12)) {
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      case 0b010:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      default:
        break;
    }
  }

  if (INSN(6, 0) == AMO && INSN(31, 27) == 0b00010) {
    // TODO: change these to TMI::Atomic
    switch (INSN(14, 12)) {
      case 0b011:  // lr.d.aqrl
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      case 0b010:  // lr.w.aqrl
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      default:
        break;
    }
  }

  if (INSN(6, 0) == AMO && INSN(31, 27) == 0b00011) {
    // TODO: change these to TMI::Atomic
    switch (INSN(14, 12)) {
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      case 0b010:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      default:
        break;
    }
  }

  if (INSN(6, 0) == AMO) {
    switch (INSN(31, 27)) {
      case 0b00001:  // AMOSWAP.W/D
      case 0b00000:  // AMOADD.W/D
      case 0b00100:  // AMOXOR.W/D
      case 0b01100:  // AMOAND.W/D
      case 0b01000:  // AMOOR.W/D
        return SummarizeResult(TrapMachineInsn::Atomic, 4);
      default:
        break;
    }
  }

#  undef INSN

  return SummarizeResult();
}

// =========================================================== loongarch64 ====

#elif defined(JS_CODEGEN_LOONG64)

SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  // Check instruction alignment.
  MOZ_ASSERT(insn.isU32aligned());

  const uint32_t insnBits = insn.getU32LittleEndian(0);

#  define INSN(_maxIx, _minIx) \
    ((insnBits >> (_minIx)) & ((uint32_t(1) << ((_maxIx) - (_minIx) + 1)) - 1))

  // LoongArch instructions encoding document:
  // https://loongson.github.io/LoongArch-Documentation/LoongArch-Vol1-EN#table-of-instruction-encoding

  // MacroAssembler::wasmTrapInstruction uses this to create SIGILL.
  // break 0x6
  if (insnBits == 0x002A0006) {
    static_assert(WasmTrapInstructionLength == 4);
    return SummarizeResult(TrapMachineInsn::OfficialUD, 4);
  }

  switch (INSN(31, 15) << 15) {
    case op_amcas_db_b:
    case op_amcas_db_h:
    case op_amcas_db_w:
    case op_amcas_db_d:
    case op_amswap_db_b:
    case op_amswap_db_h:
    case op_amswap_db_w:
    case op_amswap_db_d:
    case op_amadd_db_b:
    case op_amadd_db_h:
    case op_amadd_db_w:
    case op_amadd_db_d:
    case op_amand_db_w:
    case op_amand_db_d:
    case op_amor_db_w:
    case op_amor_db_d:
    case op_amxor_db_w:
    case op_amxor_db_d:
      return SummarizeResult(TrapMachineInsn::Atomic, 4);
    default:
      break;
  }

  // Loads/stores with reg + offset (si12).
  if (INSN(31, 26) == 0b001010) {
    switch (INSN(25, 22)) {
      // ld.b  rd, rj, si12
      case 0b0000:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // ld.h  rd, rj, si12
      case 0b0001:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // ld.w  rd, rj, si12
      case 0b0010:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // ld.d  rd, rj, si12
      case 0b0011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // st.b  rd, rj, si12
      case 0b0100:
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      // st.h  rd, rj, si12
      case 0b0101:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      // st.w  rd, rj, si12
      case 0b0110:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // st.d  rd, rj, si12
      case 0b0111:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // ld.bu  rd, rj, si12
      case 0b1000:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // ld.hu  rd, rj, si12
      case 0b1001:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // ld.wu  rd, rj, si12
      case 0b1010:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // preld  hint, rj, si12
      case 0b1011:
        break;
      // fld.s  fd, rj, si12
      case 0b1100:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // fst.s  fd, rj, si12
      case 0b1101:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // fld.d  fd, rj, si12
      case 0b1110:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // fst.s  fd, rj, si12
      case 0b1111:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      default:
        break;
    }
  }

  // Loads/stores with reg + reg.
  if (INSN(31, 22) == 0b0011100000 && INSN(17, 15) == 0b000) {
    switch (INSN(21, 18)) {
      // ldx.b  rd, rj, rk
      case 0b0000:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // ldx.h  rd, rj, rk
      case 0b0001:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // ldx.w  rd, rj, rk
      case 0b0010:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // ldx.d  rd, rj, rk
      case 0b0011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // stx.b  rd, rj, rk
      case 0b0100:
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      // stx.h  rd, rj, rk
      case 0b0101:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      // stx.w  rd, rj, rk
      case 0b0110:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // stx.d  rd, rj, rk
      case 0b0111:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // ldx.bu  rd, rj, rk
      case 0b1000:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // ldx.hu  rd, rj, rk
      case 0b1001:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // ldx.wu  rd, rj, rk
      case 0b1010:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // preldx  hint, rj, rk
      case 0b1011:
        break;
      // fldx.s  fd, rj, rk
      case 0b1100:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // fldx.d  fd, rj, rk
      case 0b1101:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // fstx.s  fd, rj, rk
      case 0b1110:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // fstx.d  fd, rj, rk
      case 0b1111:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      default:
        break;
    }
  }

  // Loads/stores with reg + offset (si14).
  //   1. Atomics - loads/stores "exclusive" (with reservation) (LL/SC)
  //   2. {ld/st}ptr.{w/d}
  if (INSN(31, 27) == 0b00100) {
    switch (INSN(26, 24)) {
      // ll.w  rd, rj, si14
      case 0b000:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // ll.d  rd, rj, si14
      case 0b010:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // ldptr.w  rd, rj, si14
      case 0b100:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // stptr.w  rd, rj, si14
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // ldptr.d  rd, rj, si14
      case 0b110:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // stptr.d  rd, rj, si14
      case 0b111:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      default:
        break;
        // We are never asked to examine store-exclusive instructions, because
        // any store-exclusive should be preceded by a load-exclusive
        // instruction of the same size and for the same address.  So the
        // TrapSite is omitted for the store-exclusive since the load-exclusive
        // will trap first.
    }
  }

#  undef INSN

  return SummarizeResult();
}

// ================================================================ mips64 ====

#elif defined(JS_CODEGEN_MIPS64)

SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  // Check instruction alignment.
  MOZ_ASSERT(insn.isU32aligned());

  const uint32_t insnBits = insn.getU32LittleEndian(0);

#  define INSN(_maxIx, _minIx) \
    ((insnBits >> (_minIx)) & ((uint32_t(1) << ((_maxIx) - (_minIx) + 1)) - 1))

  // MIPS64R2 instruction encoding document:
  // https://scc.ustc.edu.cn/_upload/article/files/c6/06/45556c084631b2855f0022175eaf/W020100308600769158777.pdf#G254.1001018

  // Loongson GS464 extension:
  // No official encoding document. Refer to binutils-gdb/opcodes/mips-opc.c and
  // https://github.com/FlyGoat/loongson-insn/blob/master/loongson-ext.md
  // instead.

  // MacroAssembler::wasmTrapInstruction uses this to create SIGILL.
  // teq zero, zero, 0x6
  if (insnBits == 0x000001b4) {
    static_assert(WasmTrapInstructionLength == 4);
    return SummarizeResult(TrapMachineInsn::OfficialUD, 4);
  }

  // MIPS64 Encoding of the Opcode Field of memory access instructions.
  // +--------+--------------------------------------------------------+
  // |  bits  |                          28..26                        |
  // +--------+------+------+------+-------+------+------+------+------+
  // | 31..29 |  000 | 001  | 010  |  011  |  100 |  101 |  110 |  111 |
  // +--------+------+------+------+-------+------+------+------+------+
  // |   010  |      |      |      | COP1X |      |      |      |      |
  // |   011  |      |      |  LDL |  LDR  |      |      |      |      |
  // |   100  |  LB  |  LH  |  LWL |   LW  |  LBU |  LHU |  LWR |  LWU |
  // |   101  |  SB  |  SH  |  SWL |   SW  |  SDL |  SDR |  SWR |      |
  // |   110  |  LL  | LWC1 | LWC2 |       |  LLD | LDC1 | LDC2 |  LD  |
  // |   111  |  SC  | SWC1 | SWC2 |       |  SCD | SDC1 | SDC2 |  SD  |
  // +--------+------+------+------+-------+------+------+------+------+
  // Loongson GS464 Encoding of the Opcode and Function Field of memory access
  // extension instructions.
  // +--------+-------------------------------------------------------+
  // |  bits  |                          2..0                         |
  // +--------+-----+-----+-----+-----+-------+-------+-------+-------+
  // | 31..26 | 000 | 001 | 010 | 011 |  100  |  101  |  110  |  111  |
  // +--------+-----+-----+-----+-----+-------+-------+-------+-------+
  // | 110010 |     |     |     |     |GSLWLC1|GSLWRC1|GSLDLC1|GSLDRC1|
  // | 111010 |     |     |     |     |GSSWLC1|GSSWRC1|GSSDLC1|GSSDRC1|
  // | 110110 |GSLBX|GSLHX|GSLWX|GSLDX|       |       |GSLWXC1|GSLDXC1|
  // | 111110 |GSLBX|GSLHX|GSLWX|GSLDX|       |       |GSSWXC1|GSSDXC1|
  // +--------+-----+-----+-----+-----+-------+-------+-------+-------+
  if (INSN(31, 29) == 0b010) {
    // MIPS64 COP1X Encoding of Function Field of memory access instructions.
    // +--------+-----------------------------------------------------+
    // |  bits  |                          2..0                       |
    // +--------+-------+-------+-----+-----+-----+-------+-----+-----+
    // |  5..3  |  000  |  001  | 010 | 011 | 100 |  101  | 110 | 111 |
    // +--------+-------+-------+-----+-----+-----+-------+-----+-----+
    // |   000  | LWXC1 | LDXC1 |     |     |     | LUXC1 |     |     |
    // |   001  | SWXC1 | SDXC1 |     |     |     | SUXC1 |     |     |
    // +--------+-------+-------+-----+-----+-----+-------+-----+-----+
    switch (INSN(5, 0)) {
      // lwxc1
      case 0b000000:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // ldxc1
      case 0b000001:
      // luxc1
      case 0b000101:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // swxc1
      case 0b001000:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // sdxc1
      case 0b001001:
      // suxc1
      case 0b001101:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      default:
        break;
    }
  } else if (INSN(31, 29) == 0b011) {
    switch (INSN(28, 26)) {
      // ldl
      case 0b010:
      // ldr
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      default:
        break;
    }
  } else if (INSN(31, 29) == 0b100) {
    switch (INSN(28, 26)) {
      // lb
      case 0b000:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // lh
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // lwl
      case 0b010:
      // lw
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // lbu
      case 0b100:
        return SummarizeResult(TrapMachineInsn::Load8, 4);
      // lhu
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Load16, 4);
      // lwr
      case 0b110:
      // lwu
      case 0b111:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
    }
  } else if (INSN(31, 29) == 0b101) {
    switch (INSN(28, 26)) {
      // sb
      case 0b000:
        return SummarizeResult(TrapMachineInsn::Store8, 4);
      // sh
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Store16, 4);
      // swl
      case 0b010:
      // sw
      case 0b011:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // sdl
      case 0b100:
      // sdr
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // swr
      case 0b110:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // cache
      case 0b111:
        break;
    }
  } else if (INSN(31, 29) == 0b110) {
    switch (INSN(28, 26)) {
      // ll
      case 0b000:
      // lwc1
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // lwc2
      case 0b010:
        if (jit::isLoongson()) {
          switch (INSN(2, 0)) {
            // gslsl
            case 0b100:
            // gslsr
            case 0b101:
              return SummarizeResult(TrapMachineInsn::Load32, 4);
            // gsldl
            case 0b110:
            // gsldr
            case 0b111:
              return SummarizeResult(TrapMachineInsn::Load64, 4);
            // invalid
            default:
              return SummarizeResult();
          }
        }
        return SummarizeResult(TrapMachineInsn::Load32, 4);
      // pref
      case 0b011:
        break;
      // lld
      case 0b100:
      // ldc1
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // ldc2
      case 0b110:
        if (jit::isLoongson()) {
          switch (INSN(2, 0)) {
            // gslbx
            case 0b000:
              return SummarizeResult(TrapMachineInsn::Load8, 4);
            // gslhx
            case 0b001:
              return SummarizeResult(TrapMachineInsn::Load16, 4);
            // gslwx
            case 0b010:
            // gslwx (float)
            case 0b110:
              return SummarizeResult(TrapMachineInsn::Load32, 4);
            // gsldx
            case 0b011:
            // gsldx (double)
            case 0b111:
              return SummarizeResult(TrapMachineInsn::Load64, 4);
            // invalid
            default:
              return SummarizeResult();
          }
        }
        return SummarizeResult(TrapMachineInsn::Load64, 4);
      // ld
      case 0b111:
        return SummarizeResult(TrapMachineInsn::Load64, 4);
    }
  } else if (INSN(31, 29) == 0b111) {
    switch (INSN(28, 26)) {
      // sc
      case 0b000:
      // swc1
      case 0b001:
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // swc2
      case 0b010:
        if (jit::isLoongson()) {
          switch (INSN(2, 0)) {
            // gsssl
            case 0b100:
            // gsssr
            case 0b101:
              return SummarizeResult(TrapMachineInsn::Store32, 4);
            // gssdl
            case 0b110:
            // gssdr
            case 0b111:
              return SummarizeResult(TrapMachineInsn::Store64, 4);
            // invalid
            default:
              return SummarizeResult();
          }
        }
        return SummarizeResult(TrapMachineInsn::Store32, 4);
      // reserved encoding
      case 0b011:
        break;
      // scd
      case 0b100:
      // sdc1
      case 0b101:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // sdc2
      case 0b110:
        if (jit::isLoongson()) {
          switch (INSN(2, 0)) {
            // gssbx
            case 0b000:
              return SummarizeResult(TrapMachineInsn::Store8, 4);
            // gsshx
            case 0b001:
              return SummarizeResult(TrapMachineInsn::Store16, 4);
            // gsswx
            case 0b010:
            // gsswx (float)
            case 0b110:
              return SummarizeResult(TrapMachineInsn::Store32, 4);
            // gssdx
            case 0b011:
            // gssdx (double)
            case 0b111:
              return SummarizeResult(TrapMachineInsn::Store64, 4);
            // invalid
            default:
              return SummarizeResult();
          }
        }
        return SummarizeResult(TrapMachineInsn::Store64, 4);
      // sd
      case 0b111:
        return SummarizeResult(TrapMachineInsn::Store64, 4);
    }
  }

#  undef INSN
  return SummarizeResult();
}

// ================================================================== none ====

#elif defined(JS_CODEGEN_NONE)

static SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn) {
  MOZ_CRASH();
}

// ================================================================= other ====

#else

#  error "SummarizeTrapInstruction: not implemented on this architecture"

#endif  // defined(JS_CODEGEN_*)

// External interface
SummarizeResult SummarizeTrapInstruction(const uint8_t* insn) {
  const InstructionBytesAbsolute iba(insn);
  return SummarizeTrapInstruction(iba);
}

SummarizeResult SummarizeTrapInstruction(const MacroAssembler& masm,
                                         uint32_t offset) {
  const InstructionBytesFromMasm ibfm(masm, offset);
  return SummarizeTrapInstruction(ibfm);
}

}  // namespace wasm
}  // namespace js
