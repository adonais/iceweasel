/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsEscape.h"

#include "mozilla/CheckedInt.h"
#include "mozilla/TextUtils.h"
#include "nsASCIIMask.h"
#include "nsCRT.h"
#include "nsTArray.h"

static const char hexCharsUpper[] = "0123456789ABCDEF";
static const char hexCharsUpperLower[] = "0123456789ABCDEFabcdef";

static const unsigned char netCharType[256] =
    // clang-format off
/*  Bit 0       xalpha      -- the alphas
**  Bit 1       xpalpha     -- as xalpha but
**                             converts spaces to plus and plus to %2B
**  Bit 3 ...   path        -- as xalphas but doesn't escape '/'
**  Bit 4 ...   NSURL-ref   -- extra encoding for Apple NSURL compatibility.
**                             This encoding set is used on encoded URL ref
**                             components before converting a URL to an NSURL
**                             so we don't include '%' to avoid double encoding.
*/
  /*   0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F */
  {  0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0, /* 0x */
     0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0, /* 1x */
  /*       !   "   #   $   %   &   '   (   )   *   +   ,   -   .   /        */
     0x0,0x8,0x0,0x0,0x8,0x8,0x8,0x8,0x8,0x8,0xf,0xc,0x8,0xf,0xf,0xc, /* 2x */
  /*   0   1   2   3   4   5   6   7   8   9   :   ;   <   =   >   ?        */
     0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0x8,0x8,0x0,0x8,0x0,0x8, /* 3x */
  /*   @   A   B   C   D   E   F   G   H   I   J   K   L   M   N   O        */
     0x8,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf, /* 4x */
     /* bits for '@' changed from 7 to 0 so '@' can be escaped   */
     /* in usernames and passwords in publishing.                */
  /*   P   Q   R   S   T   U   V   W   X   Y   Z   [   \   ]   ^   _        */
     0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0x0,0x0,0x0,0x0,0xf, /* 5x */
  /*   `   a   b   c   d   e   f   g   h   i   j   k   l   m   n   o        */
     0x0,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf, /* 6x */
  /*   p   q   r   s   t   u   v   w   x   y   z   {   |   }   ~ DEL        */
     0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0xf,0x0,0x0,0x0,0x8,0x0, /* 7x */
     0x0,
  };

/* decode % escaped hex codes into character values
 */
#define UNHEX(C) \
    ((C >= '0' && C <= '9') ? C - '0' : \
     ((C >= 'A' && C <= 'F') ? C - 'A' + 10 : \
     ((C >= 'a' && C <= 'f') ? C - 'a' + 10 : 0)))
// clang-format on

#define IS_OK(C) (netCharType[((unsigned char)(C))] & (aFlags))
#define HEX_ESCAPE '%'

static const uint32_t ENCODE_MAX_LEN = 6;  // %uABCD

static uint32_t AppendPercentHex(char* aBuffer, unsigned char aChar) {
  uint32_t i = 0;
  aBuffer[i++] = '%';
  aBuffer[i++] = hexCharsUpper[aChar >> 4];   // high nibble
  aBuffer[i++] = hexCharsUpper[aChar & 0xF];  // low nibble
  return i;
}

static uint32_t AppendPercentHex(char16_t* aBuffer, char16_t aChar) {
  uint32_t i = 0;
  aBuffer[i++] = '%';
  if (aChar & 0xff00) {
    aBuffer[i++] = 'u';
    aBuffer[i++] = hexCharsUpper[aChar >> 12];         // high-byte high nibble
    aBuffer[i++] = hexCharsUpper[(aChar >> 8) & 0xF];  // high-byte low nibble
  }
  aBuffer[i++] = hexCharsUpper[(aChar >> 4) & 0xF];  // low-byte high nibble
  aBuffer[i++] = hexCharsUpper[aChar & 0xF];         // low-byte low nibble
  return i;
}

//----------------------------------------------------------------------------------------
char* nsEscape(const char* aStr, size_t aLength, size_t* aOutputLength,
               nsEscapeMask aFlags)
//----------------------------------------------------------------------------------------
{
  if (!aStr) {
    return nullptr;
  }

  size_t charsToEscape = 0;

  const unsigned char* src = (const unsigned char*)aStr;
  for (size_t i = 0; i < aLength; ++i) {
    if (!IS_OK(src[i])) {
      charsToEscape++;
    }
  }

  // calculate how much memory should be allocated
  // original length + 2 bytes for each escaped character + terminating '\0'
  // do the sum in steps to check for overflow
  size_t dstSize = aLength + 1 + charsToEscape;
  if (dstSize <= aLength) {
    return nullptr;
  }
  dstSize += charsToEscape;
  if (dstSize < aLength) {
    return nullptr;
  }

  // fail if we need more than 4GB
  if (dstSize > UINT32_MAX) {
    return nullptr;
  }

  char* result = (char*)moz_xmalloc(dstSize);

  unsigned char* dst = (unsigned char*)result;
  if (aFlags == url_XPAlphas) {
    for (size_t i = 0; i < aLength; ++i) {
      unsigned char c = *src++;
      if (IS_OK(c)) {
        *dst++ = c;
      } else if (c == ' ') {
        *dst++ = '+'; /* convert spaces to pluses */
      } else {
        *dst++ = HEX_ESCAPE;
        *dst++ = hexCharsUpper[c >> 4];   /* high nibble */
        *dst++ = hexCharsUpper[c & 0x0f]; /* low nibble */
      }
    }
  } else {
    for (size_t i = 0; i < aLength; ++i) {
      unsigned char c = *src++;
      if (IS_OK(c)) {
        *dst++ = c;
      } else {
        *dst++ = HEX_ESCAPE;
        *dst++ = hexCharsUpper[c >> 4];   /* high nibble */
        *dst++ = hexCharsUpper[c & 0x0f]; /* low nibble */
      }
    }
  }

  *dst = '\0'; /* tack on eos */
  if (aOutputLength) {
    *aOutputLength = dst - (unsigned char*)result;
  }

  return result;
}

//----------------------------------------------------------------------------------------
char* nsUnescape(char* aStr)
//----------------------------------------------------------------------------------------
{
  nsUnescapeCount(aStr);
  return aStr;
}

//----------------------------------------------------------------------------------------
int32_t nsUnescapeCount(char* aStr)
//----------------------------------------------------------------------------------------
{
  char* src = aStr;
  char* dst = aStr;

  char c1[] = " ";
  char c2[] = " ";
  char* const pc1 = c1;
  char* const pc2 = c2;

  if (!*src) {
    // A null string was passed in.  Nothing to escape.
    // Returns early as the string might not actually be mutable with
    // length 0.
    return 0;
  }

  while (*src) {
    c1[0] = *(src + 1);
    if (*(src + 1) == '\0') {
      c2[0] = '\0';
    } else {
      c2[0] = *(src + 2);
    }

    if (*src != HEX_ESCAPE || strpbrk(pc1, hexCharsUpperLower) == nullptr ||
        strpbrk(pc2, hexCharsUpperLower) == nullptr) {
      *dst++ = *src++;
    } else {
      src++; /* walk over escape */
      if (*src) {
        *dst = UNHEX(*src) << 4;
        src++;
      }
      if (*src) {
        *dst = (*dst + UNHEX(*src));
        src++;
      }
      dst++;
    }
  }

  *dst = 0;
  return (int)(dst - aStr);

} /* NET_UnEscapeCnt */

void nsAppendEscapedHTML(const nsACString& aSrc, nsACString& aDst) {
  // Preparation: aDst's length will increase by at least aSrc's length. If the
  // addition overflows, we skip this, which is fine, and we'll likely abort
  // while (infallibly) appending due to aDst becoming too large.
  mozilla::CheckedInt<nsACString::size_type> newCapacity = aDst.Length();
  newCapacity += aSrc.Length();
  if (newCapacity.isValid()) {
    aDst.SetCapacity(newCapacity.value());
  }

  for (auto cur = aSrc.BeginReading(); cur != aSrc.EndReading(); cur++) {
    if (*cur == '<') {
      aDst.AppendLiteral("&lt;");
    } else if (*cur == '>') {
      aDst.AppendLiteral("&gt;");
    } else if (*cur == '&') {
      aDst.AppendLiteral("&amp;");
    } else if (*cur == '"') {
      aDst.AppendLiteral("&quot;");
    } else if (*cur == '\'') {
      aDst.AppendLiteral("&#39;");
    } else {
      aDst.Append(*cur);
    }
  }
}

//----------------------------------------------------------------------------------------
//
// The following table encodes which characters needs to be escaped for which
// parts of an URL.  The bits are the "url components" in the enum EscapeMask,
// see nsEscape.h.

template <size_t N>
static constexpr void AddUnescapedChars(const char (&aChars)[N],
                                        uint32_t aFlags,
                                        std::array<uint32_t, 256>& aTable) {
  for (size_t i = 0; i < N - 1; ++i) {
    aTable[static_cast<unsigned char>(aChars[i])] |= aFlags;
  }
}

static constexpr std::array<uint32_t, 256> BuildEscapeChars() {
  constexpr uint32_t kAllModes = esc_Scheme | esc_Username | esc_Password |
                                 esc_Host | esc_Directory | esc_FileBaseName |
                                 esc_FileExtension | esc_Param | esc_Query |
                                 esc_Ref | esc_ExtHandler;

  std::array<uint32_t, 256> table{0};

  // Alphanumerics shouldn't be escaped in all escape modes.
  AddUnescapedChars("0123456789", kAllModes, table);
  AddUnescapedChars("ABCDEFGHIJKLMNOPQRSTUVWXYZ", kAllModes, table);
  AddUnescapedChars("abcdefghijklmnopqrstuvwxyz", kAllModes, table);
  AddUnescapedChars("!$&()*+,-_~", kAllModes, table);

  // Extra characters which aren't escaped in particular escape modes.
  AddUnescapedChars(".", esc_Scheme, table);
  // Note that behavior of esc_Username and esc_Password is the same, so these
  // could be merged (in the URL spec, both reference the "userinfo encode set"
  // https://url.spec.whatwg.org/#userinfo-percent-encode-set, so the same
  // behavior is expected.)
  // Leaving separate for now to minimize risk, as these are also IDL-exposed
  // as separate constants.
  AddUnescapedChars("'.", esc_Username, table);
  AddUnescapedChars("'.", esc_Password, table);
  AddUnescapedChars(".", esc_Host, table);  // Same as esc_Scheme
  AddUnescapedChars("'./:;=@[]|", esc_Directory, table);
  AddUnescapedChars("'.:;=@[]|", esc_FileBaseName, table);
  AddUnescapedChars("':;=@[]|", esc_FileExtension, table);
  AddUnescapedChars(".:;=@[\\]^`{|}", esc_Param, table);
  AddUnescapedChars("./:;=?@[\\]^`{|}", esc_Query, table);
  AddUnescapedChars("#'./:;=?@[\\]^{|}", esc_Ref, table);
  AddUnescapedChars("#'./:;=?@[]", esc_ExtHandler, table);

  return table;
}

static constexpr std::array<uint32_t, 256> EscapeChars = BuildEscapeChars();

static bool dontNeedEscape(unsigned char aChar, uint32_t aFlags) {
  return EscapeChars[(size_t)aChar] & aFlags;
}
static bool dontNeedEscape(uint16_t aChar, uint32_t aFlags) {
  return aChar < EscapeChars.size() ? (EscapeChars[(size_t)aChar] & aFlags)
                                    : false;
}

// The action the escaping loop takes for a single input character.
enum class EscapeAction : uint8_t {
  Keep,    // copy the character through unchanged
  Filter,  // drop the character (it matched the filter mask)
  Escape,  // replace the character with its percent-encoding
};

// Whether a character is copied through verbatim rather than percent-escaped,
// ignoring the filter mask (handled separately by ClassifyEscapeChar).
//
// The '%' is not escaped unless escaping is forced (see bug 61269). Non-ascii
// characters are kept when esc_OnlyASCII is set; ascii 0x20..0x7e are kept when
// esc_OnlyNonASCII is set, but C0 controls and DEL are still escaped. esc_Colon
// and esc_Spaces force escaping of ':' and ' ' respectively.
template <typename CharT>
static MOZ_ALWAYS_INLINE bool EscapeCharIsKept(CharT aChar, uint32_t aFlags) {
  const bool forced = !!(aFlags & esc_Forced);
  const bool ignoreNonAscii = !!(aFlags & esc_OnlyASCII);
  const bool ignoreAscii = !!(aFlags & esc_OnlyNonASCII);
  const bool colon = !!(aFlags & esc_Colon);
  const bool spaces = !!(aFlags & esc_Spaces);
  return (dontNeedEscape(aChar, aFlags) || (aChar == HEX_ESCAPE && !forced) ||
          (aChar > 0x7f && ignoreNonAscii) ||
          (aChar >= 0x20 && aChar < 0x7f && ignoreAscii)) &&
         !(aChar == ':' && colon) && !(aChar == ' ' && spaces);
}

// The per-character decision made by the escaping loop, factored out so the
// inline and table-driven code paths share one definition and cannot disagree.
template <typename CharT>
static MOZ_ALWAYS_INLINE EscapeAction ClassifyEscapeChar(
    CharT aChar, uint32_t aFlags, const ASCIIMaskArray* aFilterMask) {
  if (aFilterMask && mozilla::ASCIIMask::IsMasked(*aFilterMask, aChar)) {
    return EscapeAction::Filter;
  }
  return EscapeCharIsKept(aChar, aFlags) ? EscapeAction::Keep
                                         : EscapeAction::Escape;
}

// Precomputes the action for every 8-bit character value so the escaping loop
// can classify a character with a single table lookup. Worthwhile only for
// inputs long enough to amortize the build.
static void BuildEscapeActionTable(uint32_t aFlags,
                                   const ASCIIMaskArray* aFilterMask,
                                   EscapeAction (&aTable)[256]) {
  for (size_t i = 0; i < 256; ++i) {
    aTable[i] =
        ClassifyEscapeChar(static_cast<unsigned char>(i), aFlags, aFilterMask);
  }
}

//----------------------------------------------------------------------------------------

/**
 * Escapes a portion of a string, classifying each character with |aClassify|.
 *
 * @param aPart The pointer to the beginning of the portion of the string to
 *  escape.
 * @param aPartLen The length of the string to escape.
 * @param aResult String that has the URL escaped portion appended to. Only
 *  altered if the string is URL escaped or |aWriting| is true.
 * @param aWriting Whether to copy every character through even when nothing is
 *  escaped (corresponds to esc_AlwaysCopy).
 * @param aDidAppend Indicates whether or not data was appended to |aResult|.
 * @param aClassify A callable mapping a character to its EscapeAction.
 * @return NS_ERROR_OUT_OF_MEMORY on failure.
 */
template <class T, class Classify>
static nsresult EscapeURLLoop(const typename T::char_type* aPart,
                              size_t aPartLen, T& aResult, bool aWriting,
                              bool& aDidAppend, Classify&& aClassify) {
  using char_type = typename T::char_type;
  using unsigned_char_type =
      typename nsCharTraits<char_type>::unsigned_char_type;

  auto src = reinterpret_cast<const unsigned_char_type*>(aPart);

  bool writing = aWriting;
  char_type tempBuffer[100];
  unsigned int tempBufferPos = 0;

  for (size_t i = 0; i < aPartLen; ++i) {
    const unsigned_char_type c = src[i];
    switch (aClassify(c)) {
      case EscapeAction::Keep:
        if (writing) {
          tempBuffer[tempBufferPos++] = c;
        }
        break;
      case EscapeAction::Filter:
        // Skip the character: once writing, simply don't copy it.
        if (!writing) {
          if (!aResult.Append(aPart, i, mozilla::fallible)) {
            return NS_ERROR_OUT_OF_MEMORY;
          }
          writing = true;
        }
        break;
      case EscapeAction::Escape: {
        if (!writing) {
          if (!aResult.Append(aPart, i, mozilla::fallible)) {
            return NS_ERROR_OUT_OF_MEMORY;
          }
          writing = true;
        }
        const uint32_t len = ::AppendPercentHex(tempBuffer + tempBufferPos, c);
        tempBufferPos += len;
        MOZ_ASSERT(len <= ENCODE_MAX_LEN, "potential buffer overflow");
        break;
      }
    }

    // Flush the temp buffer if it doesn't have room for another encoded char.
    if (tempBufferPos >= std::size(tempBuffer) - ENCODE_MAX_LEN) {
      NS_ASSERTION(writing, "should be writing");
      if (!aResult.Append(tempBuffer, tempBufferPos, mozilla::fallible)) {
        return NS_ERROR_OUT_OF_MEMORY;
      }
      tempBufferPos = 0;
    }
  }
  if (writing) {
    if (!aResult.Append(tempBuffer, tempBufferPos, mozilla::fallible)) {
      return NS_ERROR_OUT_OF_MEMORY;
    }
  }
  aDidAppend = writing;
  return NS_OK;
}

template <class T>
static nsresult T_EscapeURL(const typename T::char_type* aPart, size_t aPartLen,
                            uint32_t aFlags, const ASCIIMaskArray* aFilterMask,
                            T& aResult, bool& aDidAppend) {
  static_assert(
      sizeof(typename T::char_type) == 1 || sizeof(typename T::char_type) == 2,
      "unexpected char type");

  if (!aPart) {
    MOZ_ASSERT_UNREACHABLE("null pointer");
    return NS_ERROR_INVALID_ARG;
  }

  const bool writing = !!(aFlags & esc_AlwaysCopy);

  // For long 8-bit strings, precompute each character's action once so the loop
  // classifies with a single table lookup instead of re-deriving the filter and
  // escape decision every iteration (two table lookups plus a chain of
  // comparisons). Short strings classify inline to avoid the table-build cost.
  if constexpr (sizeof(typename T::char_type) == 1) {
    constexpr size_t kFastPathMinLength = 256;
    if (aPartLen >= kFastPathMinLength) {
      EscapeAction actions[256];
      BuildEscapeActionTable(aFlags, aFilterMask, actions);
      return EscapeURLLoop(aPart, aPartLen, aResult, writing, aDidAppend,
                           [&actions](unsigned char c) { return actions[c]; });
    }
  }

  return EscapeURLLoop(aPart, aPartLen, aResult, writing, aDidAppend,
                       [aFlags, aFilterMask](auto c) {
                         return ClassifyEscapeChar(c, aFlags, aFilterMask);
                       });
}

bool NS_EscapeURL(const char* aPart, int32_t aPartLen, uint32_t aFlags,
                  nsACString& aResult) {
  size_t partLen;
  if (aPartLen < 0) {
    partLen = strlen(aPart);
  } else {
    partLen = aPartLen;
  }

  return NS_EscapeURLSpan(mozilla::Span(aPart, partLen), aFlags, aResult);
}

bool NS_EscapeURLSpan(mozilla::Span<const char> aStr, uint32_t aFlags,
                      nsACString& aResult) {
  bool appended = false;
  nsresult rv = T_EscapeURL(aStr.Elements(), aStr.Length(), aFlags, nullptr,
                            aResult, appended);
  if (NS_FAILED(rv)) {
    ::NS_ABORT_OOM(aResult.Length() * sizeof(nsACString::char_type));
  }

  return appended;
}

nsresult NS_EscapeURL(const nsACString& aStr, uint32_t aFlags,
                      nsACString& aResult, const mozilla::fallible_t&) {
  bool appended = false;
  nsresult rv = T_EscapeURL(aStr.Data(), aStr.Length(), aFlags, nullptr,
                            aResult, appended);
  if (NS_FAILED(rv)) {
    aResult.Truncate();
    return rv;
  }

  if (!appended) {
    aResult = aStr;
  }

  return rv;
}

nsresult NS_EscapeAndFilterURL(const nsACString& aStr, uint32_t aFlags,
                               const ASCIIMaskArray* aFilterMask,
                               nsACString& aResult,
                               const mozilla::fallible_t&) {
  bool appended = false;
  nsresult rv = T_EscapeURL(aStr.Data(), aStr.Length(), aFlags, aFilterMask,
                            aResult, appended);
  if (NS_FAILED(rv)) {
    aResult.Truncate();
    return rv;
  }

  if (!appended) {
    if (!aResult.Assign(aStr, mozilla::fallible)) {
      return NS_ERROR_OUT_OF_MEMORY;
    }
  }

  return rv;
}

const nsAString& NS_EscapeURL(const nsAString& aStr, uint32_t aFlags,
                              nsAString& aResult) {
  bool result = false;
  nsresult rv = T_EscapeURL<nsAString>(aStr.Data(), aStr.Length(), aFlags,
                                       nullptr, aResult, result);

  if (NS_FAILED(rv)) {
    ::NS_ABORT_OOM(aResult.Length() * sizeof(nsAString::char_type));
  }

  if (result) {
    return aResult;
  }
  return aStr;
}

// Starting at aStr[aStart] find the first index in aStr that matches any
// character that is forbidden by aFunction. Return false if not found.
static bool FindFirstMatchFrom(const nsString& aStr, size_t aStart,
                               const std::function<bool(char16_t)>& aFunction,
                               size_t* aIndex) {
  for (size_t j = aStart, l = aStr.Length(); j < l; ++j) {
    if (aFunction(aStr[j])) {
      *aIndex = j;
      return true;
    }
  }
  return false;
}

const nsAString& NS_EscapeURL(const nsString& aStr,
                              const std::function<bool(char16_t)>& aFunction,
                              nsAString& aResult) {
  bool didEscape = false;
  for (size_t i = 0, strLen = aStr.Length(); i < strLen;) {
    size_t j;
    if (MOZ_UNLIKELY(FindFirstMatchFrom(aStr, i, aFunction, &j))) {
      if (i == 0) {
        didEscape = true;
        aResult.Truncate();
        aResult.SetCapacity(aStr.Length());
      }
      if (j != i) {
        // The substring from 'i' up to 'j' that needs no escaping.
        aResult.Append(nsDependentSubstring(aStr, i, j - i));
      }
      char16_t buffer[ENCODE_MAX_LEN];
      uint32_t bufferLen = ::AppendPercentHex(buffer, aStr[j]);
      MOZ_ASSERT(bufferLen <= ENCODE_MAX_LEN, "buffer overflow");
      aResult.Append(buffer, bufferLen);
      i = j + 1;
    } else {
      if (MOZ_UNLIKELY(didEscape)) {
        // The tail of the string that needs no escaping.
        aResult.Append(nsDependentSubstring(aStr, i, strLen - i));
      }
      break;
    }
  }
  if (MOZ_UNLIKELY(didEscape)) {
    return aResult;
  }
  return aStr;
}

bool NS_UnescapeURL(const char* aStr, int32_t aLen, uint32_t aFlags,
                    nsACString& aResult) {
  bool didAppend = false;
  nsresult rv =
      NS_UnescapeURL(aStr, aLen, aFlags, aResult, didAppend, mozilla::fallible);
  if (rv == NS_ERROR_OUT_OF_MEMORY) {
    ::NS_ABORT_OOM(aLen * sizeof(nsACString::char_type));
  }

  return didAppend;
}

nsresult NS_UnescapeURL(const char* aStr, int32_t aLen, uint32_t aFlags,
                        nsACString& aResult, bool& aDidAppend,
                        const mozilla::fallible_t&) {
  if (!aStr) {
    MOZ_ASSERT_UNREACHABLE("null pointer");
    return NS_ERROR_INVALID_ARG;
  }

  MOZ_ASSERT(aResult.IsEmpty(),
             "Passing a non-empty string as an out parameter!");

  uint32_t len;
  if (aLen < 0) {
    size_t stringLength = strlen(aStr);
    if (stringLength >= UINT32_MAX) {
      return NS_ERROR_OUT_OF_MEMORY;
    }
    len = stringLength;
  } else {
    len = aLen;
  }

  bool ignoreNonAscii = !!(aFlags & esc_OnlyASCII);
  bool ignoreAscii = !!(aFlags & esc_OnlyNonASCII);
  bool writing = !!(aFlags & esc_AlwaysCopy);
  bool skipControl = !!(aFlags & esc_SkipControl);
  bool skipInvalidHostChar = !!(aFlags & esc_Host);

  unsigned char* destPtr;
  uint32_t destPos;

  if (writing) {
    if (!aResult.SetLength(len, mozilla::fallible)) {
      return NS_ERROR_OUT_OF_MEMORY;
    }
    destPos = 0;
    destPtr = reinterpret_cast<unsigned char*>(aResult.BeginWriting());
  }

  const char* last = aStr;
  const char* end = aStr + len;

  for (const char* p = aStr; p < end; ++p) {
    if (*p == HEX_ESCAPE && p + 2 < end) {
      unsigned char c1 = *((unsigned char*)p + 1);
      unsigned char c2 = *((unsigned char*)p + 2);
      unsigned char u = (UNHEX(c1) << 4) + UNHEX(c2);
      if (mozilla::IsAsciiHexDigit(c1) && mozilla::IsAsciiHexDigit(c2) &&
          (!skipInvalidHostChar || dontNeedEscape(u, aFlags) || c1 >= '8') &&
          ((c1 < '8' && !ignoreAscii) || (c1 >= '8' && !ignoreNonAscii)) &&
          !(skipControl &&
            (c1 < '2' || (c1 == '7' && (c2 == 'f' || c2 == 'F'))))) {
        if (MOZ_UNLIKELY(!writing)) {
          writing = true;
          if (!aResult.SetLength(len, mozilla::fallible)) {
            return NS_ERROR_OUT_OF_MEMORY;
          }
          destPos = 0;
          destPtr = reinterpret_cast<unsigned char*>(aResult.BeginWriting());
        }
        if (p > last) {
          auto toCopy = p - last;
          memcpy(destPtr + destPos, last, toCopy);
          destPos += toCopy;
          MOZ_ASSERT(destPos <= len);
          last = p;
        }
        destPtr[destPos] = u;
        destPos += 1;
        MOZ_ASSERT(destPos <= len);
        p += 2;
        last += 3;
      }
    }
  }
  if (writing && last < end) {
    auto toCopy = end - last;
    memcpy(destPtr + destPos, last, toCopy);
    destPos += toCopy;
    MOZ_ASSERT(destPos <= len);
  }

  if (writing) {
    aResult.Truncate(destPos);
  }

  aDidAppend = writing;
  return NS_OK;
}
