/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Utilities for UTF-16 and surrogate handling. */

#ifndef mozilla_Utf16_h
#define mozilla_Utf16_h

#include "mozilla/Assertions.h"
#include "mozilla/Likely.h"

namespace mozilla {

/**
 * Code points U+10000 and greater lie outside the Basic Multilingual Plane and
 * must be encoded in UTF-16 as a high/low surrogate pair.
 */
constexpr inline char32_t kPlane1Base = 0x00010000;

/** The Unicode replacement character, substituted for malformed input. */
constexpr inline char16_t kReplacementChar = 0xFFFD;

/** The largest valid Unicode code point. */
constexpr inline char32_t kUnicodeMax = 0x0010FFFF;

/** Whether a code point lies in the Basic Multilingual Plane. */
constexpr bool IsInBMP(char32_t aCodePoint) { return aCodePoint < kPlane1Base; }

/** Whether a code unit is a high surrogate: U+D800 - U+DBFF. */
constexpr bool IsHighSurrogate(char32_t aChar) {
  return (aChar & 0xFFFFFC00) == 0xD800;
}

/** Whether a code unit is a low surrogate: U+DC00 - U+DFFF. */
constexpr bool IsLowSurrogate(char32_t aChar) {
  return (aChar & 0xFFFFFC00) == 0xDC00;
}

/** Whether a code unit is either kind of surrogate: U+D800 - U+DFFF. */
constexpr bool IsSurrogate(char32_t aChar) {
  return (aChar & 0xFFFFF800) == 0xD800;
}

/** Whether |aHigh| and |aLow| form a high/low surrogate pair. */
constexpr bool IsSurrogatePair(char32_t aHigh, char32_t aLow) {
  return IsHighSurrogate(aHigh) && IsLowSurrogate(aLow);
}

/** Whether a value is a valid Unicode code point (in range and not a
 * surrogate). */
constexpr bool IsValidCodePoint(char32_t aCodePoint) {
  return aCodePoint <= kUnicodeMax && !IsSurrogate(aCodePoint);
}

/** The high surrogate code unit for a non-BMP code point. */
constexpr char16_t HighSurrogate(char32_t aCodePoint) {
  MOZ_ASSERT(!IsInBMP(aCodePoint));
  // Since (c - 0x10000) >> 10 == (c >> 10) - 0x80 and 0xD7C0 == 0xD800 - 0x80,
  // ((c - 0x10000) >> 10) + 0xD800 simplifies to the following.
  return char16_t((aCodePoint >> 10) + 0xD7C0);
}

/** The low surrogate code unit for a non-BMP code point. */
constexpr char16_t LowSurrogate(char32_t aCodePoint) {
  MOZ_ASSERT(!IsInBMP(aCodePoint));
  // Since 0x10000 & 0x3FF == 0, (c - 0x10000) & 0x3FF == c & 0x3FF.
  return char16_t((aCodePoint & 0x3FF) | 0xDC00);
}

/** The code point encoded by a high/low surrogate pair. */
constexpr char32_t SurrogateToUCS4(char16_t aHigh, char16_t aLow) {
  MOZ_ASSERT(IsHighSurrogate(aHigh));
  MOZ_ASSERT(IsLowSurrogate(aLow));
  return ((char32_t(aHigh) & 0x3FF) << 10) + (char32_t(aLow) & 0x3FF) +
         kPlane1Base;
}

/**
 * Extract the next Unicode scalar value from a UTF-16 buffer and return it.
 * |*aBuffer| is advanced to the start of the next character. Upon encountering
 * an unpaired surrogate the return value is U+FFFD, |*aBuffer| is advanced over
 * the unpaired surrogate, and |*aErr| is set to true (if |aErr| is non-null).
 *
 * Note: This function never sets |*aErr| to false, to allow error accumulation
 * across multiple calls.
 *
 * Precondition: |*aBuffer < aEnd|.
 */
inline char32_t DecodeOneUtf16CodePoint(const char16_t** aBuffer,
                                        const char16_t* aEnd,
                                        bool* aErr = nullptr) {
  MOZ_ASSERT(aBuffer, "null buffer pointer pointer");
  MOZ_ASSERT(aEnd, "null end pointer");

  const char16_t* p = *aBuffer;

  MOZ_ASSERT(p, "null buffer");
  MOZ_ASSERT(p < aEnd, "Bogus range");

  char16_t c = *p++;

  if (MOZ_LIKELY(!IsSurrogate(c))) {
    *aBuffer = p;
    return c;
  }

  if (MOZ_LIKELY(IsHighSurrogate(c)) && MOZ_LIKELY(p != aEnd) &&
      IsLowSurrogate(*p)) {
    char16_t low = *p;
    *aBuffer = ++p;
    return SurrogateToUCS4(c, low);
  }

  // Unpaired surrogate.
  *aBuffer = p;
  if (aErr) {
    *aErr = true;
  }
  return kReplacementChar;
}

}  // namespace mozilla

#endif /* mozilla_Utf16_h */
