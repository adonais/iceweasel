/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/loong64/Architecture-loong64.h"

#include <cstdlib>
#include <string_view>

#include "jit/FlushICache.h"  // js::jit::FlushICache
#include "jit/RegisterSets.h"
#include "jit/Simulator.h"

#if defined(__linux__) && !defined(JS_SIMULATOR_LOONG64) && \
    __has_include(<asm/hwcap.h>) && __has_include(<sys/auxv.h>)
#  define USE_HWCAP
#endif

#ifdef USE_HWCAP
#  include <asm/hwcap.h>
#  include <sys/auxv.h>
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
#ifdef ENABLE_WASM_SIMD
#  error "Needs more careful logic if SIMD is enabled"
#endif

  LiveFloatRegisterSet ret;
  for (FloatRegisterIterator iter(s); iter.more(); ++iter) {
    ret.addUnchecked(FromCode((*iter).encoding()));
  }
  return ret.set();
}

uint32_t FloatRegister::GetPushSizeInBytes(const FloatRegisterSet& s) {
#ifdef ENABLE_WASM_SIMD
#  error "Needs more careful logic if SIMD is enabled"
#endif

  return s.size() * sizeof(double);
}

uint32_t FloatRegister::getRegisterDumpOffsetInBytes() {
#ifdef ENABLE_WASM_SIMD
#  error "Needs more careful logic if SIMD is enabled"
#endif

  return encoding() * sizeof(double);
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
      [[fallthrough]];
    case LOONG64ISA::LA64V1_0:
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
  // Copies the HWCAP_LOONGARCH_* bits to allow detecting newer features even if
  // the toolchain doesn't yet know about them.
  enum LOONG64HwCap : uint64_t {
    LOONG64_HWCAP_LAM_BH = (1ULL << 16),
  };

  // Assert the hardcoded feature bits match HWCAP_LOONGARCH_*.
#ifdef HWCAP_LOONGARCH_LAM_BH
  static_assert(HWCAP_LOONGARCH_LAM_BH == LOONG64_HWCAP_LAM_BH);
#endif

  LOONG64Extensions extensions{};

#if defined(JS_SIMULATOR_LOONG64)
  extensions += LOONG64Extension::LamBh;
#elif defined(USE_HWCAP)
  const uint64_t hwcap = getauxval(AT_HWCAP);
  if (hwcap & LOONG64_HWCAP_LAM_BH) {
    extensions += LOONG64Extension::LamBh;
  }
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
