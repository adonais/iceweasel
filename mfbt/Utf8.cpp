/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#define MOZ_PRETEND_NO_JSRUST 1

#include "mozilla/HashFunctions.h"
#include "mozilla/Maybe.h"
#include "mozilla/TextUtils.h"
#include "mozilla/Types.h"
#include "mozilla/Utf16.h"
#include "mozilla/Utf8.h"

#include <stddef.h>

namespace mozilla {
namespace detail {

MFBT_API bool IsValidUtf8(const void* aCodeUnits, size_t aCount) {
  const auto* s = reinterpret_cast<const unsigned char*>(aCodeUnits);
  const auto* const limit = s + aCount;

  while (s < limit) {
    unsigned char c = *s++;

    // If the first byte is ASCII, it's the only one in the code point.  Have a
    // fast path that avoids all the rest of the work and looping in that case.
    if (IsAscii(c)) {
      continue;
    }

    Maybe<char32_t> maybeCodePoint =
        DecodeOneUtf8CodePoint(Utf8Unit(c), &s, limit);
    if (maybeCodePoint.isNothing()) {
      return false;
    }
  }

  MOZ_ASSERT(s == limit);
  return true;
}

}  // namespace detail

MFBT_API HashNumber HashUTF8AsUTF16(const char* aUTF8, size_t aLength) {
  const auto* s = reinterpret_cast<const unsigned char*>(aUTF8);
  const auto* const limit = s + aLength;

  detail::UTF16Hasher hasher;
  while (s < limit) {
    unsigned char c = *s++;

    char32_t codePoint;
    if (IsAscii(c)) {
      codePoint = c;
    } else {
      codePoint = LossyDecodeOneUtf8CodePoint(Utf8Unit(c), &s, limit);
    }

    // Split astral code points into a UTF-16 surrogate pair, matching what a
    // conversion to UTF-16 followed by HashString() would hash.
    if (IsInBMP(codePoint)) {
      hasher.Add(static_cast<char16_t>(codePoint));
    } else {
      hasher.Add(HighSurrogate(codePoint));
      hasher.Add(LowSurrogate(codePoint));
    }
  }

  return hasher.Finish();
}

}  // namespace mozilla
