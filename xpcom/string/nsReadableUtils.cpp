/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsReadableUtils.h"

#include <algorithm>

#include "mozilla/CheckedInt.h"
#include "mozilla/Utf16.h"
#include "mozilla/Utf8.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsUnicharUtils.h"
#include "nscore.h"

using mozilla::Span;

/**
 * A helper function that allocates a buffer of the desired character type big
 * enough to hold a copy of the supplied string (plus a zero terminator).
 *
 * @param aSource an string you will eventually be making a copy of
 * @return a new buffer which you must free with |free|.
 *
 */
template <class FromStringT, class CharT>
inline CharT* AllocateStringCopy(const FromStringT& aSource, CharT*) {
  return static_cast<CharT*>(
      malloc((size_t(aSource.Length()) + 1) * sizeof(CharT)));
}

char* ToNewCString(const nsAString& aSource) {
  char* str = ToNewCString(aSource, mozilla::fallible);
  if (!str) {
    MOZ_CRASH("Unable to allocate memory");
  }
  return str;
}

char* ToNewCString(const nsAString& aSource,
                   const mozilla::fallible_t& aFallible) {
  char* dest = AllocateStringCopy(aSource, (char*)nullptr);
  if (!dest) {
    return nullptr;
  }

  auto len = aSource.Length();
  LossyConvertUtf16toLatin1(aSource, Span(dest, len));
  dest[len] = 0;
  return dest;
}

char* ToNewUTF8String(const nsAString& aSource, uint32_t* aUTF8Count,
                      const mozilla::fallible_t& aFallible) {
  auto len = aSource.Length();
  // The uses of this function seem temporary enough that it's not
  // worthwhile to be fancy about the allocation size. Let's just use
  // the worst case.
  // Times 3 plus 1, because ConvertUTF16toUTF8 requires times 3 and
  // then we have the terminator.
  // Using CheckedInt<uint32_t>, because aUTF8Count is uint32_t* for
  // historical reasons.
  mozilla::CheckedInt<uint32_t> destLen(len);
  destLen *= 3;
  destLen += 1;
  if (!destLen.isValid()) {
    return nullptr;
  }
  size_t destLenVal = destLen.value();
  char* dest = static_cast<char*>(malloc(destLenVal));
  if (!dest) {
    return nullptr;
  }

  size_t written = ConvertUtf16toUtf8(aSource, Span(dest, destLenVal));
  dest[written] = 0;

  if (aUTF8Count) {
    *aUTF8Count = written;
  }

  return dest;
}

char* ToNewUTF8String(const nsAString& aSource, uint32_t* aUTF8Count) {
  char* str = ToNewUTF8String(aSource, aUTF8Count, mozilla::fallible);
  if (!str) {
    MOZ_CRASH("Unable to allocate memory");
  }
  return str;
}

char* ToNewCString(const nsACString& aSource) {
  char* str = ToNewCString(aSource, mozilla::fallible);
  if (!str) {
    MOZ_CRASH("Unable to allocate memory");
  }
  return str;
}

char* ToNewCString(const nsACString& aSource,
                   const mozilla::fallible_t& aFallible) {
  // no conversion needed, just allocate a buffer of the correct length and copy
  // into it

  char* dest = AllocateStringCopy(aSource, (char*)nullptr);
  if (!dest) {
    return nullptr;
  }

  auto len = aSource.Length();
  memcpy(dest, aSource.BeginReading(), len * sizeof(char));
  dest[len] = 0;
  return dest;
}

char16_t* ToNewUnicode(const nsAString& aSource) {
  char16_t* str = ToNewUnicode(aSource, mozilla::fallible);
  if (!str) {
    MOZ_CRASH("Unable to allocate memory");
  }
  return str;
}

char16_t* ToNewUnicode(const nsAString& aSource,
                       const mozilla::fallible_t& aFallible) {
  // no conversion needed, just allocate a buffer of the correct length and copy
  // into it

  char16_t* dest = AllocateStringCopy(aSource, (char16_t*)nullptr);
  if (!dest) {
    return nullptr;
  }

  auto len = aSource.Length();
  memcpy(dest, aSource.BeginReading(), len * sizeof(char16_t));
  dest[len] = 0;
  return dest;
}

char16_t* ToNewUnicode(const nsACString& aSource) {
  char16_t* str = ToNewUnicode(aSource, mozilla::fallible);
  if (!str) {
    MOZ_CRASH("Unable to allocate memory");
  }
  return str;
}

char16_t* ToNewUnicode(const nsACString& aSource,
                       const mozilla::fallible_t& aFallible) {
  char16_t* dest = AllocateStringCopy(aSource, (char16_t*)nullptr);
  if (!dest) {
    return nullptr;
  }

  auto len = aSource.Length();
  ConvertLatin1toUtf16(aSource, Span(dest, len));
  dest[len] = 0;
  return dest;
}

char16_t* UTF8ToNewUnicode(const nsACString& aSource, uint32_t* aUTF16Count,
                           const mozilla::fallible_t& aFallible) {
  // Compute length plus one as required by ConvertUTF8toUTF16
  uint32_t lengthPlusOne = aSource.Length() + 1;  // Can't overflow

  mozilla::CheckedInt<size_t> allocLength(lengthPlusOne);
  // Add space for zero-termination
  allocLength += 1;
  // We need UTF-16 units
  allocLength *= sizeof(char16_t);

  if (!allocLength.isValid()) {
    return nullptr;
  }

  char16_t* dest = (char16_t*)malloc(allocLength.value());
  if (!dest) {
    return nullptr;
  }

  size_t written = ConvertUtf8toUtf16(aSource, Span(dest, lengthPlusOne));
  dest[written] = 0;

  if (aUTF16Count) {
    *aUTF16Count = written;
  }

  return dest;
}

char16_t* UTF8ToNewUnicode(const nsACString& aSource, uint32_t* aUTF16Count) {
  char16_t* str = UTF8ToNewUnicode(aSource, aUTF16Count, mozilla::fallible);
  if (!str) {
    MOZ_CRASH("Unable to allocate memory");
  }
  return str;
}

char16_t* CopyUnicodeTo(const nsAString& aSource, uint32_t aSrcOffset,
                        char16_t* aDest, uint32_t aLength) {
  MOZ_ASSERT(aSrcOffset + aLength <= aSource.Length());
  memcpy(aDest, aSource.BeginReading() + aSrcOffset,
         size_t(aLength) * sizeof(char16_t));
  return aDest;
}

void ToUpperCase(nsACString& aCString) {
  char* cp = aCString.BeginWriting();
  char* end = cp + aCString.Length();
  while (cp != end) {
    char ch = *cp;
    if (ch >= 'a' && ch <= 'z') {
      *cp = ch - ('a' - 'A');
    }
    ++cp;
  }
}

void ToUpperCase(const nsACString& aSource, nsACString& aDest) {
  aDest.SetLength(aSource.Length());
  const char* src = aSource.BeginReading();
  const char* end = src + aSource.Length();
  char* dst = aDest.BeginWriting();
  while (src != end) {
    char ch = *src;
    if (ch >= 'a' && ch <= 'z') {
      *dst = ch - ('a' - 'A');
    } else {
      *dst = ch;
    }
    ++src;
    ++dst;
  }
}

void ToLowerCase(nsACString& aCString) {
  char* cp = aCString.BeginWriting();
  char* end = cp + aCString.Length();
  while (cp != end) {
    char ch = *cp;
    if (ch >= 'A' && ch <= 'Z') {
      *cp = ch + ('a' - 'A');
    }
    ++cp;
  }
}

void ToLowerCase(const nsACString& aSource, nsACString& aDest) {
  aDest.SetLength(aSource.Length());
  const char* src = aSource.BeginReading();
  const char* end = src + aSource.Length();
  char* dst = aDest.BeginWriting();
  while (src != end) {
    char ch = *src;
    if (ch >= 'A' && ch <= 'Z') {
      *dst = ch + ('a' - 'A');
    } else {
      *dst = ch;
    }
    ++src;
    ++dst;
  }
}

void ParseString(const nsACString& aSource, char aDelimiter,
                 nsTArray<nsCString>& aArray) {
  nsACString::const_iterator start, end;
  aSource.BeginReading(start);
  aSource.EndReading(end);

  for (;;) {
    nsACString::const_iterator delimiter = start;
    FindCharInReadable(aDelimiter, delimiter, end);

    if (delimiter != start) {
      aArray.AppendElement(Substring(start, delimiter));
    }

    if (delimiter == end) {
      break;
    }
    start = ++delimiter;
    if (start == end) {
      break;
    }
  }
}

namespace {

struct AsciiCaseInsensitiveComparator {
  template <typename CharT>
  bool operator()(CharT aLhs, CharT aRhs) const {
    return nsCharTraits<CharT>::ASCIIToLower(aLhs) ==
           nsCharTraits<CharT>::ASCIIToLower(aRhs);
  }
};

struct CaseInsensitiveComparator {
  bool operator()(char16_t aLhs, char16_t aRhs) const {
    return aLhs == aRhs || ToLowerCase(aLhs) == ToLowerCase(aRhs);
  }
};

// We need this dance because nsReadingIterator is kind of lame...
//
// aSearch(begin, end) is expected to return a pointer to the first
// character of the match, or the end pointer if there was no match.
template <typename StringT, typename Search>
bool SearchInReadable(const StringT& aPattern,
                      typename StringT::const_iterator& aSearchStart,
                      typename StringT::const_iterator& aSearchEnd,
                      Search aSearch) {
  const auto* begin = aSearchStart.get();
  const auto* end = aSearchEnd.get();
  const auto* result = aSearch(begin, end);
  if (result == end) {
    aSearchStart = aSearchEnd;
    return false;
  }
  aSearchStart.advance(result - begin);
  aSearchEnd = aSearchStart;
  aSearchEnd.advance(aPattern.Length());
  return true;
}

template <typename StringT, typename Comparator>
bool FindInReadableWith(const StringT& aPattern,
                        typename StringT::const_iterator& aSearchStart,
                        typename StringT::const_iterator& aSearchEnd,
                        Comparator aComparator) {
  return SearchInReadable(aPattern, aSearchStart, aSearchEnd,
                          [&](const auto* aBegin, const auto* aEnd) {
                            return std::search(
                                aBegin, aEnd, aPattern.BeginReading(),
                                aPattern.EndReading(), aComparator);
                          });
}

template <typename StringT, typename Comparator>
bool RFindInReadableWith(const StringT& aPattern,
                         typename StringT::const_iterator& aSearchStart,
                         typename StringT::const_iterator& aSearchEnd,
                         Comparator aComparator) {
  return SearchInReadable(aPattern, aSearchStart, aSearchEnd,
                          [&](const auto* aBegin, const auto* aEnd) {
                            return std::find_end(
                                aBegin, aEnd, aPattern.BeginReading(),
                                aPattern.EndReading(), aComparator);
                          });
}

template <typename StringT>
bool FindInReadableImpl(const StringT& aPattern,
                        typename StringT::const_iterator& aSearchStart,
                        typename StringT::const_iterator& aSearchEnd) {
  using CharT = typename StringT::char_type;
  return SearchInReadable(
      aPattern, aSearchStart, aSearchEnd,
      [&](const CharT* aBegin, const CharT* aEnd) {
        std::basic_string_view<CharT> haystack(aBegin, aEnd - aBegin);
        std::basic_string_view<CharT> needle(aPattern.BeginReading(),
                                             aPattern.Length());
        size_t index = haystack.find(needle);
        return index == haystack.npos ? aEnd : aBegin + index;
      });
}

template <typename StringT>
bool RFindInReadableImpl(const StringT& aPattern,
                         typename StringT::const_iterator& aSearchStart,
                         typename StringT::const_iterator& aSearchEnd) {
  using CharT = typename StringT::char_type;
  return SearchInReadable(
      aPattern, aSearchStart, aSearchEnd,
      [&](const CharT* aBegin, const CharT* aEnd) {
        std::basic_string_view<CharT> haystack(aBegin, aEnd - aBegin);
        std::basic_string_view<CharT> needle(aPattern.BeginReading(),
                                             aPattern.Length());
        size_t index = haystack.rfind(needle);
        return index == haystack.npos ? aEnd : aBegin + index;
      });
}

}  // namespace

bool FindInReadable(const nsAString& aPattern,
                    nsAString::const_iterator& aSearchStart,
                    nsAString::const_iterator& aSearchEnd) {
  return FindInReadableImpl(aPattern, aSearchStart, aSearchEnd);
}

bool FindInReadable(const nsACString& aPattern,
                    nsACString::const_iterator& aSearchStart,
                    nsACString::const_iterator& aSearchEnd) {
  return FindInReadableImpl(aPattern, aSearchStart, aSearchEnd);
}

bool CaseInsensitiveFindInReadable(const nsACString& aPattern,
                                   nsACString::const_iterator& aSearchStart,
                                   nsACString::const_iterator& aSearchEnd) {
  return FindInReadableWith(aPattern, aSearchStart, aSearchEnd,
                            AsciiCaseInsensitiveComparator());
}

bool CaseInsensitiveFindInReadable(const nsAString& aPattern,
                                   nsAString::const_iterator& aSearchStart,
                                   nsAString::const_iterator& aSearchEnd) {
  return FindInReadableWith(aPattern, aSearchStart, aSearchEnd,
                            CaseInsensitiveComparator());
}

bool AsciiCaseInsensitiveFindInReadable(
    const nsACString& aPattern, nsACString::const_iterator& aSearchStart,
    nsACString::const_iterator& aSearchEnd) {
  // For narrow strings, case-insensitive comparison is already ASCII-only.
  return FindInReadableWith(aPattern, aSearchStart, aSearchEnd,
                            AsciiCaseInsensitiveComparator());
}

bool AsciiCaseInsensitiveFindInReadable(const nsAString& aPattern,
                                        nsAString::const_iterator& aSearchStart,
                                        nsAString::const_iterator& aSearchEnd) {
  return FindInReadableWith(aPattern, aSearchStart, aSearchEnd,
                            AsciiCaseInsensitiveComparator());
}

bool RFindInReadable(const nsAString& aPattern,
                     nsAString::const_iterator& aSearchStart,
                     nsAString::const_iterator& aSearchEnd) {
  return RFindInReadableImpl(aPattern, aSearchStart, aSearchEnd);
}

bool RFindInReadable(const nsACString& aPattern,
                     nsACString::const_iterator& aSearchStart,
                     nsACString::const_iterator& aSearchEnd) {
  return RFindInReadableImpl(aPattern, aSearchStart, aSearchEnd);
}

bool CaseInsensitiveRFindInReadable(const nsACString& aPattern,
                                    nsACString::const_iterator& aSearchStart,
                                    nsACString::const_iterator& aSearchEnd) {
  return RFindInReadableWith(aPattern, aSearchStart, aSearchEnd,
                             AsciiCaseInsensitiveComparator());
}

bool FindCharInReadable(char16_t aChar, nsAString::const_iterator& aSearchStart,
                        const nsAString::const_iterator& aSearchEnd) {
  ptrdiff_t fragmentLength = aSearchEnd.get() - aSearchStart.get();

  const char16_t* charFoundAt =
      nsCharTraits<char16_t>::find(aSearchStart.get(), fragmentLength, aChar);
  if (charFoundAt) {
    aSearchStart.advance(charFoundAt - aSearchStart.get());
    return true;
  }

  aSearchStart.advance(fragmentLength);
  return false;
}

bool FindCharInReadable(char aChar, nsACString::const_iterator& aSearchStart,
                        const nsACString::const_iterator& aSearchEnd) {
  ptrdiff_t fragmentLength = aSearchEnd.get() - aSearchStart.get();

  const char* charFoundAt =
      nsCharTraits<char>::find(aSearchStart.get(), fragmentLength, aChar);
  if (charFoundAt) {
    aSearchStart.advance(charFoundAt - aSearchStart.get());
    return true;
  }

  aSearchStart.advance(fragmentLength);
  return false;
}

bool StringBeginsWith(const nsAString& aSource, const nsAString& aSubstring) {
  nsAString::size_type src_len = aSource.Length(),
                       sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, 0, sub_len).Equals(aSubstring);
}

bool StringBeginsWith(const nsAString& aSource, const nsAString& aSubstring,
                      nsStringComparator aComparator) {
  nsAString::size_type src_len = aSource.Length(),
                       sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, 0, sub_len).Equals(aSubstring, aComparator);
}

bool StringBeginsWith(const nsACString& aSource, const nsACString& aSubstring) {
  nsACString::size_type src_len = aSource.Length(),
                        sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, 0, sub_len).Equals(aSubstring);
}

bool StringBeginsWith(const nsACString& aSource, const nsACString& aSubstring,
                      nsCStringComparator aComparator) {
  nsACString::size_type src_len = aSource.Length(),
                        sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, 0, sub_len).Equals(aSubstring, aComparator);
}

bool StringEndsWith(const nsAString& aSource, const nsAString& aSubstring) {
  nsAString::size_type src_len = aSource.Length(),
                       sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, src_len - sub_len, sub_len).Equals(aSubstring);
}

bool StringEndsWith(const nsAString& aSource, const nsAString& aSubstring,
                    nsStringComparator aComparator) {
  nsAString::size_type src_len = aSource.Length(),
                       sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, src_len - sub_len, sub_len)
      .Equals(aSubstring, aComparator);
}

bool StringEndsWith(const nsACString& aSource, const nsACString& aSubstring) {
  nsACString::size_type src_len = aSource.Length(),
                        sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, src_len - sub_len, sub_len).Equals(aSubstring);
}

bool StringEndsWith(const nsACString& aSource, const nsACString& aSubstring,
                    nsCStringComparator aComparator) {
  nsACString::size_type src_len = aSource.Length(),
                        sub_len = aSubstring.Length();
  if (sub_len > src_len) {
    return false;
  }
  return Substring(aSource, src_len - sub_len, sub_len)
      .Equals(aSubstring, aComparator);
}

static const char16_t empty_buffer[1] = {'\0'};

const nsString& EmptyString() {
  static const nsDependentString sEmpty(empty_buffer);

  return sEmpty;
}

const nsCString& EmptyCString() {
  static const nsDependentCString sEmpty((const char*)empty_buffer);

  return sEmpty;
}

const nsString& VoidString() {
  static const nsString sNull(mozilla::detail::StringDataFlags::VOIDED);

  return sNull;
}

const nsCString& VoidCString() {
  static const nsCString sNull(mozilla::detail::StringDataFlags::VOIDED);

  return sNull;
}

int32_t CompareUTF8toUTF16(const nsACString& aUTF8String,
                           const nsAString& aUTF16String) {
  const char* u8;
  const char* u8end;
  aUTF8String.BeginReading(u8);
  aUTF8String.EndReading(u8end);

  const char16_t* u16;
  const char16_t* u16end;
  aUTF16String.BeginReading(u16);
  aUTF16String.EndReading(u16end);

  for (;;) {
    if (u8 == u8end) {
      if (u16 == u16end) {
        return 0;
      }
      return -1;
    }
    if (u16 == u16end) {
      return 1;
    }
    char32_t scalar8;
    mozilla::Utf8Unit unit(*u8++);
    if (mozilla::IsAscii(unit)) {
      scalar8 = unit.toUint8();
    } else {
      scalar8 = LossyDecodeOneUtf8CodePoint(unit, &u8, u8end);
    }
    uint32_t scalar16 = mozilla::DecodeOneUtf16CodePoint(&u16, u16end);
    if (scalar16 == scalar8) {
      continue;
    }
    if (scalar8 < scalar16) {
      return -1;
    }
    return 1;
  }
}

void AppendUCS4ToUTF16(const uint32_t aSource, nsAString& aDest) {
  NS_ASSERTION(mozilla::IsValidCodePoint(aSource), "Invalid UCS4 char");
  if (mozilla::IsInBMP(aSource)) {
    aDest.Append(char16_t(aSource));
  } else {
    aDest.Append(mozilla::HighSurrogate(aSource));
    aDest.Append(mozilla::LowSurrogate(aSource));
  }
}
