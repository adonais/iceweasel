/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* compile-time and runtime tests for whether to use LoongArch SIMD Extension
 * (LSX/LASX) instructions */

#ifndef mozilla_LSX_h_
#define mozilla_LSX_h_

// for definition of MFBT_DATA
#include "mozilla/Types.h"

#if defined(__loongarch__)

// <https://github.com/loongson/la-toolchain-conventions/blob/36d207cd76301618624d10e67daf7b7f1c060411/LoongArch-toolchain-conventions-EN.adoc#cc-preprocessor-built-in-macro-definitions>
#  if defined(__loongarch_sx)
// It's ok to use LSX instructions based on the -march option.
#    define MOZILLA_PRESUME_LSX 1
#  endif
#  if defined(__loongarch_asx)
// It's ok to use LASX instructions based on the -march option.
#    define MOZILLA_PRESUME_LASX 1
#  endif

#  if defined(XP_LINUX)
#    if __has_include(<asm/hwcap.h>) && __has_include(<sys/auxv.h>)
#      define MOZILLA_LSX_HAVE_HWCAP_DETECTION
#    endif
#  endif

#endif

namespace mozilla {

namespace lsx_private {
#if defined(MOZILLA_LSX_HAVE_HWCAP_DETECTION)
#  if !defined(MOZILLA_PRESUME_LSX)
extern bool MFBT_DATA lsx_enabled;
#  endif
#  if !defined(MOZILLA_PRESUME_LASX)
extern bool MFBT_DATA lasx_enabled;
#  endif
#endif
}  // namespace lsx_private

#if defined(MOZILLA_PRESUME_LSX)
#  define MOZILLA_MAY_SUPPORT_LSX 1
inline bool supports_lsx() { return true; }
#elif defined(MOZILLA_LSX_HAVE_HWCAP_DETECTION)
#  define MOZILLA_MAY_SUPPORT_LSX 1
inline bool supports_lsx() { return lsx_private::lsx_enabled; }
#else
inline bool supports_lsx() { return false; }
#endif

#if defined(MOZILLA_PRESUME_LASX)
#  define MOZILLA_MAY_SUPPORT_LASX 1
inline bool supports_lasx() { return true; }
#elif defined(MOZILLA_LSX_HAVE_HWCAP_DETECTION)
#  define MOZILLA_MAY_SUPPORT_LASX 1
inline bool supports_lasx() { return lsx_private::lasx_enabled; }
#else
inline bool supports_lasx() { return false; }
#endif

}  // namespace mozilla

#endif /* ifndef mozilla_LSX_h_ */
