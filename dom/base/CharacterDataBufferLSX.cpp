/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file should only be compiled if you're on LoongArch64.

#include <lsxintrin.h>

#include "CharacterDataBufferImpl.h"
#include "nscore.h"

namespace mozilla {
namespace LSX {

int32_t FirstNon8Bit(const char16_t* str, const char16_t* end) {
  using p = Non8BitParameters<sizeof(size_t)>;
  const size_t mask = p::mask();
  const uint32_t numUnicharsPerWord = p::numUnicharsPerWord();

  const uint32_t len = end - str;

  uint32_t i = 0;

  // Check 8 unichars at a time.
  const uint32_t vectWalkEnd = (len / 8) * 8;
  // Zero-extend 0x01 to 16-bit, then shift left by 8 bits, then broadcast.
  const __m128i kVec0x100u16x8 = __lsx_vldi(-0xaff);
  // TODO(loongarch64): Experimenting on Loongson 3B6000 showed that unrolling
  // this loop then vand.v these N results performs better on long inputs.
  for (; i < vectWalkEnd; i += 8) {
    __m128i vect = __lsx_vld(str + i, 0);
    // Contrary to intuition, __lsx_bz_h() means "branch if any 16-bit lane is
    // zero".
    // <https://jia.je/unofficial-loongarch-intrinsics-guide/lsx/branch/#int-__lsx_bz_h-__m128i-a>
    if (__lsx_bz_h(__lsx_vslt_hu(vect, kVec0x100u16x8))) {
      return int32_t(i);
    }
  }

  // Check one word at a time.
  const uint32_t wordWalkEnd =
      ((len - i) / numUnicharsPerWord) * numUnicharsPerWord;
  for (; i < wordWalkEnd; i += numUnicharsPerWord) {
    const size_t word = *reinterpret_cast<const size_t*>(str + i);
    if (word & mask) return int32_t(i);
  }

  // Take care of the remainder one character at a time.
  for (; i < len; i++) {
    if (str[i] > 255) {
      return int32_t(i);
    }
  }

  return -1;
}

}  // namespace LSX
}  // namespace mozilla
