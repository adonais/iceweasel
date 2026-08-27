/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef wasm_WasmSummarizeInsn_h
#define wasm_WasmSummarizeInsn_h

#include "wasm/WasmCodegenTypes.h"  // TrapMachineInsn

namespace js {
namespace wasm {

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

// A child of the above, that pulls bytes out of arbitrary memory.
class InstructionBytesAbsolute : public InstructionBytes {
  const uint8_t* insn_;

 public:
  explicit InstructionBytesAbsolute(const uint8_t* insn) : insn_(insn) {}
  bool isU32aligned() const override { return (uintptr_t(insn_) & 3) == 0; }
  uint8_t get(size_t offset) const override {
    MOZ_ASSERT(offset < 16);
    return insn_[offset];
  }
};

// SummarizeResult holds the result of a call to SummarizeTrapInstruction.
// If the instruction has been identified and its length computed,
// Status::Identified is set, and the instruction's TrapMachineInsn value and
// length are stored.  Otherwise, Status::Unknown is returned, and the other
// two fields are invalid.
class SummarizeResult {
  enum class Status { Unidentified, Identified };
  Status status_;
  TrapMachineInsn kind_;
  uint32_t length_;

 public:
  // The insn wasn't identified; we know nothing.
  SummarizeResult()
      : status_(Status::Unidentified),
        kind_(TrapMachineInsn::INVALID),
        length_(0) {}
  // The insn was definitively identified as a trapping instruction of the
  // specified kind, and we also know its length.
  SummarizeResult(TrapMachineInsn kind, uint32_t length)
      : status_(Status::Identified), kind_(kind), length_(length) {
    MOZ_ASSERT(length > 0 && length < 16 && kind_ != TrapMachineInsn::INVALID);
  }

  bool identified() const {
    bool ret = status_ == Status::Identified;
    MOZ_ASSERT_IF(
        ret, length_ > 0 && length_ < 16 && kind_ != TrapMachineInsn::INVALID);
    return ret;
  }

  TrapMachineInsn kind() const {
    MOZ_ASSERT(identified());
    return kind_;
  }
  uint32_t length() const {
    MOZ_ASSERT(identified());
    return length_;
  }
};

// Inspect the machine instruction at `insn` and return a classification as to
// what it is, and its length.  If the instruction can't be identified, return
// `SummarizeResult()`.  If the instruction is identified, the identification
// must be correct -- in other words, the `kind()` and `length()` values must be
// correct.  Return `SummarizeResult()` in case of doubt.
//
// This function is only used to inspect trapping instructions that have been
// created by wasm-baseline or -Ion.  So it doesn't need to handle the whole
// complexity of the machine's instruction set.  It only needs to handle the
// subset used by the trappable instructions we actually generate.

// The main entry point.
SummarizeResult SummarizeTrapInstruction(const InstructionBytes& insn);

// Convenience function that calls the above.
SummarizeResult SummarizeTrapInstruction(const uint8_t* insn);

}  // namespace wasm
}  // namespace js

#endif /* wasm_WasmSummarizeInsn_h */
