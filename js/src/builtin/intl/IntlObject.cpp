/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Implementation of the Intl object and its non-constructor properties. */

#include "builtin/intl/IntlObject.h"

#include "mozilla/Assertions.h"
#include "mozilla/intl/Calendar.h"
#include "mozilla/intl/Collator.h"
#include "mozilla/intl/Currency.h"
#include "mozilla/intl/MeasureUnitGenerated.h"
#include "mozilla/intl/TimeZone.h"

#include <algorithm>
#include <array>
#include <cstring>
#include <iterator>
#include <string_view>

#include "builtin/Array.h"
#include "builtin/intl/CommonFunctions.h"
#include "builtin/intl/LocaleNegotiation.h"
#include "builtin/intl/NumberingSystemsGenerated.h"
#include "builtin/intl/SharedIntlData.h"
#include "ds/Sort.h"
#include "js/Class.h"
#include "js/friend/ErrorMessages.h"  // js::GetErrorMessage, JSMSG_*
#include "js/GCAPI.h"
#include "js/GCVector.h"
#include "js/PropertySpec.h"
#include "vm/GlobalObject.h"
#include "vm/JSAtomUtils.h"  // ClassName
#include "vm/JSContext.h"
#include "vm/PlainObject.h"  // js::PlainObject
#include "vm/StringType.h"

#include "vm/JSObject-inl.h"
#include "vm/NativeObject-inl.h"

using namespace js;
using namespace js::intl;

/******************** Intl ********************/

bool js::intl_GetCalendarInfo(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  MOZ_ASSERT(args.length() == 1);

  UniqueChars locale = intl::EncodeLocale(cx, args[0].toString());
  if (!locale) {
    return false;
  }

  auto result = mozilla::intl::Calendar::TryCreate(locale.get());
  if (result.isErr()) {
    intl::ReportInternalError(cx, result.unwrapErr());
    return false;
  }
  auto calendar = result.unwrap();

  RootedObject info(cx, NewPlainObject(cx));
  if (!info) {
    return false;
  }

  RootedValue v(cx);

  v.setInt32(static_cast<int32_t>(calendar->GetFirstDayOfWeek()));
  if (!DefineDataProperty(cx, info, cx->names().firstDayOfWeek, v)) {
    return false;
  }

  v.setInt32(calendar->GetMinimalDaysInFirstWeek());
  if (!DefineDataProperty(cx, info, cx->names().minDays, v)) {
    return false;
  }

  Rooted<ArrayObject*> weekendArray(cx, NewDenseEmptyArray(cx));
  if (!weekendArray) {
    return false;
  }

  auto weekend = calendar->GetWeekend();
  if (weekend.isErr()) {
    intl::ReportInternalError(cx, weekend.unwrapErr());
    return false;
  }

  for (auto day : weekend.unwrap()) {
    if (!NewbornArrayPush(cx, weekendArray,
                          Int32Value(static_cast<int32_t>(day)))) {
      return false;
    }
  }

  v.setObject(*weekendArray);
  if (!DefineDataProperty(cx, info, cx->names().weekend, v)) {
    return false;
  }

  args.rval().setObject(*info);
  return true;
}

// 9.2.2 BestAvailableLocale ( availableLocales, locale )
//
// Carries an additional third argument in our implementation to provide the
// default locale. See the doc-comment in the header file.
bool js::intl_BestAvailableLocale(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  MOZ_ASSERT(args.length() == 3);

  using AvailableLocaleKind = js::intl::AvailableLocaleKind;

  AvailableLocaleKind kind;
  {
    JSLinearString* typeStr = args[0].toString()->ensureLinear(cx);
    if (!typeStr) {
      return false;
    }

    if (StringEqualsLiteral(typeStr, "Collator")) {
      kind = AvailableLocaleKind::Collator;
    } else if (StringEqualsLiteral(typeStr, "DateTimeFormat")) {
      kind = AvailableLocaleKind::DateTimeFormat;
    } else if (StringEqualsLiteral(typeStr, "DisplayNames")) {
      kind = AvailableLocaleKind::DisplayNames;
    } else if (StringEqualsLiteral(typeStr, "DurationFormat")) {
      kind = AvailableLocaleKind::DurationFormat;
    } else if (StringEqualsLiteral(typeStr, "ListFormat")) {
      kind = AvailableLocaleKind::ListFormat;
    } else if (StringEqualsLiteral(typeStr, "NumberFormat")) {
      kind = AvailableLocaleKind::NumberFormat;
    } else if (StringEqualsLiteral(typeStr, "PluralRules")) {
      kind = AvailableLocaleKind::PluralRules;
    } else if (StringEqualsLiteral(typeStr, "RelativeTimeFormat")) {
      kind = AvailableLocaleKind::RelativeTimeFormat;
    } else {
      MOZ_ASSERT(StringEqualsLiteral(typeStr, "Segmenter"));
      kind = AvailableLocaleKind::Segmenter;
    }
  }

  Rooted<JSLinearString*> locale(cx, args[1].toString()->ensureLinear(cx));
  if (!locale) {
    return false;
  }

  MOZ_ASSERT(args[2].isNull() || args[2].isString());

  Rooted<JSLinearString*> defaultLocale(cx);
  if (args[2].isString()) {
    defaultLocale = args[2].toString()->ensureLinear(cx);
    if (!defaultLocale) {
      return false;
    }
  }

  Rooted<JSLinearString*> result(cx);
  if (!intl::BestAvailableLocale(cx, kind, locale, defaultLocale, &result)) {
    return false;
  }
  if (result) {
    args.rval().setString(result);
  } else {
    args.rval().setUndefined();
  }
  return true;
}

using StringList = GCVector<JSLinearString*>;

/**
 * Create a sorted array from a list of strings.
 */
static ArrayObject* CreateArrayFromList(JSContext* cx,
                                        MutableHandle<StringList> list) {
  // Reserve scratch space for MergeSort().
  size_t initialLength = list.length();
  if (!list.growBy(initialLength)) {
    return nullptr;
  }

  // Sort all strings in alphabetical order.
  MOZ_ALWAYS_TRUE(
      MergeSort(list.begin(), initialLength, list.begin() + initialLength,
                [](const auto* a, const auto* b, bool* lessOrEqual) {
                  *lessOrEqual = CompareStrings(a, b) <= 0;
                  return true;
                }));

  // Ensure we don't add duplicate entries to the array.
  auto* end = std::unique(
      list.begin(), list.begin() + initialLength,
      [](const auto* a, const auto* b) { return EqualStrings(a, b); });

  // std::unique leaves the elements after |end| with an unspecified value, so
  // remove them first. And also delete the elements in the scratch space.
  list.shrinkBy(std::distance(end, list.end()));

  // And finally copy the strings into the result array.
  auto* array = NewDenseFullyAllocatedArray(cx, list.length());
  if (!array) {
    return nullptr;
  }
  array->setDenseInitializedLength(list.length());

  for (size_t i = 0; i < list.length(); ++i) {
    array->initDenseElement(i, StringValue(list[i]));
  }

  return array;
}

/**
 * Create an array from a sorted list of strings.
 */
template <size_t N>
static ArrayObject* CreateArrayFromSortedList(
    JSContext* cx, const std::array<const char*, N>& list) {
  // Ensure the list is sorted and doesn't contain duplicates.
  MOZ_ASSERT(std::adjacent_find(std::begin(list), std::end(list),
                                [](const auto& a, const auto& b) {
                                  return std::strcmp(a, b) >= 0;
                                }) == std::end(list));

  size_t length = std::size(list);

  Rooted<ArrayObject*> array(cx, NewDenseFullyAllocatedArray(cx, length));
  if (!array) {
    return nullptr;
  }
  array->ensureDenseInitializedLength(0, length);

  for (size_t i = 0; i < length; ++i) {
    auto* str = NewStringCopyZ<CanGC>(cx, list[i]);
    if (!str) {
      return nullptr;
    }
    array->initDenseElement(i, StringValue(str));
  }
  return array;
}

/**
 * Create an array from an intl::Enumeration.
 */
template <const auto& unsupported>
static bool EnumerationIntoList(JSContext* cx, auto values,
                                MutableHandle<StringList> list) {
  for (auto value : values) {
    if (value.isErr()) {
      intl::ReportInternalError(cx);
      return false;
    }
    auto span = value.unwrap();

    // Skip over known, unsupported values.
    std::string_view sv(span.data(), span.size());
    if (std::any_of(std::begin(unsupported), std::end(unsupported),
                    [sv](const auto& e) { return sv == e; })) {
      continue;
    }

    auto* string = NewStringCopy<CanGC>(cx, span);
    if (!string) {
      return false;
    }
    if (!list.append(string)) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the list of calendar types which mustn't be returned by
 * |Intl.supportedValuesOf()|.
 */
static constexpr auto UnsupportedCalendars() {
  return std::array{
      "islamic",
      "islamic-rgsa",
  };
}

/**
 * AvailableCalendars ( )
 */
static ArrayObject* AvailableCalendars(JSContext* cx) {
  Rooted<StringList> list(cx, StringList(cx));

  {
    // Hazard analysis complains that the mozilla::Result destructor calls a
    // GC function, which is unsound when returning an unrooted value. Work
    // around this issue by restricting the lifetime of |keywords| to a
    // separate block.
    auto keywords = mozilla::intl::Calendar::GetBcp47KeywordValuesForLocale("");
    if (keywords.isErr()) {
      intl::ReportInternalError(cx, keywords.unwrapErr());
      return nullptr;
    }

    static constexpr auto unsupported = UnsupportedCalendars();

    if (!EnumerationIntoList<unsupported>(cx, keywords.unwrap(), &list)) {
      return nullptr;
    }
  }

  return CreateArrayFromList(cx, &list);
}

/**
 * Returns the list of collation types which mustn't be returned by
 * |Intl.supportedValuesOf()|.
 */
static constexpr auto UnsupportedCollations() {
  return std::array{
      "search",
      "standard",
  };
}

/**
 * AvailableCollations ( )
 */
static ArrayObject* AvailableCollations(JSContext* cx) {
  Rooted<StringList> list(cx, StringList(cx));

  {
    // Hazard analysis complains that the mozilla::Result destructor calls a
    // GC function, which is unsound when returning an unrooted value. Work
    // around this issue by restricting the lifetime of |keywords| to a
    // separate block.
    auto keywords = mozilla::intl::Collator::GetBcp47KeywordValues();
    if (keywords.isErr()) {
      intl::ReportInternalError(cx, keywords.unwrapErr());
      return nullptr;
    }

    static constexpr auto unsupported = UnsupportedCollations();

    if (!EnumerationIntoList<unsupported>(cx, keywords.unwrap(), &list)) {
      return nullptr;
    }
  }

  return CreateArrayFromList(cx, &list);
}

/**
 * Returns a list of known, unsupported currencies which are returned by
 * |Currency::GetISOCurrencies()|.
 */
static constexpr auto UnsupportedCurrencies() {
  // "MVP" is also marked with "questionable, remove?" in ucurr.cpp, but only
  // this single currency code isn't supported by |Intl.DisplayNames| and
  // therefore must be excluded by |Intl.supportedValuesOf|.
  return std::array{
      "LSM",  // https://unicode-org.atlassian.net/browse/ICU-21687
  };
}

/**
 * AvailableCurrencies ( )
 */
static ArrayObject* AvailableCurrencies(JSContext* cx) {
  Rooted<StringList> list(cx, StringList(cx));

  {
    // Hazard analysis complains that the mozilla::Result destructor calls a
    // GC function, which is unsound when returning an unrooted value. Work
    // around this issue by restricting the lifetime of |currencies| to a
    // separate block.
    auto currencies = mozilla::intl::Currency::GetISOCurrencies();
    if (currencies.isErr()) {
      intl::ReportInternalError(cx, currencies.unwrapErr());
      return nullptr;
    }

    static constexpr auto unsupported = UnsupportedCurrencies();

    if (!EnumerationIntoList<unsupported>(cx, currencies.unwrap(), &list)) {
      return nullptr;
    }
  }

  return CreateArrayFromList(cx, &list);
}

/**
 * AvailableNumberingSystems ( )
 */
static ArrayObject* AvailableNumberingSystems(JSContext* cx) {
  static constexpr std::array numberingSystems = {
      NUMBERING_SYSTEMS_WITH_SIMPLE_DIGIT_MAPPINGS};

  return CreateArrayFromSortedList(cx, numberingSystems);
}

/**
 * AvailableTimeZones ( )
 */
static ArrayObject* AvailableTimeZones(JSContext* cx) {
  // Unsorted list of canonical time zone names, possibly containing duplicates.
  Rooted<StringList> timeZones(cx, StringList(cx));

  intl::SharedIntlData& sharedIntlData = cx->runtime()->sharedIntlData.ref();
  auto iterResult = sharedIntlData.availableTimeZonesIteration(cx);
  if (iterResult.isErr()) {
    return nullptr;
  }
  auto iter = iterResult.unwrap();

  Rooted<JSAtom*> validatedTimeZone(cx);
  for (; !iter.done(); iter.next()) {
    validatedTimeZone = iter.get();

    // Canonicalize the time zone before adding it to the result array.
    auto* timeZone = sharedIntlData.canonicalizeTimeZone(cx, validatedTimeZone);
    if (!timeZone) {
      return nullptr;
    }

    if (!timeZones.append(timeZone)) {
      return nullptr;
    }
  }

  return CreateArrayFromList(cx, &timeZones);
}

template <size_t N>
constexpr auto MeasurementUnitNames(
    const mozilla::intl::SimpleMeasureUnit (&units)[N]) {
  std::array<const char*, N> array = {};
  for (size_t i = 0; i < N; ++i) {
    array[i] = units[i].name;
  }
  return array;
}

/**
 * AvailableUnits ( )
 */
static ArrayObject* AvailableUnits(JSContext* cx) {
  static constexpr auto simpleMeasureUnitNames =
      MeasurementUnitNames(mozilla::intl::simpleMeasureUnits);

  return CreateArrayFromSortedList(cx, simpleMeasureUnitNames);
}

/**
 * Intl.getCanonicalLocales ( locales )
 */
static bool intl_getCanonicalLocales(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);

  // Step 1.
  Rooted<LocalesList> locales(cx, cx);
  if (!CanonicalizeLocaleList(cx, args.get(0), &locales)) {
    return false;
  }

  // Step 2.
  auto* array = LocalesListToArray(cx, locales);
  if (!array) {
    return false;
  }
  args.rval().setObject(*array);
  return true;
}

/**
 * Intl.supportedValuesOf ( key )
 */
static bool intl_supportedValuesOf(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);

  // Step 1.
  auto* key = ToString(cx, args.get(0));
  if (!key) {
    return false;
  }

  auto* linearKey = key->ensureLinear(cx);
  if (!linearKey) {
    return false;
  }

  // Steps 2-8.
  ArrayObject* list;
  if (StringEqualsLiteral(linearKey, "calendar")) {
    list = AvailableCalendars(cx);
  } else if (StringEqualsLiteral(linearKey, "collation")) {
    list = AvailableCollations(cx);
  } else if (StringEqualsLiteral(linearKey, "currency")) {
    list = AvailableCurrencies(cx);
  } else if (StringEqualsLiteral(linearKey, "numberingSystem")) {
    list = AvailableNumberingSystems(cx);
  } else if (StringEqualsLiteral(linearKey, "timeZone")) {
    list = AvailableTimeZones(cx);
  } else if (StringEqualsLiteral(linearKey, "unit")) {
    list = AvailableUnits(cx);
  } else {
    if (UniqueChars chars = QuoteString(cx, linearKey, '"')) {
      JS_ReportErrorNumberASCII(cx, GetErrorMessage, nullptr, JSMSG_INVALID_KEY,
                                chars.get());
    }
    return false;
  }
  if (!list) {
    return false;
  }

  // Step 9.
  args.rval().setObject(*list);
  return true;
}

static bool intl_toSource(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  args.rval().setString(cx->names().Intl);
  return true;
}

static const JSFunctionSpec intl_static_methods[] = {
    JS_FN("toSource", intl_toSource, 0, 0),
    JS_FN("getCanonicalLocales", intl_getCanonicalLocales, 1, 0),
    JS_FN("supportedValuesOf", intl_supportedValuesOf, 1, 0),
    JS_FS_END,
};

static const JSPropertySpec intl_static_properties[] = {
    JS_STRING_SYM_PS(toStringTag, "Intl", JSPROP_READONLY),
    JS_PS_END,
};

static JSObject* CreateIntlObject(JSContext* cx, JSProtoKey key) {
  RootedObject proto(cx, &cx->global()->getObjectPrototype());

  // The |Intl| object is just a plain object with some "static" function
  // properties and some constructor properties.
  return NewTenuredObjectWithGivenProto(cx, &IntlClass, proto);
}

/**
 * Initializes the Intl Object and its standard built-in properties.
 * Spec: ECMAScript Internationalization API Specification, 8.0, 8.1
 */
static bool IntlClassFinish(JSContext* cx, HandleObject intl,
                            HandleObject proto) {
  // Add the constructor properties.
  RootedId ctorId(cx);
  RootedValue ctorValue(cx);
  for (const auto& protoKey : {
           JSProto_Collator,
           JSProto_DateTimeFormat,
           JSProto_DisplayNames,
           JSProto_DurationFormat,
           JSProto_ListFormat,
           JSProto_Locale,
           JSProto_NumberFormat,
           JSProto_PluralRules,
           JSProto_RelativeTimeFormat,
           JSProto_Segmenter,
       }) {
    if (GlobalObject::skipDeselectedConstructor(cx, protoKey)) {
      continue;
    }

    JSObject* ctor = GlobalObject::getOrCreateConstructor(cx, protoKey);
    if (!ctor) {
      return false;
    }

    ctorId = NameToId(ClassName(protoKey, cx));
    ctorValue.setObject(*ctor);
    if (!DefineDataProperty(cx, intl, ctorId, ctorValue, 0)) {
      return false;
    }
  }

  return true;
}

static const ClassSpec IntlClassSpec = {
    CreateIntlObject, nullptr, intl_static_methods, intl_static_properties,
    nullptr,          nullptr, IntlClassFinish,
};

const JSClass js::IntlClass = {
    "Intl",
    JSCLASS_HAS_CACHED_PROTO(JSProto_Intl),
    JS_NULL_CLASS_OPS,
    &IntlClassSpec,
};
