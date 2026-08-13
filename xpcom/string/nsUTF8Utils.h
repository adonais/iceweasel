/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsUTF8Utils_h_
#define nsUTF8Utils_h_

// NB: This code may be used from non-XPCOM code, in particular, the
// standalone updater executable.  That is, this file may be used in
// two ways: if MOZILLA_INTERNAL_API is defined, this file will
// provide signatures for the Mozilla abstract string types. It will
// use XPCOM assertion/debugging macros, etc.

#include <type_traits>

#include "mozilla/Assertions.h"
#include "nsCharTraits.h"

#ifdef MOZILLA_INTERNAL_API
#  define UTF8UTILS_WARNING(msg) NS_WARNING(msg)
#else
#  define UTF8UTILS_WARNING(msg)
#endif

class UTF8traits {
 public:
  static bool isASCII(char aChar) { return (aChar & 0x80) == 0x00; }
  static bool isInSeq(char aChar) { return (aChar & 0xC0) == 0x80; }
  static bool is2byte(char aChar) { return (aChar & 0xE0) == 0xC0; }
  static bool is3byte(char aChar) { return (aChar & 0xF0) == 0xE0; }
  static bool is4byte(char aChar) { return (aChar & 0xF8) == 0xF0; }
  static bool is5byte(char aChar) { return (aChar & 0xFC) == 0xF8; }
  static bool is6byte(char aChar) { return (aChar & 0xFE) == 0xFC; }
  // return the number of bytes in a sequence beginning with aChar
  static int bytes(char aChar) {
    if (isASCII(aChar)) {
      return 1;
    }
    if (is2byte(aChar)) {
      return 2;
    }
    if (is3byte(aChar)) {
      return 3;
    }
    if (is4byte(aChar)) {
      return 4;
    }
    MOZ_ASSERT_UNREACHABLE("should not be used for in-sequence characters");
    return 1;
  }
};

template <typename Char, typename UnsignedT>
inline UnsignedT RewindToPriorUTF8Codepoint(const Char* utf8Chars,
                                            UnsignedT index) {
  static_assert(std::is_same_v<Char, char> ||
                    std::is_same_v<Char, unsigned char> ||
                    std::is_same_v<Char, signed char>,
                "UTF-8 data must be in 8-bit units");
  static_assert(std::is_unsigned_v<UnsignedT>, "index type must be unsigned");
  while (index > 0 && (utf8Chars[index] & 0xC0) == 0x80) --index;

  return index;
}

#undef UTF8UTILS_WARNING

#endif /* !defined(nsUTF8Utils_h_) */
