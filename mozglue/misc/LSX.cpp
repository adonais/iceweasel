/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* compile-time and runtime tests for whether to use LoongArch LSX/LASX
 * extensions. Adapted from js/src/jit/loong64/Architecture-loong64.cpp. */

#include "LSX.h"

#include "mozilla/Attributes.h"

#include <cstdint>
#include <optional>

#if defined(MOZILLA_LSX_HAVE_HWCAP_DETECTION)

#  include <asm/hwcap.h>
#  include <sys/auxv.h>

// the toolchain doesn't yet know about them.
enum LoongArchHwCap : uint64_t {
  LOONG64_HWCAP_LSX = (UINT64_C(1) << 4),
  LOONG64_HWCAP_LASX = (UINT64_C(1) << 5),
};

// Assert the hardcoded feature bits match HWCAP_LOONGARCH_*.
#  ifdef HWCAP_LOONGARCH_LSX
static_assert(HWCAP_LOONGARCH_LSX == LOONG64_HWCAP_LSX);
#  endif
#  ifdef HWCAP_LOONGARCH_LASX
static_assert(HWCAP_LOONGARCH_LASX == LOONG64_HWCAP_LASX);
#  endif

struct LoongArchCPUFlags {
  bool lsx = false;
  bool lasx = false;
};

[[maybe_unused]]
static LoongArchCPUFlags get_loongarch_cpu_flags() {
  // This could be expensive, so cache the result.
  static std::optional<LoongArchCPUFlags> cpu_flags = std::nullopt;

  if (cpu_flags) {  // already checked
    return *cpu_flags;
  }

  LoongArchCPUFlags new_flags;

  const uint64_t hwcap = getauxval(AT_HWCAP);

  if (hwcap & LOONG64_HWCAP_LSX) {
    new_flags.lsx = true;
  }
  if (hwcap & LOONG64_HWCAP_LASX) {
    new_flags.lasx = true;
  }

  cpu_flags = new_flags;
  return new_flags;
}

#endif

namespace mozilla {

namespace lsx_private {

#if defined(MOZILLA_LSX_HAVE_HWCAP_DETECTION)

#  if !defined(MOZILLA_PRESUME_LSX)
MOZ_RUNINIT bool lsx_enabled = get_loongarch_cpu_flags().lsx;
#  endif

#  if !defined(MOZILLA_PRESUME_LASX)
MOZ_RUNINIT bool lasx_enabled = get_loongarch_cpu_flags().lasx;
#  endif

#endif

}  // namespace lsx_private

}  // namespace mozilla
