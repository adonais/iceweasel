/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsCharTraits_h_
#define nsCharTraits_h_

#include <stdint.h>  // for |uint32_t|
#include <string.h>  // for |memcpy|, et al

#include "mozilla/MemoryChecking.h"

// This file may be used (through nsUTF8Utils.h) from non-XPCOM code, in
// particular the standalone software updater. In that case stub out
// the macros provided by nsDebug.h which are only usable when linking XPCOM

#ifdef NS_NO_XPCOM
#  define NS_WARNING(msg)
#  define NS_ASSERTION(cond, msg)
#  define NS_ERROR(msg)
#else
#  include "nsDebug.h"  // for NS_ASSERTION
#endif

template <class CharT>
struct nsCharTraits {};

template <>
struct nsCharTraits<char16_t> {
  typedef char16_t char_type;
  typedef uint16_t unsigned_char_type;
  typedef char incompatible_char_type;

  static constexpr char_type gNullChar = 0;
  static constexpr char_type* sEmptyBuffer = const_cast<char_type*>(&gNullChar);

  // integer representation of characters:
  typedef int int_type;

  static char_type to_char_type(int_type aChar) { return char_type(aChar); }

  static int_type to_int_type(char_type aChar) {
    return int_type(static_cast<unsigned_char_type>(aChar));
  }

  static bool eq_int_type(int_type aLhs, int_type aRhs) { return aLhs == aRhs; }

  // |char_type| comparisons:

  static bool eq(char_type aLhs, char_type aRhs) { return aLhs == aRhs; }

  static bool lt(char_type aLhs, char_type aRhs) { return aLhs < aRhs; }

  // operations on s[n] arrays:

  static char_type* move(char_type* aStr1, const char_type* aStr2, size_t aN) {
    return static_cast<char_type*>(
        memmove(aStr1, aStr2, aN * sizeof(char_type)));
  }

  static char_type* copy(char_type* aStr1, const char_type* aStr2, size_t aN) {
    return static_cast<char_type*>(
        memcpy(aStr1, aStr2, aN * sizeof(char_type)));
  }

  static void uninitialize(char_type* aStr, size_t aN) {
#ifdef DEBUG
    memset(aStr, 0xE4, aN * sizeof(char_type));
#endif
    MOZ_MAKE_MEM_UNDEFINED(aStr, aN * sizeof(char_type));
  }

  static char_type* copyASCII(char_type* aStr1, const char* aStr2, size_t aN) {
    for (char_type* s = aStr1; aN--; ++s, ++aStr2) {
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      *s = static_cast<char_type>(*aStr2);
    }
    return aStr1;
  }

  static int compare(const char_type* aStr1, const char_type* aStr2,
                     size_t aN) {
    for (; aN--; ++aStr1, ++aStr2) {
      if (!eq(*aStr1, *aStr2)) {
        return to_int_type(*aStr1) - to_int_type(*aStr2);
      }
    }

    return 0;
  }

  static bool equals(const char_type* aStr1, const char_type* aStr2,
                     size_t aN) {
    return memcmp(aStr1, aStr2, aN * sizeof(char_type)) == 0;
  }

  static int compareASCII(const char_type* aStr1, const char* aStr2,
                          size_t aN) {
    for (; aN--; ++aStr1, ++aStr2) {
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      if (!eq_int_type(to_int_type(*aStr1),
                       to_int_type(static_cast<char_type>(*aStr2)))) {
        return to_int_type(*aStr1) -
               to_int_type(static_cast<char_type>(*aStr2));
      }
    }

    return 0;
  }

  static bool equalsLatin1(const char_type* aStr1, const char* aStr2,
                           const size_t aN) {
    for (size_t i = aN; i > 0; --i, ++aStr1, ++aStr2) {
      if (*aStr1 != static_cast<char_type>(*aStr2)) {
        return false;
      }
    }

    return true;
  }

  // this version assumes that s2 is null-terminated and s1 has length n.
  // if s1 is shorter than s2 then we return -1; if s1 is longer than s2,
  // we return 1.
  static int compareASCIINullTerminated(const char_type* aStr1, size_t aN,
                                        const char* aStr2) {
    for (; aN--; ++aStr1, ++aStr2) {
      if (!*aStr2) {
        return 1;
      }
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      if (!eq_int_type(to_int_type(*aStr1),
                       to_int_type(static_cast<char_type>(*aStr2)))) {
        return to_int_type(*aStr1) -
               to_int_type(static_cast<char_type>(*aStr2));
      }
    }

    if (*aStr2) {
      return -1;
    }

    return 0;
  }

  /**
   * Convert c to its lower-case form, but only if c is in the ASCII
   * range. Otherwise leave it alone.
   */
  static char_type ASCIIToLower(char_type aChar) {
    if (aChar >= 'A' && aChar <= 'Z') {
      return char_type(aChar + ('a' - 'A'));
    }

    return aChar;
  }

  static int compareLowerCaseToASCII(const char_type* aStr1, const char* aStr2,
                                     size_t aN) {
    for (; aN--; ++aStr1, ++aStr2) {
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      NS_ASSERTION(!(*aStr2 >= 'A' && *aStr2 <= 'Z'),
                   "Unexpected uppercase character");
      char_type lower_s1 = ASCIIToLower(*aStr1);
      if (lower_s1 != static_cast<char_type>(*aStr2)) {
        return to_int_type(lower_s1) -
               to_int_type(static_cast<char_type>(*aStr2));
      }
    }

    return 0;
  }

  // this version assumes that s2 is null-terminated and s1 has length n.
  // if s1 is shorter than s2 then we return -1; if s1 is longer than s2,
  // we return 1.
  static int compareLowerCaseToASCIINullTerminated(const char_type* aStr1,
                                                   size_t aN,
                                                   const char* aStr2) {
    for (; aN--; ++aStr1, ++aStr2) {
      if (!*aStr2) {
        return 1;
      }
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      NS_ASSERTION(!(*aStr2 >= 'A' && *aStr2 <= 'Z'),
                   "Unexpected uppercase character");
      char_type lower_s1 = ASCIIToLower(*aStr1);
      if (lower_s1 != static_cast<char_type>(*aStr2)) {
        return to_int_type(lower_s1) -
               to_int_type(static_cast<char_type>(*aStr2));
      }
    }

    if (*aStr2) {
      return -1;
    }

    return 0;
  }

  static size_t length(const char_type* aStr) {
    size_t result = 0;
    while (!eq(*aStr++, char_type(0))) {
      ++result;
    }
    return result;
  }

  static const char_type* find(const char_type* aStr, size_t aN,
                               char_type aChar) {
    while (aN--) {
      if (eq(*aStr, aChar)) {
        return aStr;
      }
      ++aStr;
    }

    return 0;
  }
};

template <>
struct nsCharTraits<char> {
  typedef char char_type;
  typedef unsigned char unsigned_char_type;
  typedef char16_t incompatible_char_type;

  static constexpr char_type gNullChar = 0;
  static constexpr char_type* sEmptyBuffer = const_cast<char_type*>(&gNullChar);

  // integer representation of characters:

  typedef int int_type;

  static char_type to_char_type(int_type aChar) { return char_type(aChar); }

  static int_type to_int_type(char_type aChar) {
    return int_type(static_cast<unsigned_char_type>(aChar));
  }

  static bool eq_int_type(int_type aLhs, int_type aRhs) { return aLhs == aRhs; }

  // |char_type| comparisons:

  static bool eq(char_type aLhs, char_type aRhs) { return aLhs == aRhs; }

  static bool lt(char_type aLhs, char_type aRhs) { return aLhs < aRhs; }

  // operations on s[n] arrays:

  static char_type* move(char_type* aStr1, const char_type* aStr2, size_t aN) {
    return static_cast<char_type*>(
        memmove(aStr1, aStr2, aN * sizeof(char_type)));
  }

  static char_type* copy(char_type* aStr1, const char_type* aStr2, size_t aN) {
    return static_cast<char_type*>(
        memcpy(aStr1, aStr2, aN * sizeof(char_type)));
  }

  static void uninitialize(char_type* aStr, size_t aN) {
#ifdef DEBUG
    memset(aStr, 0xE4, aN * sizeof(char_type));
#endif
    MOZ_MAKE_MEM_UNDEFINED(aStr, aN * sizeof(char_type));
  }

  static char_type* copyASCII(char_type* aStr1, const char* aStr2, size_t aN) {
    return copy(aStr1, aStr2, aN);
  }

  static int compare(const char_type* aStr1, const char_type* aStr2,
                     size_t aN) {
    return memcmp(aStr1, aStr2, aN);
  }

  static bool equals(const char_type* aStr1, const char_type* aStr2,
                     size_t aN) {
    return memcmp(aStr1, aStr2, aN) == 0;
  }

  static int compareASCII(const char_type* aStr1, const char* aStr2,
                          size_t aN) {
#ifdef DEBUG
    for (size_t i = 0; i < aN; ++i) {
      NS_ASSERTION(!(aStr2[i] & ~0x7F), "Unexpected non-ASCII character");
    }
#endif
    return compare(aStr1, aStr2, aN);
  }

  static bool equalsLatin1(const char_type* aStr1, const char* aStr2,
                           size_t aN) {
    return memcmp(aStr1, aStr2, aN) == 0;
  }

  // this version assumes that s2 is null-terminated and s1 has length n.
  // if s1 is shorter than s2 then we return -1; if s1 is longer than s2,
  // we return 1.
  static int compareASCIINullTerminated(const char_type* aStr1, size_t aN,
                                        const char* aStr2) {
    // can't use strcmp here because we don't want to stop when aStr1
    // contains a null
    for (; aN--; ++aStr1, ++aStr2) {
      if (!*aStr2) {
        return 1;
      }
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      if (*aStr1 != *aStr2) {
        return to_int_type(*aStr1) - to_int_type(*aStr2);
      }
    }

    if (*aStr2) {
      return -1;
    }

    return 0;
  }

  /**
   * Convert c to its lower-case form, but only if c is ASCII.
   */
  static char_type ASCIIToLower(char_type aChar) {
    if (aChar >= 'A' && aChar <= 'Z') {
      return char_type(aChar + ('a' - 'A'));
    }

    return aChar;
  }

  static int compareLowerCaseToASCII(const char_type* aStr1, const char* aStr2,
                                     size_t aN) {
    for (; aN--; ++aStr1, ++aStr2) {
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      NS_ASSERTION(!(*aStr2 >= 'A' && *aStr2 <= 'Z'),
                   "Unexpected uppercase character");
      char_type lower_s1 = ASCIIToLower(*aStr1);
      if (lower_s1 != *aStr2) {
        return to_int_type(lower_s1) - to_int_type(*aStr2);
      }
    }
    return 0;
  }

  // this version assumes that s2 is null-terminated and s1 has length n.
  // if s1 is shorter than s2 then we return -1; if s1 is longer than s2,
  // we return 1.
  static int compareLowerCaseToASCIINullTerminated(const char_type* aStr1,
                                                   size_t aN,
                                                   const char* aStr2) {
    for (; aN--; ++aStr1, ++aStr2) {
      if (!*aStr2) {
        return 1;
      }
      NS_ASSERTION(!(*aStr2 & ~0x7F), "Unexpected non-ASCII character");
      NS_ASSERTION(!(*aStr2 >= 'A' && *aStr2 <= 'Z'),
                   "Unexpected uppercase character");
      char_type lower_s1 = ASCIIToLower(*aStr1);
      if (lower_s1 != *aStr2) {
        return to_int_type(lower_s1) - to_int_type(*aStr2);
      }
    }

    if (*aStr2) {
      return -1;
    }

    return 0;
  }

  static size_t length(const char_type* aStr) { return strlen(aStr); }

  static const char_type* find(const char_type* aStr, size_t aN,
                               char_type aChar) {
    return reinterpret_cast<const char_type*>(
        memchr(aStr, to_int_type(aChar), aN));
  }
};

template <class InputIterator>
struct nsCharSourceTraits {
  typedef typename InputIterator::difference_type difference_type;

  static difference_type readable_distance(const InputIterator& aFirst,
                                           const InputIterator& aLast) {
    // assumes single fragment
    return aLast.get() - aFirst.get();
  }

  static const typename InputIterator::value_type* read(
      const InputIterator& aIter) {
    return aIter.get();
  }

  static void advance(InputIterator& aStr, difference_type aN) {
    aStr.advance(aN);
  }
};

template <class CharT>
struct nsCharSourceTraits<CharT*> {
  typedef ptrdiff_t difference_type;

  static difference_type readable_distance(CharT* aStr) {
    return nsCharTraits<CharT>::length(aStr);
  }

  static difference_type readable_distance(CharT* aFirst, CharT* aLast) {
    return aLast - aFirst;
  }

  static const CharT* read(CharT* aStr) { return aStr; }

  static void advance(CharT*& aStr, difference_type aN) { aStr += aN; }
};

template <class OutputIterator>
struct nsCharSinkTraits {
  static void write(OutputIterator& aIter,
                    const typename OutputIterator::value_type* aStr,
                    size_t aN) {
    aIter.write(aStr, aN);
  }
};

template <class CharT>
struct nsCharSinkTraits<CharT*> {
  static void write(CharT*& aIter, const CharT* aStr, size_t aN) {
    nsCharTraits<CharT>::move(aIter, aStr, aN);
    aIter += aN;
  }
};

#endif  // !defined(nsCharTraits_h_)
