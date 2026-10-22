/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/loong64/Architecture-loong64.h"

#include <cstdint>
#include <cstdlib>
#include <string_view>

#include "jit/FlushICache.h"  // js::jit::FlushICache
#include "jit/RegisterSets.h"
#include "jit/Simulator.h"

#if defined(__linux__) && !defined(JS_SIMULATOR_LOONG64)
#  if __has_include(<asm/hwcap.h>) && __has_include(<sys/auxv.h>)
#    define USE_HWCAP
#  endif
#  if __has_include(<larchintrin.h>)
#    define USE_LARCHINTRIN
#  endif
#endif

#ifdef USE_HWCAP
#  include <asm/hwcap.h>
#  include <sys/auxv.h>
#endif

#ifdef USE_LARCHINTRIN
#  include <larchintrin.h>

// https://loongson.github.io/LoongArch-Documentation/LoongArch-Vol1-EN.html#the-configuration-information-accessible-by-the-cpucfg-instruction
struct LOONGCpucfg2 {
  uint32_t raw;

  explicit LOONGCpucfg2(uint32_t raw) : raw(raw) {};

  constexpr bool Fp() const { return bits(raw, 0, 0); }
  constexpr bool FpSp() const { return bits(raw, 1, 1); }
  constexpr bool FpDp() const { return bits(raw, 2, 2); }
  constexpr uint32_t FpVer() const { return bits(raw, 5, 3); }
  constexpr bool Lsx() const { return bits(raw, 6, 6); }
  constexpr bool Lasx() const { return bits(raw, 7, 7); }
  constexpr bool Complex() const { return bits(raw, 8, 8); }
  constexpr bool Crypto() const { return bits(raw, 9, 9); }
  constexpr bool Lvz() const { return bits(raw, 10, 10); }
  constexpr uint32_t LvzVer() const { return bits(raw, 13, 11); }
  constexpr bool Llftp() const { return bits(raw, 14, 14); }
  constexpr uint32_t LlftpVer() const { return bits(raw, 17, 15); }
  constexpr bool LbtX86() const { return bits(raw, 18, 18); }
  constexpr bool LbtArm() const { return bits(raw, 19, 19); }
  constexpr bool LbtMips() const { return bits(raw, 20, 20); }
  constexpr bool Lspw() const { return bits(raw, 21, 21); }
  constexpr bool Lam() const { return bits(raw, 22, 22); }
  constexpr bool Hptw() const { return bits(raw, 24, 24); }
  constexpr bool Frecipe() const { return bits(raw, 25, 25); }
  constexpr bool Div32() const { return bits(raw, 26, 26); }
  constexpr bool LamBh() const { return bits(raw, 27, 27); }
  constexpr bool Lamcas() const { return bits(raw, 28, 28); }
  constexpr bool LlacqScrel() const { return bits(raw, 29, 29); }
  constexpr bool Scq() const { return bits(raw, 30, 30); }

 private:
  static constexpr uint32_t bits(uint32_t val, uint8_t hi, uint8_t lo) {
    return (val >> lo) & ((2u << (hi - lo)) - 1u);
  }
};
#endif

namespace js {
namespace jit {

Registers::Code Registers::FromName(const char* name) {
  for (size_t i = 0; i < Total; i++) {
    if (strcmp(GetName(i), name) == 0) {
      return Code(i);
    }
  }

  return Invalid;
}

FloatRegisters::Code FloatRegisters::FromName(const char* name) {
  for (size_t i = 0; i < Total; i++) {
    if (strcmp(GetName(i), name) == 0) {
      return Code(i);
    }
  }

  return Invalid;
}

FloatRegisterSet FloatRegister::ReduceSetForPush(const FloatRegisterSet& s) {
  SetType all = s.bits();

#if defined(ENABLE_JIT_SIMD)
  SetType set128b =
      (all & FloatRegisters::AllSimd128Mask) >> FloatRegisters::ShiftSimd128;
  SetType doubleSet =
      (all & FloatRegisters::AllDoubleMask) >> FloatRegisters::ShiftDouble;
  SetType singleSet =
      (all & FloatRegisters::AllSingleMask) >> FloatRegisters::ShiftSingle;

  // A register that is present as a 128-bit register is pushed once, as a
  // 16-byte value; singles and doubles are pushed as 8-byte values.
  SetType set64b = (singleSet | doubleSet) & ~set128b;

  SetType reduced = (set128b << FloatRegisters::ShiftSimd128) |
                    (set64b << FloatRegisters::ShiftDouble);
#else
  SetType doubleSet =
      (all & FloatRegisters::AllDoubleMask) >> FloatRegisters::ShiftDouble;
  SetType singleSet =
      (all & FloatRegisters::AllSingleMask) >> FloatRegisters::ShiftSingle;

  SetType set64b = singleSet | doubleSet;

  SetType reduced = set64b << FloatRegisters::ShiftDouble;
#endif

  return FloatRegisterSet(reduced);
}

uint32_t FloatRegister::GetPushSizeInBytes(const FloatRegisterSet& s) {
  SetType all = s.bits();

#if defined(ENABLE_JIT_SIMD)
  SetType set128b =
      (all & FloatRegisters::AllSimd128Mask) >> FloatRegisters::ShiftSimd128;
  SetType doubleSet =
      (all & FloatRegisters::AllDoubleMask) >> FloatRegisters::ShiftDouble;
  SetType singleSet =
      (all & FloatRegisters::AllSingleMask) >> FloatRegisters::ShiftSingle;

  SetType set64b = (singleSet | doubleSet) & ~set128b;

  return set128b.size() * SizeOfSimd128 + set64b.size() * sizeof(double);
#else
  SetType doubleSet =
      (all & FloatRegisters::AllDoubleMask) >> FloatRegisters::ShiftDouble;
  SetType singleSet =
      (all & FloatRegisters::AllSingleMask) >> FloatRegisters::ShiftSingle;

  SetType set64b = singleSet | doubleSet;

  return set64b.size() * sizeof(double);
#endif
}

uint32_t FloatRegister::getRegisterDumpOffsetInBytes() {
#if defined(ENABLE_JIT_SIMD)
  static_assert(sizeof(FloatRegisters::RegisterContent) == 16);
#else
  static_assert(sizeof(FloatRegisters::RegisterContent) == 8);
#endif
  return encoding() * sizeof(FloatRegisters::RegisterContent);
}

void FlushICache(void* code, size_t size) {
#if defined(JS_SIMULATOR)
  js::jit::SimulatorProcess::FlushICache(code, size);

#elif defined(__GNUC__)
  intptr_t end = reinterpret_cast<intptr_t>(code) + size;
  __builtin___clear_cache(reinterpret_cast<char*>(code),
                          reinterpret_cast<char*>(end));

#else
  _flush_cache(reinterpret_cast<char*>(code), size, BCACHE);

#endif
}

static const char* gLOONG64ISAString = nullptr;

void SetLOONG64ISAString(const char* isa) {
  MOZ_ASSERT(!LOONG64Flags::IsInitialized());
  gLOONG64ISAString = isa;
}

enum class LOONG64ISA {
  LA64V1_0,
  LA64V1_1,
};

static LOONG64Extensions ExtensionsFromISA(LOONG64ISA isa) {
  LOONG64Extensions extensions{};
  switch (isa) {
    case LOONG64ISA::LA64V1_1:
      extensions += LOONG64Extension::LamBh;
      extensions += LOONG64Extension::Lamcas;
      [[fallthrough]];
    case LOONG64ISA::LA64V1_0:
      extensions += LOONG64Extension::Lsx;
      break;
  }
  return extensions;
}

static LOONG64Extensions ParseLOONG64ISA(std::string_view sv) {
  if (sv == "la64v1.0") {
    return ExtensionsFromISA(LOONG64ISA::LA64V1_0);
  }
  if (sv == "la64v1.1") {
    return ExtensionsFromISA(LOONG64ISA::LA64V1_1);
  }
  fprintf(stderr, "unknown LoongArch ISA: %.*s\n", int(sv.length()), sv.data());
  return {};
}

static LOONG64Extensions ComputeLOONG64Extensions() {
#if defined(USE_HWCAP)
  // the toolchain doesn't yet know about them.
  enum LOONG64HwCap : uint64_t {
    LOONG64_HWCAP_LSX = (1ULL << 4),
  };

  // Assert the hardcoded feature bits match HWCAP_LOONGARCH_*.
#  ifdef HWCAP_LOONGARCH_LSX
  static_assert(HWCAP_LOONGARCH_LSX == LOONG64_HWCAP_LSX);
#  endif
#endif

  LOONG64Extensions extensions{};

#if defined(JS_SIMULATOR_LOONG64)
  extensions += LOONG64Extension::LamBh;
  extensions += LOONG64Extension::Lamcas;
  // The simulator does not support LSX yet.
#else
#  if defined(USE_LARCHINTRIN)
  // Some features are not exposed via HWCAP. Use raw CPUCFG instruction for
  // them.
  const LOONGCpucfg2 cpucfg2 = LOONGCpucfg2(__cpucfg(2));

  if (cpucfg2.LamBh()) {
    extensions += LOONG64Extension::LamBh;
  }
  if (cpucfg2.Lamcas()) {
    extensions += LOONG64Extension::Lamcas;
  }
#  endif
#  if defined(USE_HWCAP)
  // Some features need kernel support for context preservation. These must be
  // detected via HWCAP.
  const uint64_t hwcap = getauxval(AT_HWCAP);

  if (hwcap & LOONG64_HWCAP_LSX) {
    extensions += LOONG64Extension::Lsx;
  }
#  endif
#endif

  return extensions;
}

// static
void LOONG64Flags::Init() {
  MOZ_ASSERT(!IsInitialized());

  const auto supported = ComputeLOONG64Extensions();

  auto requested = supported;
  if (const auto* isa = std::getenv("LOONG64_ISA")) {
    requested = ParseLOONG64ISA(isa);
  } else if (gLOONG64ISAString) {
    requested = ParseLOONG64ISA(gLOONG64ISAString);
  }

  // Enable requested extensions if and only if they're also supported.
  auto actual = requested & supported;
  MOZ_ASSERT(!actual.contains(LOONG64Extension::Initialized));
  actual += LOONG64Extension::Initialized;

  extensions = actual;
}

bool CPUFlagsHaveBeenComputed() { return LOONG64Flags::IsInitialized(); }

}  // namespace jit
}  // namespace js
