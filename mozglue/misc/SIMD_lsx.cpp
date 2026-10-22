/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/SIMD.h"

#include "mozilla/Assertions.h"

// LSX intrinsics are only available when targeting LoongArch with LSX
// enabled; this file gets LSX_FLAGS from the build system.
#if defined(__loongarch__)

#  include <bit>
#  include <cstdint>
#  include <cstring>
#  include <lsxintrin.h>
#  include <type_traits>

namespace mozilla {

template <typename T>
T GetAs(uintptr_t ptr) {
  return *reinterpret_cast<const T*>(ptr);
}

// Akin to ceil/floor, AlignDown/AlignUp will return the original pointer if it
// is already aligned.
static uintptr_t AlignDown16(uintptr_t ptr) { return ptr & ~(uintptr_t)0xf; }

static uintptr_t AlignUp16(uintptr_t ptr) { return AlignDown16(ptr + 0xf); }

enum class HaystackOverlap {
  Overlapping,
  Sequential,
};

template <typename TValue>
static inline __m128i SplatNeedle(TValue value) {
  static_assert(sizeof(TValue) == 1 || sizeof(TValue) == 2 ||
                sizeof(TValue) == 4 || sizeof(TValue) == 8);
  if constexpr (sizeof(TValue) == 1) {
    return __lsx_vreplgr2vr_b(static_cast<uint8_t>(value));
  } else if constexpr (sizeof(TValue) == 2) {
    return __lsx_vreplgr2vr_h(static_cast<uint16_t>(value));
  } else if constexpr (sizeof(TValue) == 4) {
    return __lsx_vreplgr2vr_w(static_cast<uint32_t>(value));
  } else {
    return __lsx_vreplgr2vr_d(static_cast<uint64_t>(value));
  }
}

static inline __m128i LoadVec(uintptr_t ptr) {
  return __lsx_vld(reinterpret_cast<void*>(ptr), 0);
}

template <typename TValue>
static inline __m128i CmpEq128(__m128i a, __m128i b) {
  static_assert(sizeof(TValue) == 1 || sizeof(TValue) == 2 ||
                sizeof(TValue) == 4 || sizeof(TValue) == 8);
  if constexpr (sizeof(TValue) == 1) {
    return __lsx_vseq_b(a, b);
  } else if constexpr (sizeof(TValue) == 2) {
    return __lsx_vseq_h(a, b);
  } else if constexpr (sizeof(TValue) == 4) {
    return __lsx_vseq_w(a, b);
  } else {
    return __lsx_vseq_d(a, b);
  }
}

// Per the Unofficial Intrinsics Guide, vmskltz.b sets one bit per byte whose
// sign bit is set, packing the 16 flags into the low half of the result.
// vpickve2gr.hu then yields a mask with one bit per byte, like
// _mm_movemask_epi8.
// <https://jia.je/unofficial-loongarch-intrinsics-guide/migrating_sse/#:~:text=_mm_movemask_epi8>
static inline uint32_t MovemaskBytes(__m128i cmp) {
  return __lsx_vpickve2gr_hu(__lsx_vmskltz_b(cmp), 0);
}

static inline __m128i Load32BitsIntoVec(uintptr_t ptr) {
  uint32_t tmp;
  memcpy(&tmp, reinterpret_cast<void*>(ptr), sizeof(tmp));
  return __lsx_vinsgr2vr_w(__lsx_vldi(0), tmp, 0);
}

static const char* Check4x4Chars(__m128i needle, uintptr_t a, uintptr_t b,
                                 uintptr_t c, uintptr_t d) {
  __m128i haystackA = Load32BitsIntoVec(a);
  __m128i cmpA = CmpEq128<uint8_t>(needle, haystackA);
  __m128i haystackB = Load32BitsIntoVec(b);
  __m128i cmpB = CmpEq128<uint8_t>(needle, haystackB);
  __m128i haystackC = Load32BitsIntoVec(c);
  __m128i cmpC = CmpEq128<uint8_t>(needle, haystackC);
  __m128i haystackD = Load32BitsIntoVec(d);
  __m128i cmpD = CmpEq128<uint8_t>(needle, haystackD);
  __m128i or_ab = __lsx_vor_v(cmpA, cmpB);
  __m128i or_cd = __lsx_vor_v(cmpC, cmpD);
  __m128i or_abcd = __lsx_vor_v(or_ab, or_cd);
  uint32_t orMask = MovemaskBytes(or_abcd);
  if (orMask & 0xf) {
    uint32_t cmpMask;
    cmpMask = MovemaskBytes(cmpA);
    if (cmpMask & 0xf) {
      return reinterpret_cast<const char*>(a + __builtin_ctz(cmpMask));
    }
    cmpMask = MovemaskBytes(cmpB);
    if (cmpMask & 0xf) {
      return reinterpret_cast<const char*>(b + __builtin_ctz(cmpMask));
    }
    cmpMask = MovemaskBytes(cmpC);
    if (cmpMask & 0xf) {
      return reinterpret_cast<const char*>(c + __builtin_ctz(cmpMask));
    }
    cmpMask = MovemaskBytes(cmpD);
    if (cmpMask & 0xf) {
      return reinterpret_cast<const char*>(d + __builtin_ctz(cmpMask));
    }
  }

  return nullptr;
}

template <typename TValue>
static const TValue* Check4x16Bytes(__m128i needle, uintptr_t a, uintptr_t b,
                                    uintptr_t c, uintptr_t d) {
  __m128i haystackA = LoadVec(a);
  __m128i cmpA = CmpEq128<TValue>(needle, haystackA);
  __m128i haystackB = LoadVec(b);
  __m128i cmpB = CmpEq128<TValue>(needle, haystackB);
  __m128i haystackC = LoadVec(c);
  __m128i cmpC = CmpEq128<TValue>(needle, haystackC);
  __m128i haystackD = LoadVec(d);
  __m128i cmpD = CmpEq128<TValue>(needle, haystackD);
  __m128i or_ab = __lsx_vor_v(cmpA, cmpB);
  __m128i or_cd = __lsx_vor_v(cmpC, cmpD);
  __m128i or_abcd = __lsx_vor_v(or_ab, or_cd);
  uint32_t orMask = MovemaskBytes(or_abcd);
  if (orMask) {
    uint32_t cmpMask;
    cmpMask = MovemaskBytes(cmpA);
    if (cmpMask) {
      return reinterpret_cast<const TValue*>(a + __builtin_ctz(cmpMask));
    }
    cmpMask = MovemaskBytes(cmpB);
    if (cmpMask) {
      return reinterpret_cast<const TValue*>(b + __builtin_ctz(cmpMask));
    }
    cmpMask = MovemaskBytes(cmpC);
    if (cmpMask) {
      return reinterpret_cast<const TValue*>(c + __builtin_ctz(cmpMask));
    }
    cmpMask = MovemaskBytes(cmpD);
    if (cmpMask) {
      return reinterpret_cast<const TValue*>(d + __builtin_ctz(cmpMask));
    }
  }

  return nullptr;
}

// See the SSE2 Check2x2x16Bytes for an explanation of the carry handling.
template <typename TValue>
static const TValue* Check2x2x16Bytes(__m128i needle1, __m128i needle2,
                                      uintptr_t a, uintptr_t b,
                                      __m128i* carryIn, __m128i* carryOut,
                                      HaystackOverlap overlap) {
  constexpr int shiftRightAmount = 16 - sizeof(TValue);
  constexpr int shiftLeftAmount = sizeof(TValue);
  __m128i haystackA = LoadVec(a);
  __m128i cmpA1 = CmpEq128<TValue>(needle1, haystackA);
  __m128i cmpA2 = CmpEq128<TValue>(needle2, haystackA);
  __m128i cmpA;
  if (carryIn) {
    cmpA = __lsx_vand_v(
        __lsx_vor_v(__lsx_vbsll_v(cmpA1, shiftLeftAmount), *carryIn), cmpA2);
  } else {
    cmpA = __lsx_vand_v(__lsx_vbsll_v(cmpA1, shiftLeftAmount), cmpA2);
  }
  __m128i haystackB = LoadVec(b);
  __m128i cmpB1 = CmpEq128<TValue>(needle1, haystackB);
  __m128i cmpB2 = CmpEq128<TValue>(needle2, haystackB);
  __m128i cmpB;
  if (overlap == HaystackOverlap::Overlapping) {
    cmpB = __lsx_vand_v(__lsx_vbsll_v(cmpB1, shiftLeftAmount), cmpB2);
  } else {
    MOZ_ASSERT(overlap == HaystackOverlap::Sequential);
    __m128i carryAB = __lsx_vbsrl_v(cmpA1, shiftRightAmount);
    cmpB = __lsx_vand_v(
        __lsx_vor_v(__lsx_vbsll_v(cmpB1, shiftLeftAmount), carryAB), cmpB2);
  }
  __m128i or_ab = __lsx_vor_v(cmpA, cmpB);
  uint32_t orMask = MovemaskBytes(or_ab);
  if (orMask) {
    uint32_t cmpMask;
    cmpMask = MovemaskBytes(cmpA);
    if (cmpMask) {
      return reinterpret_cast<const TValue*>(a + __builtin_ctz(cmpMask) -
                                             shiftLeftAmount);
    }
    cmpMask = MovemaskBytes(cmpB);
    if (cmpMask) {
      return reinterpret_cast<const TValue*>(b + __builtin_ctz(cmpMask) -
                                             shiftLeftAmount);
    }
  }

  if (carryOut) {
    *carryOut = __lsx_vbsrl_v(cmpB1, shiftRightAmount);
  }

  return nullptr;
}

template <typename TValue>
static const TValue* FindInBuffer(const TValue* ptr, TValue value,
                                  size_t length) {
  static_assert(sizeof(TValue) == 1 || sizeof(TValue) == 2 ||
                sizeof(TValue) == 4 || sizeof(TValue) == 8);
  static_assert(std::is_unsigned_v<TValue>);

  __m128i needle = SplatNeedle<TValue>(value);

  size_t numBytes = length * sizeof(TValue);
  uintptr_t cur = reinterpret_cast<uintptr_t>(ptr);
  uintptr_t end = cur + numBytes;

  if ((sizeof(TValue) > 1 && numBytes < 16) || numBytes < 4) {
    while (cur < end) {
      if (GetAs<TValue>(cur) == value) {
        return reinterpret_cast<const TValue*>(cur);
      }
      cur += sizeof(TValue);
    }
    return nullptr;
  }

  if (numBytes < 16) {
    // NOTE: here and below, we have some bit fiddling which could look a
    // little weird. The important thing to note though is it's just a trick
    // for getting the number 4 if numBytes is greater than or equal to 8,
    // and 0 otherwise. This lets us fully cover the range without any
    // branching for the case where numBytes is in [4,8), and [8,16). We get
    // four ranges from this - if numbytes > 8, we get:
    //   [0,4), [4,8], [end - 8), [end - 4)
    // and if numbytes < 8, we get
    //   [0,4), [0,4), [end - 4), [end - 4)
    uintptr_t a = cur;
    uintptr_t b = cur + ((numBytes & 8) >> 1);
    uintptr_t c = end - 4 - ((numBytes & 8) >> 1);
    uintptr_t d = end - 4;
    const char* charResult = Check4x4Chars(needle, a, b, c, d);
    // Note: we ensure above that sizeof(TValue) == 1 here, so this is
    // either char to char or char to something like a uint8_t.
    return reinterpret_cast<const TValue*>(charResult);
  }

  if (numBytes < 64) {
    // NOTE: see the above explanation of the similar chunk of code, but in
    // this case, replace 8 with 32 and 4 with 16.
    uintptr_t a = cur;
    uintptr_t b = cur + ((numBytes & 32) >> 1);
    uintptr_t c = end - 16 - ((numBytes & 32) >> 1);
    uintptr_t d = end - 16;
    return Check4x16Bytes<TValue>(needle, a, b, c, d);
  }

  // Get the initial unaligned load out of the way. This will overlap with
  // the aligned stuff below, but the overlapped part should effectively be
  // free (relative to a mispredict from doing a byte-by-byte loop).
  __m128i haystack = LoadVec(cur);
  __m128i cmp = CmpEq128<TValue>(needle, haystack);
  uint32_t cmpMask = MovemaskBytes(cmp);
  if (cmpMask) {
    return reinterpret_cast<const TValue*>(cur + __builtin_ctz(cmpMask));
  }

  // Now we're working with aligned memory. Hooray! \o/
  cur = AlignUp16(cur);

  // The address of the final 48-63 bytes. We overlap this with what we check
  // in our hot loop below to avoid branching. Again, the overlap should be
  // negligible compared with a branch mispredict.
  uintptr_t tailStartPtr = AlignDown16(end - 48);
  uintptr_t tailEndPtr = end - 16;

  while (cur < tailStartPtr) {
    uintptr_t a = cur;
    uintptr_t b = cur + 16;
    uintptr_t c = cur + 32;
    uintptr_t d = cur + 48;
    const TValue* result = Check4x16Bytes<TValue>(needle, a, b, c, d);
    if (result) {
      return result;
    }
    cur += 64;
  }

  uintptr_t a = tailStartPtr;
  uintptr_t b = tailStartPtr + 16;
  uintptr_t c = tailStartPtr + 32;
  uintptr_t d = tailEndPtr;
  return Check4x16Bytes<TValue>(needle, a, b, c, d);
}

template <typename TValue>
static const TValue* TwoElementLoop(uintptr_t start, uintptr_t end, TValue v1,
                                    TValue v2) {
  static_assert(sizeof(TValue) == 1 || sizeof(TValue) == 2);

  const TValue* cur = reinterpret_cast<const TValue*>(start);
  const TValue* preEnd = reinterpret_cast<const TValue*>(end - sizeof(TValue));

  uint32_t expected = static_cast<uint32_t>(v1) |
                      (static_cast<uint32_t>(v2) << (sizeof(TValue) * 8));
  while (cur < preEnd) {
    // NOTE: this should only ever be called on little endian architectures.
    static_assert(std::endian::native == std::endian::little);
    // We or cur[0] and cur[1] together explicitly and compare to expected,
    // in order to avoid UB from just loading them as a uint16_t/uint32_t.
    // However, it will compile down the same code after optimizations on
    // little endian systems which support unaligned loads. Comparing them
    // value-by-value, however, will not, and seems to perform worse in local
    // microbenchmarking. Even after bitwise or'ing the comparison values
    // together to avoid the short circuit, the compiler doesn't seem to get
    // the hint and creates two branches, the first of which might be
    // frequently mispredicted.
    uint32_t actual = static_cast<uint32_t>(cur[0]) |
                      (static_cast<uint32_t>(cur[1]) << (sizeof(TValue) * 8));
    if (actual == expected) {
      return cur;
    }
    cur++;
  }
  return nullptr;
}

template <typename TValue>
const TValue* FindTwoInBuffer(const TValue* ptr, TValue v1, TValue v2,
                              size_t length) {
  static_assert(sizeof(TValue) == 1 || sizeof(TValue) == 2);
  static_assert(std::is_unsigned_v<TValue>);

  __m128i needle1 = SplatNeedle<TValue>(v1);
  __m128i needle2 = SplatNeedle<TValue>(v2);

  size_t numBytes = length * sizeof(TValue);
  uintptr_t cur = reinterpret_cast<uintptr_t>(ptr);
  uintptr_t end = cur + numBytes;

  if (numBytes < 16) {
    return TwoElementLoop<TValue>(cur, end, v1, v2);
  }

  if (numBytes < 32) {
    uintptr_t a = cur;
    uintptr_t b = end - 16;
    return Check2x2x16Bytes<TValue>(needle1, needle2, a, b, nullptr, nullptr,
                                    HaystackOverlap::Overlapping);
  }

  // Get the initial unaligned load out of the way. This will likely overlap
  // with the aligned stuff below, but the overlapped part should effectively
  // be free.
  __m128i haystack = LoadVec(cur);
  __m128i cmp1 = CmpEq128<TValue>(needle1, haystack);
  __m128i cmp2 = CmpEq128<TValue>(needle2, haystack);
  uint32_t cmpMask1 = MovemaskBytes(cmp1);
  uint32_t cmpMask2 = MovemaskBytes(cmp2);
  uint32_t cmpMask = (cmpMask1 << sizeof(TValue)) & cmpMask2;
  if (cmpMask) {
    return reinterpret_cast<const TValue*>(cur + __builtin_ctz(cmpMask) -
                                           sizeof(TValue));
  }

  // Now we're working with aligned memory. Hooray! \o/
  cur = AlignUp16(cur);

  // The address of the final 48-63 bytes. We overlap this with what we check
  // in our hot loop below to avoid branching. Again, the overlap should be
  // negligible compared with a branch mispredict.
  uintptr_t tailEndPtr = end - 16;
  uintptr_t tailStartPtr = AlignDown16(tailEndPtr);

  __m128i cmpMaskCarry = __lsx_vldi(0);
  while (cur < tailStartPtr) {
    uintptr_t a = cur;
    uintptr_t b = cur + 16;
    const TValue* result =
        Check2x2x16Bytes<TValue>(needle1, needle2, a, b, &cmpMaskCarry,
                                 &cmpMaskCarry, HaystackOverlap::Sequential);
    if (result) {
      return result;
    }
    cur += 32;
  }

  uint32_t carry = (cur == tailStartPtr) ? 0xffffffff : 0;
  __m128i wideCarry =
      __lsx_vinsgr2vr_w(__lsx_vldi(0), static_cast<int>(carry), 0);
  cmpMaskCarry = __lsx_vand_v(cmpMaskCarry, wideCarry);
  uintptr_t a = tailStartPtr;
  uintptr_t b = tailEndPtr;
  return Check2x2x16Bytes<TValue>(needle1, needle2, a, b, &cmpMaskCarry,
                                  nullptr, HaystackOverlap::Overlapping);
}

const char16_t* SIMD::memchr16LSX(const char16_t* ptr, char16_t value,
                                  size_t length) {
  return FindInBuffer<char16_t>(ptr, value, length);
}

const uint32_t* SIMD::memchr32LSX(const uint32_t* ptr, uint32_t value,
                                  size_t length) {
  return FindInBuffer<uint32_t>(ptr, value, length);
}

const uint64_t* SIMD::memchr64LSX(const uint64_t* ptr, uint64_t value,
                                  size_t length) {
  return FindInBuffer<uint64_t>(ptr, value, length);
}

const char* SIMD::memchr2x8LSX(const char* ptr, char v1, char v2,
                               size_t length) {
  const unsigned char* uptr = reinterpret_cast<const unsigned char*>(ptr);
  unsigned char uv1 = static_cast<unsigned char>(v1);
  unsigned char uv2 = static_cast<unsigned char>(v2);
  const unsigned char* uresult =
      FindTwoInBuffer<unsigned char>(uptr, uv1, uv2, length);
  return reinterpret_cast<const char*>(uresult);
}

const char16_t* SIMD::memchr2x16LSX(const char16_t* ptr, char16_t v1,
                                    char16_t v2, size_t length) {
  return FindTwoInBuffer<char16_t>(ptr, v1, v2, length);
}

}  // namespace mozilla

#else

namespace mozilla {

const char16_t* SIMD::memchr16LSX(const char16_t* ptr, char16_t value,
                                  size_t length) {
  MOZ_RELEASE_ASSERT(false, "LSX not supported in this binary.");
}

const uint32_t* SIMD::memchr32LSX(const uint32_t* ptr, uint32_t value,
                                  size_t length) {
  MOZ_RELEASE_ASSERT(false, "LSX not supported in this binary.");
}

const uint64_t* SIMD::memchr64LSX(const uint64_t* ptr, uint64_t value,
                                  size_t length) {
  MOZ_RELEASE_ASSERT(false, "LSX not supported in this binary.");
}

const char* SIMD::memchr2x8LSX(const char* ptr, char v1, char v2,
                               size_t length) {
  MOZ_RELEASE_ASSERT(false, "LSX not supported in this binary.");
}

const char16_t* SIMD::memchr2x16LSX(const char16_t* ptr, char16_t v1,
                                    char16_t v2, size_t length) {
  MOZ_RELEASE_ASSERT(false, "LSX not supported in this binary.");
}

}  // namespace mozilla

#endif
