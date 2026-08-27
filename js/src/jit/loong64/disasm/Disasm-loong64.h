/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef jit_loong64_disasm_Disasm_loong64_h
#define jit_loong64_disasm_Disasm_loong64_h

#include "mozilla/Span.h"

#include <stddef.h>
#include <stdint.h>

namespace js::jit {

class Instruction;

namespace disasm {

// A reasonable (ie, safe) buffer size for the disassembly of a single
// instruction.
inline constexpr size_t ReasonableBufferSize = 256;

// Interface and default implementation for converting addresses and
// register-numbers to text.  The default implementation is machine
// specific.
class NameConverter {
 public:
  virtual ~NameConverter() = default;

  virtual const char* nameOfCPURegister(uint32_t reg) const;
  virtual const char* nameOfFPURegister(uint32_t reg) const;
  virtual const char* nameOfAddress(const uint8_t* address) const;

 private:
  mutable char addressBuffer_[32];
};

class Disassembler final {
 public:
  explicit Disassembler(const NameConverter& converter)
      : converter_(converter) {}

  int disassemble(mozilla::Span<char> output,
                  const Instruction* instruction) const;
  int disassemble(mozilla::Span<char> output, const uint8_t* instruction) const;

 private:
  const NameConverter& converter_;
};

}  // namespace disasm
}  // namespace js::jit

#endif  // jit_loong64_disasm_Disasm_loong64_h
