/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "builtin/intl/LocaleNegotiation.h"

#include "mozilla/Assertions.h"
#include "mozilla/intl/Locale.h"

#include <algorithm>
#include <iterator>
#include <stddef.h>

#include "builtin/Array.h"
#include "builtin/intl/CommonFunctions.h"
#include "builtin/intl/FormatBuffer.h"
#include "builtin/intl/SharedIntlData.h"
#include "builtin/intl/StringAsciiChars.h"
#include "js/Conversions.h"
#include "js/Result.h"
#include "vm/ArrayObject.h"
#include "vm/GlobalObject.h"
#include "vm/JSContext.h"
#include "vm/Realm.h"
#include "vm/StringType.h"

#include "vm/NativeObject-inl.h"
#include "vm/ObjectOperations-inl.h"

using namespace js;
using namespace js::intl;

static bool AssertCanonicalLocaleWithoutUnicodeExtension(
    JSContext* cx, Handle<JSLinearString*> locale) {
#ifdef DEBUG
  MOZ_ASSERT(StringIsAscii(locale), "language tags are ASCII-only");

  // |locale| is a structurally valid language tag.
  mozilla::intl::Locale tag;

  using ParserError = mozilla::intl::LocaleParser::ParserError;
  mozilla::Result<mozilla::Ok, ParserError> parse_result = Ok();
  {
    intl::StringAsciiChars chars(locale);
    if (!chars.init(cx)) {
      return false;
    }

    parse_result = mozilla::intl::LocaleParser::TryParse(chars, tag);
  }

  if (parse_result.isErr()) {
    MOZ_ASSERT(parse_result.unwrapErr() == ParserError::OutOfMemory,
               "locale is a structurally valid language tag");

    intl::ReportInternalError(cx);
    return false;
  }

  MOZ_ASSERT(!tag.GetUnicodeExtension(),
             "locale must contain no Unicode extensions");

  if (auto result = tag.Canonicalize(); result.isErr()) {
    MOZ_ASSERT(result.unwrapErr() !=
               mozilla::intl::Locale::CanonicalizationError::DuplicateVariant);
    intl::ReportInternalError(cx);
    return false;
  }

  intl::FormatBuffer<char, intl::INITIAL_CHAR_BUFFER_SIZE> buffer(cx);
  if (auto result = tag.ToString(buffer); result.isErr()) {
    intl::ReportInternalError(cx, result.unwrapErr());
    return false;
  }

  MOZ_ASSERT(StringEqualsAscii(locale, buffer.data(), buffer.length()),
             "locale is a canonicalized language tag");
#endif
  return true;
}

static bool SameOrParentLocale(const JSLinearString* locale,
                               const JSLinearString* otherLocale) {
  // Return true if |locale| is the same locale as |otherLocale|.
  if (locale->length() == otherLocale->length()) {
    return EqualStrings(locale, otherLocale);
  }

  // Also return true if |locale| is the parent locale of |otherLocale|.
  if (locale->length() < otherLocale->length()) {
    return HasSubstringAt(otherLocale, locale, 0) &&
           otherLocale->latin1OrTwoByteChar(locale->length()) == '-';
  }

  return false;
}

/**
 * 9.2.2 BestAvailableLocale ( availableLocales, locale )
 *
 * Compares a BCP 47 language tag against the locales in availableLocales and
 * returns the best available match. Uses the fallback mechanism of RFC 4647,
 * section 3.4.
 *
 * Spec: ECMAScript Internationalization API Specification, 9.2.2.
 * Spec: RFC 4647, section 3.4.
 */
static JS::Result<JSLinearString*> BestAvailableLocale(
    JSContext* cx, AvailableLocaleKind availableLocales,
    Handle<JSLinearString*> locale, Handle<JSLinearString*> defaultLocale) {
  // In the spec, [[availableLocales]] is formally a list of all available
  // locales. But in our implementation, it's an *incomplete* list, not
  // necessarily including the default locale (and all locales implied by it,
  // e.g. "de" implied by "de-CH"), if that locale isn't in every
  // [[availableLocales]] list (because that locale is supported through
  // fallback, e.g. "de-CH" supported through "de").
  //
  // If we're considering the default locale, augment the spec loop with
  // additional checks to also test whether the current prefix is a prefix of
  // the default locale.

  intl::SharedIntlData& sharedIntlData = cx->runtime()->sharedIntlData.ref();

  auto findLast = [](const auto* chars, size_t length) {
    auto rbegin = std::make_reverse_iterator(chars + length);
    auto rend = std::make_reverse_iterator(chars);
    auto p = std::find(rbegin, rend, '-');

    // |dist(chars, p.base())| is equal to |dist(p, rend)|, pick whichever you
    // find easier to reason about when using reserve iterators.
    ptrdiff_t r = std::distance(chars, p.base());
    MOZ_ASSERT(r == std::distance(p, rend));

    // But always subtract one to convert from the reverse iterator result to
    // the correspoding forward iterator value, because reserve iterators point
    // to one element past the forward iterator value.
    return r - 1;
  };

  if (!AssertCanonicalLocaleWithoutUnicodeExtension(cx, locale)) {
    return cx->alreadyReportedError();
  }

  // Step 1.
  Rooted<JSLinearString*> candidate(cx, locale);

  // Step 2.
  while (true) {
    // Step 2.a.
    bool supported = false;
    if (!sharedIntlData.isAvailableLocale(cx, availableLocales, candidate,
                                          &supported)) {
      return cx->alreadyReportedError();
    }
    if (supported) {
      return candidate.get();
    }

    if (defaultLocale && SameOrParentLocale(candidate, defaultLocale)) {
      return candidate.get();
    }

    // Step 2.b.
    ptrdiff_t pos;
    if (candidate->hasLatin1Chars()) {
      JS::AutoCheckCannotGC nogc;
      pos = findLast(candidate->latin1Chars(nogc), candidate->length());
    } else {
      JS::AutoCheckCannotGC nogc;
      pos = findLast(candidate->twoByteChars(nogc), candidate->length());
    }

    if (pos < 0) {
      return nullptr;
    }

    // Step 2.c.
    size_t length = size_t(pos);
    if (length >= 2 && candidate->latin1OrTwoByteChar(length - 2) == '-') {
      length -= 2;
    }

    // Step 2.d.
    candidate = NewDependentString(cx, candidate, 0, length);
    if (!candidate) {
      return cx->alreadyReportedError();
    }
  }
}

// 9.2.2 BestAvailableLocale ( availableLocales, locale )
//
// Carries an additional third argument in our implementation to provide the
// default locale. See the doc-comment in the header file.
bool js::intl::BestAvailableLocale(JSContext* cx,
                                   AvailableLocaleKind availableLocales,
                                   Handle<JSLinearString*> locale,
                                   Handle<JSLinearString*> defaultLocale,
                                   MutableHandle<JSLinearString*> result) {
  JSLinearString* res;
  JS_TRY_VAR_OR_RETURN_FALSE(
      cx, res,
      BestAvailableLocale(cx, availableLocales, locale, defaultLocale));
  if (res) {
    result.set(res);
  } else {
    result.set(nullptr);
  }
  return true;
}

template <typename CharT>
static size_t BaseNameLength(mozilla::Range<const CharT> locale) {
  // Search for the start of the first singleton subtag.
  for (size_t i = 0; i < locale.length(); i++) {
    if (locale[i] == '-') {
      MOZ_RELEASE_ASSERT(i + 2 < locale.length(), "invalid locale");
      if (locale[i + 2] == '-') {
        return i;
      }
    }
  }
  return locale.length();
}

static size_t BaseNameLength(JSLinearString* locale) {
  JS::AutoCheckCannotGC nogc;
  if (locale->hasLatin1Chars()) {
    return BaseNameLength(locale->latin1Range(nogc));
  }
  return BaseNameLength(locale->twoByteRange(nogc));
}

/**
 * Returns the subset of requestedLocales for which availableLocales has a
 * matching (possibly fallback) locale. Locales appear in the same order in the
 * returned list as in the input list.
 *
 * Spec: ECMAScript Internationalization API Specification, 9.2.7.
 * Spec: ECMAScript Internationalization API Specification, 9.2.8.
 */
static bool LookupSupportedLocales(
    JSContext* cx, AvailableLocaleKind availableLocales,
    Handle<LocalesList> requestedLocales,
    MutableHandle<LocalesList> supportedLocales) {
  // Step 1.
  MOZ_ASSERT(supportedLocales.empty());

  Rooted<JSLinearString*> defaultLocale(
      cx, cx->global()->globalIntlData().defaultLocale(cx));
  if (!defaultLocale) {
    return false;
  }

  // Step 2.
  Rooted<JSLinearString*> noExtensionsLocale(cx);
  Rooted<JSLinearString*> availableLocale(cx);
  for (size_t i = 0; i < requestedLocales.length(); i++) {
    auto locale = requestedLocales[i];

    // Step 2.a.
    //
    // Use the base name to ignore any extension sequences.
    noExtensionsLocale =
        NewDependentString(cx, locale, 0, BaseNameLength(locale));
    if (!noExtensionsLocale) {
      return false;
    }

    // Step 2.b.
    JSLinearString* availableLocale;
    JS_TRY_VAR_OR_RETURN_FALSE(
        cx, availableLocale,
        BestAvailableLocale(cx, availableLocales, noExtensionsLocale,
                            defaultLocale));

    // Step 2.c.
    if (availableLocale) {
      if (!supportedLocales.append(locale)) {
        return false;
      }
    }
  }

  // Step 3.
  return true;
}

/**
 * Returns the subset of requestedLocales for which availableLocales has a
 * matching (possibly fallback) locale. Locales appear in the same order in the
 * returned list as in the input list.
 *
 * Spec: ECMAScript Internationalization API Specification, 9.2.9.
 */
static bool SupportedLocales(JSContext* cx,
                             AvailableLocaleKind availableLocales,
                             Handle<LocalesList> requestedLocales,
                             Handle<Value> options,
                             MutableHandle<LocalesList> supportedLocales) {
  // Step 1.
  if (!options.isUndefined()) {
    // Step 1.a.
    Rooted<JSObject*> obj(cx, ToObject(cx, options));
    if (!obj) {
      return false;
    }

    // Step 1.b.
    Rooted<Value> localeMatcher(cx);
    if (!GetProperty(cx, obj, obj, cx->names().localeMatcher, &localeMatcher)) {
      return false;
    }

    if (!localeMatcher.isUndefined()) {
      JSString* str = ToString(cx, localeMatcher);
      if (!str) {
        return false;
      }

      JSLinearString* linear = str->ensureLinear(cx);
      if (!linear) {
        return false;
      }

      if (!StringEqualsLiteral(linear, "lookup") &&
          !StringEqualsLiteral(linear, "best fit")) {
        if (auto chars = QuoteString(cx, linear)) {
          JS_ReportErrorNumberASCII(cx, GetErrorMessage, nullptr,
                                    JSMSG_INVALID_LOCALE_MATCHER, chars.get());
        }
        return false;
      }
    }
  }

  // Steps 2-5.
  //
  // We don't yet support anything better than the lookup matcher.
  return LookupSupportedLocales(cx, availableLocales, requestedLocales,
                                supportedLocales);
}

ArrayObject* js::intl::LocalesListToArray(JSContext* cx,
                                          Handle<LocalesList> locales) {
  auto* array = NewDenseFullyAllocatedArray(cx, locales.length());
  if (!array) {
    return nullptr;
  }
  array->setDenseInitializedLength(locales.length());

  for (size_t i = 0; i < locales.length(); i++) {
    array->initDenseElement(i, StringValue(locales[i]));
  }
  return array;
}

ArrayObject* js::intl::SupportedLocalesOf(JSContext* cx,
                                          AvailableLocaleKind availableLocales,
                                          Handle<Value> locales,
                                          Handle<Value> options) {
  Rooted<LocalesList> requestedLocales(cx, cx);
  if (!CanonicalizeLocaleList(cx, locales, &requestedLocales)) {
    return nullptr;
  }

  Rooted<LocalesList> supportedLocales(cx, cx);
  if (!SupportedLocales(cx, availableLocales, requestedLocales, options,
                        &supportedLocales)) {
    return nullptr;
  }

  return LocalesListToArray(cx, supportedLocales);
}

JSLinearString* js::intl::ComputeDefaultLocale(JSContext* cx) {
  const char* locale = cx->realm()->getLocale();
  if (!locale) {
    ReportOutOfMemory(cx);
    return nullptr;
  }

  auto span = mozilla::MakeStringSpan(locale);

  mozilla::intl::Locale tag;
  bool canParseLocale =
      mozilla::intl::LocaleParser::TryParse(span, tag).isOk() &&
      tag.Canonicalize().isOk();

  Rooted<JSLinearString*> candidate(cx);
  if (!canParseLocale) {
    candidate = NewStringCopyZ<CanGC>(cx, intl::LastDitchLocale());
    if (!candidate) {
      return nullptr;
    }
  } else {
    // The default locale must be in [[AvailableLocales]], and that list must
    // not contain any locales with Unicode extension sequences, so remove any
    // present in the candidate.
    tag.ClearUnicodeExtension();

    intl::FormatBuffer<char, intl::INITIAL_CHAR_BUFFER_SIZE> buffer(cx);
    if (auto result = tag.ToString(buffer); result.isErr()) {
      intl::ReportInternalError(cx, result.unwrapErr());
      return nullptr;
    }

    candidate = buffer.toAsciiString(cx);
    if (!candidate) {
      return nullptr;
    }

    // Certain old-style language tags lack a script code, but in current
    // usage they *would* include a script code. Map these over to modern
    // forms.
    for (const auto& mapping : js::intl::oldStyleLanguageTagMappings) {
      const char* oldStyle = mapping.oldStyle;
      const char* modernStyle = mapping.modernStyle;

      if (StringEqualsAscii(candidate, oldStyle)) {
        candidate = NewStringCopyZ<CanGC>(cx, modernStyle);
        if (!candidate) {
          return nullptr;
        }
        break;
      }
    }
  }

  // 9.1 Internal slots of Service Constructors
  //
  // - [[AvailableLocales]] is a List [...]. The list must include the value
  //   returned by the DefaultLocale abstract operation (6.2.4), [...].
  //
  // That implies we must ignore any candidate which isn't supported by all
  // Intl service constructors.

  Rooted<JSLinearString*> supportedCollator(cx);
  JS_TRY_VAR_OR_RETURN_NULL(
      cx, supportedCollator,
      BestAvailableLocale(cx, AvailableLocaleKind::Collator, candidate,
                          nullptr));

  Rooted<JSLinearString*> supportedDateTimeFormat(cx);
  JS_TRY_VAR_OR_RETURN_NULL(
      cx, supportedDateTimeFormat,
      BestAvailableLocale(cx, AvailableLocaleKind::DateTimeFormat, candidate,
                          nullptr));

#ifdef DEBUG
  // Note: We don't test the supported locales of the remaining Intl service
  // constructors, because the set of supported locales is exactly equal to
  // the set of supported locales of Intl.DateTimeFormat.
  for (auto kind : {
           AvailableLocaleKind::DisplayNames,
           AvailableLocaleKind::DurationFormat,
           AvailableLocaleKind::ListFormat,
           AvailableLocaleKind::NumberFormat,
           AvailableLocaleKind::PluralRules,
           AvailableLocaleKind::RelativeTimeFormat,
           AvailableLocaleKind::Segmenter,
       }) {
    JSLinearString* supported;
    JS_TRY_VAR_OR_RETURN_NULL(
        cx, supported, BestAvailableLocale(cx, kind, candidate, nullptr));

    MOZ_ASSERT(!!supported == !!supportedDateTimeFormat);
    MOZ_ASSERT_IF(supported, EqualStrings(supported, supportedDateTimeFormat));
  }
#endif

  // Accept the candidate locale if it is supported by all Intl service
  // constructors.
  if (supportedCollator && supportedDateTimeFormat) {
    // Use the actually supported locale instead of the candidate locale. For
    // example when the candidate locale "en-US-posix" is supported through
    // "en-US", use "en-US" as the default locale.
    //
    // Also prefer the supported locale with more subtags. For example when
    // requesting "de-CH" and Intl.DateTimeFormat supports "de-CH", but
    // Intl.Collator only "de", still return "de-CH" as the result.
    if (SameOrParentLocale(supportedCollator, supportedDateTimeFormat)) {
      return supportedDateTimeFormat;
    }
    return supportedCollator;
  }

  // Return the last ditch locale if the candidate locale isn't supported.
  return NewStringCopyZ<CanGC>(cx, intl::LastDitchLocale());
}
