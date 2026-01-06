/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Intl.DurationFormat implementation. */

#include "builtin/intl/DurationFormat.h"

#include "mozilla/Assertions.h"
#include "mozilla/intl/DateTimeFormat.h"
#include "mozilla/intl/ListFormat.h"
#include "mozilla/intl/NumberFormat.h"
#include "mozilla/Span.h"

#include <array>
#include <charconv>

#include "jspubtd.h"
#include "NamespaceImports.h"

#include "builtin/intl/CommonFunctions.h"
#include "builtin/intl/FormatBuffer.h"
#include "builtin/intl/LanguageTag.h"
#include "builtin/intl/ListFormat.h"
#include "builtin/intl/NumberFormat.h"
#include "builtin/temporal/Duration.h"
#include "gc/AllocKind.h"
#include "gc/GCContext.h"
#include "js/CallArgs.h"
#include "js/PropertyDescriptor.h"
#include "js/PropertySpec.h"
#include "js/RootingAPI.h"
#include "js/TypeDecls.h"
#include "js/Value.h"
#include "vm/GlobalObject.h"
#include "vm/JSContext.h"
#include "vm/PlainObject.h"
#include "vm/SelfHosting.h"
#include "vm/WellKnownAtom.h"

#include "vm/JSObject-inl.h"
#include "vm/NativeObject-inl.h"

using namespace js;
using namespace js::intl;

static constexpr auto durationUnits = std::array{
    temporal::TemporalUnit::Year,        temporal::TemporalUnit::Month,
    temporal::TemporalUnit::Week,        temporal::TemporalUnit::Day,
    temporal::TemporalUnit::Hour,        temporal::TemporalUnit::Minute,
    temporal::TemporalUnit::Second,      temporal::TemporalUnit::Millisecond,
    temporal::TemporalUnit::Microsecond, temporal::TemporalUnit::Nanosecond,
};

const JSClass DurationFormatObject::class_ = {
    "Intl.DurationFormat",
    JSCLASS_HAS_RESERVED_SLOTS(DurationFormatObject::SLOT_COUNT) |
        JSCLASS_HAS_CACHED_PROTO(JSProto_DurationFormat) |
        JSCLASS_FOREGROUND_FINALIZE,
    &DurationFormatObject::classOps_,
    &DurationFormatObject::classSpec_,
};

const JSClass& DurationFormatObject::protoClass_ = PlainObject::class_;

static bool durationFormat_format(JSContext* cx, unsigned argc, Value* vp);
static bool durationFormat_formatToParts(JSContext* cx, unsigned argc,
                                         Value* vp);

static bool durationFormat_toSource(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  args.rval().setString(cx->names().DurationFormat);
  return true;
}

static const JSFunctionSpec durationFormat_static_methods[] = {
    JS_SELF_HOSTED_FN("supportedLocalesOf",
                      "Intl_DurationFormat_supportedLocalesOf", 1, 0),
    JS_FS_END,
};

static const JSFunctionSpec durationFormat_methods[] = {
    JS_SELF_HOSTED_FN("resolvedOptions", "Intl_DurationFormat_resolvedOptions",
                      0, 0),
    JS_FN("format", durationFormat_format, 1, 0),
    JS_FN("formatToParts", durationFormat_formatToParts, 1, 0),
    JS_FN("toSource", durationFormat_toSource, 0, 0),
    JS_FS_END,
};

static const JSPropertySpec durationFormat_properties[] = {
    JS_STRING_SYM_PS(toStringTag, "Intl.DurationFormat", JSPROP_READONLY),
    JS_PS_END,
};

static bool DurationFormat(JSContext* cx, unsigned argc, Value* vp);

const JSClassOps DurationFormatObject::classOps_ = {
    nullptr,                         // addProperty
    nullptr,                         // delProperty
    nullptr,                         // enumerate
    nullptr,                         // newEnumerate
    nullptr,                         // resolve
    nullptr,                         // mayResolve
    DurationFormatObject::finalize,  // finalize
    nullptr,                         // call
    nullptr,                         // construct
    nullptr,                         // trace
};

const ClassSpec DurationFormatObject::classSpec_ = {
    GenericCreateConstructor<DurationFormat, 0, gc::AllocKind::FUNCTION>,
    GenericCreatePrototype<DurationFormatObject>,
    durationFormat_static_methods,
    nullptr,
    durationFormat_methods,
    durationFormat_properties,
    nullptr,
    ClassSpec::DontDefineConstructor,
};

void js::DurationFormatObject::finalize(JS::GCContext* gcx, JSObject* obj) {
  MOZ_ASSERT(gcx->onMainThread());

  auto* durationFormat = &obj->as<DurationFormatObject>();

  for (auto unit : durationUnits) {
    if (auto* nf = durationFormat->getNumberFormat(unit)) {
      RemoveICUCellMemory(gcx, obj, NumberFormatObject::EstimatedMemoryUse);
      delete nf;
    }
  }

  if (auto* lf = durationFormat->getListFormat()) {
    RemoveICUCellMemory(gcx, obj, ListFormatObject::EstimatedMemoryUse);
    delete lf;
  }

  if (auto* options = durationFormat->getOptions()) {
    gcx->delete_(obj, options, MemoryUse::IntlOptions);
  }
}

/**
 * Intl.DurationFormat ( [ locales [ , options ] ] )
 */
static bool DurationFormat(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);

  // Step 1.
  if (!ThrowIfNotConstructing(cx, args, "Intl.DurationFormat")) {
    return false;
  }

  // Step 2 (Inlined 9.1.14, OrdinaryCreateFromConstructor).
  RootedObject proto(cx);
  if (!GetPrototypeFromBuiltinConstructor(cx, args, JSProto_DurationFormat,
                                          &proto)) {
    return false;
  }

  Rooted<DurationFormatObject*> durationFormat(
      cx, NewObjectWithClassProto<DurationFormatObject>(cx, proto));
  if (!durationFormat) {
    return false;
  }

  HandleValue locales = args.get(0);
  HandleValue options = args.get(1);

  // Steps 3-28.
  if (!InitializeObject(cx, durationFormat,
                        cx->names().InitializeDurationFormat, locales,
                        options)) {
    return false;
  }

  args.rval().setObject(*durationFormat);
  return true;
}

/**
 * Returns the time separator string for the given locale and numbering system.
 */
static JSString* GetTimeSeparator(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat) {
  if (auto* separator = durationFormat->getTimeSeparator()) {
    return separator;
  }

  Rooted<JSObject*> internals(cx, GetInternalsObject(cx, durationFormat));
  if (!internals) {
    return nullptr;
  }

  Rooted<Value> value(cx);

  if (!GetProperty(cx, internals, internals, cx->names().locale, &value)) {
    return nullptr;
  }

  UniqueChars locale = EncodeLocale(cx, value.toString());
  if (!locale) {
    return nullptr;
  }

  if (!GetProperty(cx, internals, internals, cx->names().numberingSystem,
                   &value)) {
    return nullptr;
  }

  UniqueChars numberingSystem = EncodeAscii(cx, value.toString());
  if (!numberingSystem) {
    return nullptr;
  }

  FormatBuffer<char16_t, INITIAL_CHAR_BUFFER_SIZE> separator(cx);
  auto result = mozilla::intl::DateTimeFormat::GetTimeSeparator(
      mozilla::MakeStringSpan(locale.get()),
      mozilla::MakeStringSpan(numberingSystem.get()), separator);
  if (result.isErr()) {
    ReportInternalError(cx, result.unwrapErr());
    return nullptr;
  }

  auto* string = separator.toString(cx);
  if (!string) {
    return nullptr;
  }

  durationFormat->setTimeSeparator(string);
  return string;
}

struct DurationValue {
  // The seconds part in a `temporal::TimeDuration` can't exceed
  // 9'007'199'254'740'991 and the nanoseconds part can't exceed 999'999'999.
  // This means the string representation needs at most 27 characters.
  static constexpr size_t MaximumDecimalStringLength =
      /* sign */ 1 +
      /* seconds part */ 16 +
      /* decimal dot */ 1 +
      /* nanoseconds part */ 9;

  // Next power of two after `MaximumDecimalStringLength`.
  static constexpr size_t DecimalStringCapacity = 32;

  double number = 0;
  char decimal[DecimalStringCapacity] = {};

  explicit DurationValue() = default;
  explicit DurationValue(double number) : number(number) {}

  bool isNegative() const {
    return mozilla::IsNegative(number) || decimal[0] == '-';
  }

  auto abs() const {
    // Return unchanged if not negative.
    if (!isNegative()) {
      return *this;
    }

    // Call |std::abs| for non-decimal values.
    if (!isDecimal()) {
      return DurationValue{std::abs(number)};
    }

    // Copy decimal strings without the leading '-' sign character.
    auto result = DurationValue{};
    std::copy(std::next(decimal), std::end(decimal), result.decimal);
    return result;
  }

  // |number| is active by default unless |decimal| is used.
  bool isDecimal() const { return decimal[0] != '\0'; }

  // Return true if this value represents either +0 or -0.
  bool isZero() const { return number == 0 && !isDecimal(); }

  operator std::string_view() const {
    MOZ_ASSERT(isDecimal());
    return {decimal};
  }
};

/**
 * Return the |unit| value from |duration|.
 */
static auto ToDurationValue(const temporal::Duration& duration,
                            temporal::TemporalUnit unit) {
  using namespace temporal;

  switch (unit) {
    case TemporalUnit::Year:
      return DurationValue{duration.years};
    case TemporalUnit::Month:
      return DurationValue{duration.months};
    case TemporalUnit::Week:
      return DurationValue{duration.weeks};
    case TemporalUnit::Day:
      return DurationValue{duration.days};
    case TemporalUnit::Hour:
      return DurationValue{duration.hours};
    case TemporalUnit::Minute:
      return DurationValue{duration.minutes};
    case TemporalUnit::Second:
      return DurationValue{duration.seconds};
    case TemporalUnit::Millisecond:
      return DurationValue{duration.milliseconds};
    case TemporalUnit::Microsecond:
      return DurationValue{duration.microseconds};
    case TemporalUnit::Nanosecond:
      return DurationValue{duration.nanoseconds};
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;
  }
  MOZ_CRASH("invalid temporal unit");
}

/**
 * Return the "display" property name for |unit|.
 */
static PropertyName* DurationDisplayName(temporal::TemporalUnit unit,
                                         JSContext* cx) {
  using namespace temporal;

  switch (unit) {
    case TemporalUnit::Year:
      return cx->names().yearsDisplay;
    case TemporalUnit::Month:
      return cx->names().monthsDisplay;
    case TemporalUnit::Week:
      return cx->names().weeksDisplay;
    case TemporalUnit::Day:
      return cx->names().daysDisplay;
    case TemporalUnit::Hour:
      return cx->names().hoursDisplay;
    case TemporalUnit::Minute:
      return cx->names().minutesDisplay;
    case TemporalUnit::Second:
      return cx->names().secondsDisplay;
    case TemporalUnit::Millisecond:
      return cx->names().millisecondsDisplay;
    case TemporalUnit::Microsecond:
      return cx->names().microsecondsDisplay;
    case TemporalUnit::Nanosecond:
      return cx->names().nanosecondsDisplay;
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;
  }
  MOZ_CRASH("invalid temporal unit");
}

/**
 * Convert |value|, which must be a string, to a |DurationDisplay|.
 */
static bool ToDurationDisplay(JSContext* cx, const Value& value,
                              DurationDisplay* result) {
  MOZ_ASSERT(value.isString());

  auto* linear = value.toString()->ensureLinear(cx);
  if (!linear) {
    return false;
  }

  if (StringEqualsAscii(linear, "auto")) {
    *result = DurationDisplay::Auto;
  } else {
    MOZ_ASSERT(StringEqualsAscii(linear, "always"));
    *result = DurationDisplay::Always;
  }
  return true;
}

/**
 * Return the "style" property name for |unit|.
 */
static PropertyName* DurationStyleName(temporal::TemporalUnit unit,
                                       JSContext* cx) {
  using namespace temporal;

  switch (unit) {
    case TemporalUnit::Year:
      return cx->names().yearsStyle;
    case TemporalUnit::Month:
      return cx->names().monthsStyle;
    case TemporalUnit::Week:
      return cx->names().weeksStyle;
    case TemporalUnit::Day:
      return cx->names().daysStyle;
    case TemporalUnit::Hour:
      return cx->names().hoursStyle;
    case TemporalUnit::Minute:
      return cx->names().minutesStyle;
    case TemporalUnit::Second:
      return cx->names().secondsStyle;
    case TemporalUnit::Millisecond:
      return cx->names().millisecondsStyle;
    case TemporalUnit::Microsecond:
      return cx->names().microsecondsStyle;
    case TemporalUnit::Nanosecond:
      return cx->names().nanosecondsStyle;
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;
  }
  MOZ_CRASH("invalid temporal unit");
}

/**
 * Convert |value|, which must be a string, to a |DurationStyle|.
 */
static bool ToDurationStyle(JSContext* cx, const Value& value,
                            DurationStyle* result) {
  MOZ_ASSERT(value.isString());

  auto* linear = value.toString()->ensureLinear(cx);
  if (!linear) {
    return false;
  }

  if (StringEqualsAscii(linear, "long")) {
    *result = DurationStyle::Long;
  } else if (StringEqualsAscii(linear, "short")) {
    *result = DurationStyle::Short;
  } else if (StringEqualsAscii(linear, "narrow")) {
    *result = DurationStyle::Narrow;
  } else if (StringEqualsAscii(linear, "numeric")) {
    *result = DurationStyle::Numeric;
  } else {
    MOZ_ASSERT(StringEqualsAscii(linear, "2-digit"));
    *result = DurationStyle::TwoDigit;
  }
  return true;
}

/**
 * Return the fractional digits setting from |durationFormat|.
 */
static std::pair<uint32_t, uint32_t> GetFractionalDigits(
    const DurationFormatObject* durationFormat) {
  auto* options = durationFormat->getOptions();
  MOZ_ASSERT(options, "unexpected unresolved duration format options");

  int8_t digits = options->fractionalDigits;
  MOZ_ASSERT(digits <= 9);

  if (digits < 0) {
    return {0U, 9U};
  }
  return {uint32_t(digits), uint32_t(digits)};
}

static DurationUnitOptions GetUnitOptions(const DurationFormatOptions& options,
                                          temporal::TemporalUnit unit) {
  using namespace temporal;

  switch (unit) {
#define GET_UNIT_OPTIONS(name) \
  DurationUnitOptions { options.name##Display, options.name##Style }

    case TemporalUnit::Year:
      return GET_UNIT_OPTIONS(years);
    case TemporalUnit::Month:
      return GET_UNIT_OPTIONS(months);
    case TemporalUnit::Week:
      return GET_UNIT_OPTIONS(weeks);
    case TemporalUnit::Day:
      return GET_UNIT_OPTIONS(days);
    case TemporalUnit::Hour:
      return GET_UNIT_OPTIONS(hours);
    case TemporalUnit::Minute:
      return GET_UNIT_OPTIONS(minutes);
    case TemporalUnit::Second:
      return GET_UNIT_OPTIONS(seconds);
    case TemporalUnit::Millisecond:
      return GET_UNIT_OPTIONS(milliseconds);
    case TemporalUnit::Microsecond:
      return GET_UNIT_OPTIONS(microseconds);
    case TemporalUnit::Nanosecond:
      return GET_UNIT_OPTIONS(nanoseconds);
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;

#undef GET_UNIT_OPTIONS
  }
  MOZ_CRASH("invalid duration unit");
}

static void SetUnitOptions(DurationFormatOptions& options,
                           temporal::TemporalUnit unit,
                           const DurationUnitOptions& unitOptions) {
  using namespace temporal;

  switch (unit) {
#define SET_UNIT_OPTIONS(name)                    \
  do {                                            \
    options.name##Display = unitOptions.display_; \
    options.name##Style = unitOptions.style_;     \
  } while (0)

    case TemporalUnit::Year:
      SET_UNIT_OPTIONS(years);
      return;
    case TemporalUnit::Month:
      SET_UNIT_OPTIONS(months);
      return;
    case TemporalUnit::Week:
      SET_UNIT_OPTIONS(weeks);
      return;
    case TemporalUnit::Day:
      SET_UNIT_OPTIONS(days);
      return;
    case TemporalUnit::Hour:
      SET_UNIT_OPTIONS(hours);
      return;
    case TemporalUnit::Minute:
      SET_UNIT_OPTIONS(minutes);
      return;
    case TemporalUnit::Second:
      SET_UNIT_OPTIONS(seconds);
      return;
    case TemporalUnit::Millisecond:
      SET_UNIT_OPTIONS(milliseconds);
      return;
    case TemporalUnit::Microsecond:
      SET_UNIT_OPTIONS(microseconds);
      return;
    case TemporalUnit::Nanosecond:
      SET_UNIT_OPTIONS(nanoseconds);
      return;
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;

#undef SET_UNIT_OPTIONS
  }
  MOZ_CRASH("invalid duration unit");
}

static DurationFormatOptions* NewDurationFormatOptions(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat) {
  Rooted<JSObject*> internals(cx, GetInternalsObject(cx, durationFormat));
  if (!internals) {
    return nullptr;
  }

  auto options = cx->make_unique<DurationFormatOptions>();
  if (!options) {
    return nullptr;
  }

  Rooted<Value> value(cx);
  for (temporal::TemporalUnit unit : durationUnits) {
    DurationDisplay display;
    if (!GetProperty(cx, internals, internals, DurationDisplayName(unit, cx),
                     &value)) {
      return nullptr;
    }
    if (!ToDurationDisplay(cx, value, &display)) {
      return nullptr;
    }

    DurationStyle style;
    if (!GetProperty(cx, internals, internals, DurationStyleName(unit, cx),
                     &value)) {
      return nullptr;
    }
    if (!ToDurationStyle(cx, value, &style)) {
      return nullptr;
    }

    SetUnitOptions(*options, unit,
                   DurationUnitOptions{static_cast<uint8_t>(display),
                                       static_cast<uint8_t>(style)});
  }

  if (!GetProperty(cx, internals, internals, cx->names().fractionalDigits,
                   &value)) {
    return nullptr;
  }
  if (value.isUndefined()) {
    options->fractionalDigits = -1;
  } else {
    options->fractionalDigits = value.toInt32();
  }

  return options.release();
}

static DurationFormatOptions* GetOrCreateDurationFormatOptions(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat) {
  auto* options = durationFormat->getOptions();
  if (options) {
    return options;
  }

  options = NewDurationFormatOptions(cx, durationFormat);
  if (!options) {
    return nullptr;
  }
  durationFormat->setOptions(options);

  AddCellMemory(durationFormat, sizeof(DurationFormatOptions),
                MemoryUse::IntlOptions);
  return options;
}

/**
 * Return the locale for `mozilla::intl::NumberFormat` objects.
 */
static UniqueChars NewDurationNumberFormatLocale(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat) {
  // ICU expects numberingSystem as a Unicode locale extensions on locale.

  Rooted<JSObject*> internals(cx, GetInternalsObject(cx, durationFormat));
  if (!internals) {
    return nullptr;
  }

  JS::RootedVector<UnicodeExtensionKeyword> keywords(cx);

  Rooted<Value> value(cx);
  if (!GetProperty(cx, internals, internals, cx->names().numberingSystem,
                   &value)) {
    return nullptr;
  }

  {
    auto* numberingSystem = value.toString()->ensureLinear(cx);
    if (!numberingSystem) {
      return nullptr;
    }

    if (!keywords.emplaceBack("nu", numberingSystem)) {
      return nullptr;
    }
  }

  return FormatLocale(cx, internals, keywords);
}

/**
 * Create a `mozilla::intl::NumberFormat` instance based on |internals.locale|
 * and |options|.
 */
static mozilla::intl::NumberFormat* NewDurationNumberFormat(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    const mozilla::intl::NumberFormatOptions& options) {
  auto locale = NewDurationNumberFormatLocale(cx, durationFormat);
  if (!locale) {
    return nullptr;
  }

  auto result = mozilla::intl::NumberFormat::TryCreate(locale.get(), options);
  if (result.isErr()) {
    ReportInternalError(cx, result.unwrapErr());
    return nullptr;
  }
  return result.unwrap().release();
}

/**
 * Return the singular name for |unit|.
 */
static std::string_view UnitName(temporal::TemporalUnit unit) {
  using namespace temporal;

  switch (unit) {
    case TemporalUnit::Year:
      return "year";
    case TemporalUnit::Month:
      return "month";
    case TemporalUnit::Week:
      return "week";
    case TemporalUnit::Day:
      return "day";
    case TemporalUnit::Hour:
      return "hour";
    case TemporalUnit::Minute:
      return "minute";
    case TemporalUnit::Second:
      return "second";
    case TemporalUnit::Millisecond:
      return "millisecond";
    case TemporalUnit::Microsecond:
      return "microsecond";
    case TemporalUnit::Nanosecond:
      return "nanosecond";
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;
  }
  MOZ_CRASH("invalid temporal unit");
}

/**
 * Return the singular name for |unit|.
 */
static auto PartUnitName(temporal::TemporalUnit unit) {
  using namespace temporal;

  switch (unit) {
    case TemporalUnit::Year:
      return &JSAtomState::year;
    case TemporalUnit::Month:
      return &JSAtomState::month;
    case TemporalUnit::Week:
      return &JSAtomState::week;
    case TemporalUnit::Day:
      return &JSAtomState::day;
    case TemporalUnit::Hour:
      return &JSAtomState::hour;
    case TemporalUnit::Minute:
      return &JSAtomState::minute;
    case TemporalUnit::Second:
      return &JSAtomState::second;
    case TemporalUnit::Millisecond:
      return &JSAtomState::millisecond;
    case TemporalUnit::Microsecond:
      return &JSAtomState::microsecond;
    case TemporalUnit::Nanosecond:
      return &JSAtomState::nanosecond;
    case TemporalUnit::Unset:
    case TemporalUnit::Auto:
      break;
  }
  MOZ_CRASH("invalid temporal unit");
}

/**
 * Convert a duration-style to the corresponding NumberFormat unit-display.
 */
static auto UnitDisplay(DurationStyle style) {
  using UnitDisplay = mozilla::intl::NumberFormatOptions::UnitDisplay;

  switch (style) {
    case DurationStyle::Long:
      return UnitDisplay::Long;
    case DurationStyle::Short:
      return UnitDisplay::Short;
    case DurationStyle::Narrow:
      return UnitDisplay::Narrow;
    case DurationStyle::Numeric:
    case DurationStyle::TwoDigit:
      // Both numeric styles are invalid inputs for this function.
      break;
  }
  MOZ_CRASH("invalid duration style");
}

/**
 * ComputeFractionalDigits ( durationFormat, duration )
 *
 * Return the fractional seconds from |duration| as an exact value. This is
 * either an integer Number value when the fractional part is zero, or a
 * decimal string when the fractional part is non-zero.
 */
static auto ComputeFractionalDigits(const temporal::Duration& duration,
                                    temporal::TemporalUnit unit) {
  using namespace temporal;

  MOZ_ASSERT(IsValidDuration(duration));
  MOZ_ASSERT(TemporalUnit::Second <= unit && unit <= TemporalUnit::Microsecond);

  // Directly return the duration amount when no sub-seconds are present, i.e.
  // the fractional part is zero.
  TimeDuration timeDuration;
  int32_t exponent;
  switch (unit) {
    case TemporalUnit::Second: {
      if (duration.milliseconds == 0 && duration.microseconds == 0 &&
          duration.nanoseconds == 0) {
        return DurationValue{duration.seconds};
      }
      timeDuration = TimeDurationFromComponents({
          0,
          0,
          0,
          0,
          0,
          0,
          duration.seconds,
          duration.milliseconds,
          duration.microseconds,
          duration.nanoseconds,
      });
      exponent = 100'000'000;
      break;
    }

    case TemporalUnit::Millisecond: {
      if (duration.microseconds == 0 && duration.nanoseconds == 0) {
        return DurationValue{duration.milliseconds};
      }
      timeDuration = TimeDurationFromComponents({
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          duration.milliseconds,
          duration.microseconds,
          duration.nanoseconds,
      });
      exponent = 100'000;
      break;
    }

    case TemporalUnit::Microsecond: {
      if (duration.nanoseconds == 0) {
        return DurationValue{duration.microseconds};
      }
      timeDuration = TimeDurationFromComponents({
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          duration.microseconds,
          duration.nanoseconds,
      });
      exponent = 100;
      break;
    }

    default:
      MOZ_CRASH("bad temporal unit");
  }

  // Return the result as a decimal string when the fractional part is non-zero.

  DurationValue result{};

  char* chars = result.decimal;

  // Leading '-' sign when the duration is negative.
  if (timeDuration < TimeDuration{}) {
    *chars++ = '-';
    timeDuration = timeDuration.abs();
  }

  // Next the string representation of the seconds value.
  auto res =
      std::to_chars(chars, std::end(result.decimal), timeDuration.seconds);
  MOZ_ASSERT(res.ec == std::errc());

  // Set |chars| to one past the last character written by `std::to_chars`.
  chars = res.ptr;

  // Finish with string representation of the nanoseconds value, without any
  // trailing zeros.
  int32_t nanos = timeDuration.nanoseconds;
  for (int32_t k = 100'000'000; k != 0 && nanos != 0; k /= 10) {
    // Add decimal separator add the correct position based on |exponent|.
    if (k == exponent) {
      *chars++ = '.';
    }

    *chars++ = char('0' + (nanos / k));
    nanos %= k;
  }

  MOZ_ASSERT((chars - result.decimal) <=
                 ptrdiff_t(DurationValue::MaximumDecimalStringLength),
             "unexpected decimal string length");

  return result;
}

/**
 * FormatNumericHours ( durationFormat, hoursValue, signDisplayed )
 *
 * FormatNumericMinutes ( durationFormat, minutesValue, hoursDisplayed,
 * signDisplayed )
 *
 * FormatNumericSeconds ( durationFormat, secondsValue, minutesDisplayed,
 * signDisplayed )
 */
static mozilla::intl::NumberFormat* NewNumericFormatter(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    temporal::TemporalUnit unit) {
  // FormatNumericHours, step 1. (Not applicable in our implementation.)
  // FormatNumericMinutes, steps 1-2. (Not applicable in our implementation.)
  // FormatNumericSeconds, steps 1-2. (Not applicable in our implementation.)

  // FormatNumericHours, step 2.
  // FormatNumericMinutes, step 3.
  // FormatNumericSeconds, step 3.
  auto* dfOptions = durationFormat->getOptions();
  MOZ_ASSERT(dfOptions, "unexpected unresolved duration format options");

  auto style = GetUnitOptions(*dfOptions, unit).style();

  // FormatNumericHours, step 3.
  // FormatNumericMinutes, step 4.
  // FormatNumericSeconds, step 4.
  MOZ_ASSERT(style == DurationStyle::Numeric ||
             style == DurationStyle::TwoDigit);

  // FormatNumericHours, step 4.
  // FormatNumericMinutes, step 5.
  // FormatNumericSeconds, step 5.
  mozilla::intl::NumberFormatOptions options{};

  // FormatNumericHours, steps 5-6. (Not applicable in our implementation.)
  // FormatNumericMinutes, steps 6-7. (Not applicable in our implementation.)
  // FormatNumericSeconds, steps 6-7. (Not applicable in our implementation.)

  // FormatNumericHours, step 7.
  // FormatNumericMinutes, step 8.
  // FormatNumericSeconds, step 8.
  if (style == DurationStyle::TwoDigit) {
    options.mMinIntegerDigits = mozilla::Some(2);
  }

  // FormatNumericHours, step 8. (Not applicable in our implementation.)
  // FormatNumericMinutes, step 9. (Not applicable in our implementation.)
  // FormatNumericSeconds, step 9. (Not applicable in our implementation.)

  // FormatNumericHours, step 9.
  // FormatNumericMinutes, step 10.
  // FormatNumericSeconds, step 10.
  options.mGrouping = mozilla::intl::NumberFormatOptions::Grouping::Never;

  // FormatNumericSeconds, steps 11-14.
  if (unit == temporal::TemporalUnit::Second) {
    // FormatNumericSeconds, step 11.
    auto fractionalDigits = GetFractionalDigits(durationFormat);

    // FormatNumericSeconds, steps 12-13.
    options.mFractionDigits = mozilla::Some(fractionalDigits);

    // FormatNumericSeconds, step 14.
    options.mRoundingMode =
        mozilla::intl::NumberFormatOptions::RoundingMode::Trunc;
  }

  // FormatNumericHours, step 10.
  // FormatNumericMinutes, step 11.
  // FormatNumericSeconds, step 15.
  return NewDurationNumberFormat(cx, durationFormat, options);
}

static mozilla::intl::NumberFormat* GetOrCreateNumericFormatter(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    temporal::TemporalUnit unit) {
  // Obtain a cached mozilla::intl::NumberFormat object.
  auto* nf = durationFormat->getNumberFormat(unit);
  if (nf) {
    return nf;
  }

  nf = NewNumericFormatter(cx, durationFormat, unit);
  if (!nf) {
    return nullptr;
  }
  durationFormat->setNumberFormat(unit, nf);

  AddICUCellMemory(durationFormat, NumberFormatObject::EstimatedMemoryUse);
  return nf;
}

/**
 * NextUnitFractional ( durationFormat, unit )
 */
static bool NextUnitFractional(const DurationFormatObject* durationFormat,
                               temporal::TemporalUnit unit) {
  using namespace temporal;

  // Steps 1-3.
  if (TemporalUnit::Second <= unit && unit <= TemporalUnit::Microsecond) {
    auto* options = durationFormat->getOptions();
    MOZ_ASSERT(options, "unexpected unresolved duration format options");

    using TemporalUnitType = std::underlying_type_t<TemporalUnit>;

    auto nextUnit =
        static_cast<TemporalUnit>(static_cast<TemporalUnitType>(unit) + 1);
    auto nextStyle = GetUnitOptions(*options, nextUnit).style();
    return nextStyle == DurationStyle::Numeric;
  }

  // Step 4.
  return false;
}

/**
 * PartitionDurationFormatPattern ( durationFormat, duration )
 */
static mozilla::intl::NumberFormat* NewNumberFormat(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    temporal::TemporalUnit unit, DurationStyle style) {
  // Step 4.h.i.
  mozilla::intl::NumberFormatOptions options{};

  // Step 4.h.ii.
  if (NextUnitFractional(durationFormat, unit)) {
    // Steps 4.h.ii.2-4.
    auto fractionalDigits = GetFractionalDigits(durationFormat);
    options.mFractionDigits = mozilla::Some(fractionalDigits);

    // Step 4.h.ii.5.
    options.mRoundingMode =
        mozilla::intl::NumberFormatOptions::RoundingMode::Trunc;
  }

  // Steps 4.h.iii.4-6.
  options.mUnit = mozilla::Some(std::pair{UnitName(unit), UnitDisplay(style)});

  // Step 4.h.iii.7.
  return NewDurationNumberFormat(cx, durationFormat, options);
}

static mozilla::intl::NumberFormat* GetOrCreateNumberFormat(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    temporal::TemporalUnit unit, DurationStyle style) {
  // Obtain a cached mozilla::intl::NumberFormat object.
  auto* nf = durationFormat->getNumberFormat(unit);
  if (nf) {
    return nf;
  }

  nf = NewNumberFormat(cx, durationFormat, unit, style);
  if (!nf) {
    return nullptr;
  }
  durationFormat->setNumberFormat(unit, nf);

  AddICUCellMemory(durationFormat, NumberFormatObject::EstimatedMemoryUse);
  return nf;
}

static JSLinearString* FormatDurationValueToString(
    JSContext* cx, mozilla::intl::NumberFormat* nf,
    const DurationValue& value) {
  if (value.isDecimal()) {
    return FormatNumber(cx, nf, std::string_view{value});
  }
  return FormatNumber(cx, nf, value.number);
}

static ArrayObject* FormatDurationValueToParts(JSContext* cx,
                                               mozilla::intl::NumberFormat* nf,
                                               const DurationValue& value,
                                               temporal::TemporalUnit unit) {
  if (value.isDecimal()) {
    return FormatNumberToParts(cx, nf, std::string_view{value},
                               PartUnitName(unit));
  }
  return FormatNumberToParts(cx, nf, value.number, PartUnitName(unit));
}

static bool FormatDurationValue(JSContext* cx, mozilla::intl::NumberFormat* nf,
                                temporal::TemporalUnit unit,
                                const DurationValue& value, bool formatToParts,
                                MutableHandle<Value> result) {
  if (!formatToParts) {
    auto* str = FormatDurationValueToString(cx, nf, value);
    if (!str) {
      return false;
    }
    result.setString(str);
  } else {
    auto* parts = FormatDurationValueToParts(cx, nf, value, unit);
    if (!parts) {
      return false;
    }
    result.setObject(*parts);
  }
  return true;
}

/**
 * FormatNumericHours ( durationFormat, hoursValue, signDisplayed )
 *
 * FormatNumericMinutes ( durationFormat, minutesValue, hoursDisplayed,
 * signDisplayed )
 *
 * FormatNumericSeconds ( durationFormat, secondsValue, minutesDisplayed,
 * signDisplayed )
 */
static bool FormatNumericHoursOrMinutesOrSeconds(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    temporal::TemporalUnit unit, const DurationValue& value, bool formatToParts,
    MutableHandle<Value> result) {
  MOZ_ASSERT(temporal::TemporalUnit::Hour <= unit &&
             unit <= temporal::TemporalUnit::Second);

  // FormatNumericHours, steps 1-10.
  // FormatNumericMinutes, steps 1-11.
  // FormatNumericSeconds, steps 1-15.
  auto* nf = GetOrCreateNumericFormatter(cx, durationFormat, unit);
  if (!nf) {
    return false;
  }

  // FormatNumericHours, steps 11-13.
  // FormatNumericMinutes, steps 12-14.
  // FormatNumericSeconds, steps 16-18.
  return FormatDurationValue(cx, nf, unit, value, formatToParts, result);
}

static PlainObject* NewLiteralPart(JSContext* cx, JSString* value) {
  Rooted<IdValueVector> properties(cx, cx);
  if (!properties.emplaceBack(NameToId(cx->names().type),
                              StringValue(cx->names().literal))) {
    return nullptr;
  }
  if (!properties.emplaceBack(NameToId(cx->names().value),
                              StringValue(value))) {
    return nullptr;
  }

  return NewPlainObjectWithUniqueNames(cx, properties);
}

/**
 * FormatNumericUnits ( durationFormat, duration, firstNumericUnit,
 * signDisplayed )
 */
static bool FormatNumericUnits(JSContext* cx,
                               Handle<DurationFormatObject*> durationFormat,
                               const temporal::Duration& duration,
                               temporal::TemporalUnit firstNumericUnit,
                               bool signDisplayed, bool formatToParts,
                               MutableHandle<Value> result) {
  using namespace temporal;

  auto* options = durationFormat->getOptions();
  MOZ_ASSERT(options, "unexpected unresolved duration format options");

  Rooted<Value> formattedValue(cx);

  // Step 1.
  MOZ_ASSERT(TemporalUnit::Hour <= firstNumericUnit &&
             firstNumericUnit <= TemporalUnit::Second);

  // Step 2.
  using FormattedNumericUnitsVector = JS::GCVector<Value, 3>;
  Rooted<FormattedNumericUnitsVector> numericPartsList(cx, cx);
  if (!numericPartsList.reserve(3)) {
    return false;
  }

  // Step 3.
  auto hoursValue = DurationValue{duration.hours};

  // Step 4.
  auto hoursDisplay = GetUnitOptions(*options, TemporalUnit::Hour).display();

  // Step 5.
  auto minutesValue = DurationValue{duration.minutes};

  // Step 6.
  auto minutesDisplay =
      GetUnitOptions(*options, TemporalUnit::Minute).display();

  // Step 7-8.
  auto secondsValue = ComputeFractionalDigits(duration, TemporalUnit::Second);

  // Step 9.
  auto secondsDisplay =
      GetUnitOptions(*options, TemporalUnit::Second).display();

  // Step 10.
  bool hoursFormatted = false;

  // Step 11.
  if (firstNumericUnit == TemporalUnit::Hour) {
    // Step 11.a.
    hoursFormatted =
        !hoursValue.isZero() || hoursDisplay == DurationDisplay::Always;
  }

  // Steps 12-13.
  bool secondsFormatted =
      !secondsValue.isZero() || secondsDisplay == DurationDisplay::Always;

  // Step 14.
  bool minutesFormatted = false;

  // Step 15.
  if (firstNumericUnit == TemporalUnit::Hour ||
      firstNumericUnit == TemporalUnit::Minute) {
    // Steps 15.a-b.
    minutesFormatted = (hoursFormatted && secondsFormatted) ||
                       !minutesValue.isZero() ||
                       minutesDisplay == DurationDisplay::Always;
  }

  // Return early when no units are displayed.
  if (!hoursFormatted && !minutesFormatted && !secondsFormatted) {
    return true;
  }

  // Step 16.
  if (hoursFormatted) {
    // Step 16.a.
    if (signDisplayed) {
      if (hoursValue.isZero() && temporal::DurationSign(duration) < 0) {
        hoursValue = DurationValue{-0.0};
      }
    } else {
      // Use the absolute value to avoid changing number-format sign display.
      hoursValue = hoursValue.abs();
    }

    // Step 16.b.
    if (!FormatNumericHoursOrMinutesOrSeconds(cx, durationFormat,
                                              TemporalUnit::Hour, hoursValue,
                                              formatToParts, &formattedValue)) {
      return false;
    }

    // Step 16.c.
    numericPartsList.infallibleAppend(formattedValue);

    // Step 16.d.
    signDisplayed = false;
  }

  // Step 17.
  if (minutesFormatted) {
    // Step 17.a.
    if (signDisplayed) {
      if (minutesValue.isZero() && temporal::DurationSign(duration) < 0) {
        minutesValue = DurationValue{-0.0};
      }
    } else {
      // Use the absolute value to avoid changing number-format sign display.
      minutesValue = minutesValue.abs();
    }

    // Step 17.b.
    if (!FormatNumericHoursOrMinutesOrSeconds(
            cx, durationFormat, TemporalUnit::Minute, minutesValue,
            formatToParts, &formattedValue)) {
      return false;
    }

    // Step 17.c.
    numericPartsList.infallibleAppend(formattedValue);

    // Step 17.d.
    signDisplayed = false;
  }

  // Step 18.
  if (secondsFormatted) {
    // Step 18.a.
    if (!signDisplayed) {
      // Use the absolute value to avoid changing number-format sign display.
      secondsValue = secondsValue.abs();
    }
    if (!FormatNumericHoursOrMinutesOrSeconds(
            cx, durationFormat, TemporalUnit::Second, secondsValue,
            formatToParts, &formattedValue)) {
      return false;
    }

    // Step 18.b.
    numericPartsList.infallibleAppend(formattedValue);
  }

  MOZ_ASSERT(numericPartsList.length() > 0);

  // Step 19.
  if (numericPartsList.length() <= 1) {
    result.set(numericPartsList[0]);
    return true;
  }

  Rooted<JSString*> timeSeparator(cx, GetTimeSeparator(cx, durationFormat));
  if (!timeSeparator) {
    return false;
  }

  // Combine the individual parts into a single result.
  if (!formatToParts) {
    // Perform string concatenation when not formatting to parts.

    Rooted<JSString*> string(cx, numericPartsList[0].toString());
    Rooted<JSString*> nextString(cx);
    for (size_t i = 1; i < numericPartsList.length(); i++) {
      // Add the time separator between all elements.
      string = ConcatStrings<CanGC>(cx, string, timeSeparator);
      if (!string) {
        return false;
      }

      // Concatenate the formatted parts.
      nextString = numericPartsList[i].toString();
      string = ConcatStrings<CanGC>(cx, string, nextString);
      if (!string) {
        return false;
      }
    }

    result.setString(string);
  } else {
    // Append all formatted parts into a new array when formatting to parts.

    // First compute the final length of the result array.
    size_t length = 0;
    for (size_t i = 0; i < numericPartsList.length(); i++) {
      length += numericPartsList[i].toObject().as<ArrayObject>().length();
    }

    // Account for the time separator parts.
    length += numericPartsList.length() - 1;

    Rooted<ArrayObject*> array(cx, NewDenseFullyAllocatedArray(cx, length));
    if (!array) {
      return false;
    }
    array->ensureDenseInitializedLength(0, length);

    size_t index = 0;
    for (size_t i = 0; i < numericPartsList.length(); i++) {
      // Add the time separator between all elements.
      if (i > 0) {
        auto* timeSeparatorPart = NewLiteralPart(cx, timeSeparator);
        if (!timeSeparatorPart) {
          return false;
        }
        array->initDenseElement(index++, ObjectValue(*timeSeparatorPart));
      }

      auto* part = &numericPartsList[i].toObject().as<ArrayObject>();
      MOZ_ASSERT(IsPackedArray(part));

      // Append the formatted parts from |part|.
      for (size_t j = 0; j < part->length(); j++) {
        array->initDenseElement(index++, part->getDenseElement(j));
      }
    }
    MOZ_ASSERT(index == length);

    result.setObject(*array);
  }
  return true;
}

static mozilla::intl::ListFormat* NewDurationListFormat(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat) {
  Rooted<JSObject*> internals(cx, GetInternalsObject(cx, durationFormat));
  if (!internals) {
    return nullptr;
  }

  Rooted<Value> value(cx);
  if (!GetProperty(cx, internals, internals, cx->names().locale, &value)) {
    return nullptr;
  }

  UniqueChars locale = EncodeLocale(cx, value.toString());
  if (!locale) {
    return nullptr;
  }

  mozilla::intl::ListFormat::Options options;
  options.mType = mozilla::intl::ListFormat::Type::Unit;

  if (!GetProperty(cx, internals, internals, cx->names().style, &value)) {
    return nullptr;
  }
  {
    auto* linear = value.toString()->ensureLinear(cx);
    if (!linear) {
      return nullptr;
    }

    using ListFormatStyle = mozilla::intl::ListFormat::Style;
    if (StringEqualsLiteral(linear, "long")) {
      options.mStyle = ListFormatStyle::Long;
    } else if (StringEqualsLiteral(linear, "short")) {
      options.mStyle = ListFormatStyle::Short;
    } else if (StringEqualsLiteral(linear, "narrow")) {
      options.mStyle = ListFormatStyle::Narrow;
    } else {
      MOZ_ASSERT(StringEqualsLiteral(linear, "digital"));
      options.mStyle = ListFormatStyle::Short;
    }
  }

  auto result = mozilla::intl::ListFormat::TryCreate(
      mozilla::MakeStringSpan(locale.get()), options);
  if (result.isErr()) {
    ReportInternalError(cx, result.unwrapErr());
    return nullptr;
  }
  return result.unwrap().release();
}

static mozilla::intl::ListFormat* GetOrCreateListFormat(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat) {
  // Obtain a cached mozilla::intl::ListFormat object.
  auto* lf = durationFormat->getListFormat();
  if (lf) {
    return lf;
  }

  lf = NewDurationListFormat(cx, durationFormat);
  if (!lf) {
    return nullptr;
  }
  durationFormat->setListFormat(lf);

  AddICUCellMemory(durationFormat, ListFormatObject::EstimatedMemoryUse);
  return lf;
}

// Stack space must be large enough to hold all ten duration values.
static constexpr size_t FormattedDurationValueVectorCapacity = 10;

using FormattedDurationValueVector =
    JS::GCVector<JS::Value, FormattedDurationValueVectorCapacity>;

/**
 * ListFormatParts ( durationFormat, partitionedPartsList )
 */
static bool ListFormatParts(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    Handle<FormattedDurationValueVector> partitionedPartsList,
    bool formatToParts, MutableHandle<Value> result) {
  // Steps 1-6.
  auto* lf = GetOrCreateListFormat(cx, durationFormat);
  if (!lf) {
    return false;
  }

  // <https://unicode.org/reports/tr35/tr35-general.html#ListPatterns> requires
  // that the list patterns are sorted, for example "{1} and {0}" isn't a valid
  // pattern, because "{1}" appears before "{0}". This requirement also means
  // all entries appear in order in the formatted result.

  // Step 7.
  Vector<UniqueTwoByteChars, mozilla::intl::DEFAULT_LIST_LENGTH> strings(cx);
  mozilla::intl::ListFormat::StringList stringList{};

  // Step 8.
  Rooted<JSString*> string(cx);
  Rooted<JSString*> nextString(cx);
  Rooted<ArrayObject*> parts(cx);
  Rooted<NativeObject*> part(cx);
  Rooted<Value> value(cx);
  for (size_t i = 0; i < partitionedPartsList.length(); i++) {
    if (!formatToParts) {
      string = partitionedPartsList[i].toString();
    } else {
      parts = &partitionedPartsList[i].toObject().as<ArrayObject>();
      MOZ_ASSERT(IsPackedArray(parts));

      // Combine the individual number-formatted parts into a single string.
      string = cx->emptyString();
      for (size_t j = 0; j < parts->length(); j++) {
        part = &parts->getDenseElement(j).toObject().as<NativeObject>();
        MOZ_ASSERT(part->containsPure(cx->names().type) &&
                       part->containsPure(cx->names().value),
                   "part is a number-formatted element");

        if (!GetProperty(cx, part, part, cx->names().value, &value)) {
          return false;
        }
        MOZ_ASSERT(value.isString());

        nextString = value.toString();
        string = ConcatStrings<CanGC>(cx, string, nextString);
        if (!string) {
          return false;
        }
      }
    }

    auto* linear = string->ensureLinear(cx);
    if (!linear) {
      return false;
    }

    size_t linearLength = linear->length();

    auto chars = cx->make_pod_array<char16_t>(linearLength);
    if (!chars) {
      return false;
    }
    CopyChars(chars.get(), *linear);

    if (!strings.append(std::move(chars))) {
      return false;
    }

    if (!stringList.emplaceBack(strings[i].get(), linearLength)) {
      return false;
    }
  }

  FormatBuffer<char16_t, INITIAL_CHAR_BUFFER_SIZE> buffer(cx);
  mozilla::intl::ListFormat::PartVector partVector{};

  // Step 9.
  auto formatResult = formatToParts
                          ? lf->FormatToParts(stringList, buffer, partVector)
                          : lf->Format(stringList, buffer);
  if (formatResult.isErr()) {
    ReportInternalError(cx, formatResult.unwrapErr());
    return false;
  }

  Rooted<JSLinearString*> overallResult(cx, buffer.toString(cx));
  if (!overallResult) {
    return false;
  }

  // Directly return the string result when not formatting to parts.
  if (!formatToParts) {
    result.setString(overallResult);
    return true;
  }

  // Step 10.
  size_t partitionedPartsIndex = 0;

  // Step 11. (Not applicable in our implementation.)

  // Compute the final length of the result array.
  size_t flattenedLength = 0;
  for (size_t i = 0; i < partitionedPartsList.length(); i++) {
    auto* parts = &partitionedPartsList[i].toObject().as<ArrayObject>();
    flattenedLength += parts->length();
  }
  for (const auto& part : partVector) {
    if (part.first == mozilla::intl::ListFormat::PartType::Literal) {
      flattenedLength += 1;
    }
  }

  // Step 12.
  Rooted<ArrayObject*> flattenedPartsList(
      cx, NewDenseFullyAllocatedArray(cx, flattenedLength));
  if (!flattenedPartsList) {
    return false;
  }
  flattenedPartsList->ensureDenseInitializedLength(0, flattenedLength);

  // Step 13.
  size_t flattenedPartsIndex = 0;
  size_t partBeginIndex = 0;
  for (const auto& part : partVector) {
    // Steps 13.a-b.
    if (part.first == mozilla::intl::ListFormat::PartType::Element) {
      // Step 13.a.i.
      MOZ_ASSERT(partitionedPartsIndex < partitionedPartsList.length(),
                 "partitionedPartsIndex is an index into result");

      // Step 13.a.ii.
      auto* parts = &partitionedPartsList[partitionedPartsIndex]
                         .toObject()
                         .as<ArrayObject>();
      MOZ_ASSERT(IsPackedArray(parts));

      // Step 13.a.iii.
      //
      // Replace the "element" parts with the number-formatted result.
      for (size_t i = 0; i < parts->length(); i++) {
        flattenedPartsList->initDenseElement(flattenedPartsIndex++,
                                             parts->getDenseElement(i));
      }

      // Step 13.a.iv.
      partitionedPartsIndex += 1;
    } else {
      // Step 13.b.i.
      //
      // Append "literal" parts as-is.
      MOZ_ASSERT(part.first == mozilla::intl::ListFormat::PartType::Literal);

      // Step 13.b.ii.
      MOZ_ASSERT(part.second >= partBeginIndex);
      auto* partStr = NewDependentString(cx, overallResult, partBeginIndex,
                                         part.second - partBeginIndex);
      if (!partStr) {
        return false;
      }

      auto* literalPart = NewLiteralPart(cx, partStr);
      if (!literalPart) {
        return false;
      }

      flattenedPartsList->initDenseElement(flattenedPartsIndex++,
                                           ObjectValue(*literalPart));
    }

    partBeginIndex = part.second;
  }

  MOZ_ASSERT(partitionedPartsIndex == partitionedPartsList.length(),
             "all number-formatted parts handled");
  MOZ_ASSERT(flattenedPartsIndex == flattenedLength,
             "flattened array length miscomputed");

  // Step 14.
  result.setObject(*flattenedPartsList);
  return true;
}

/**
 * PartitionDurationFormatPattern ( durationFormat, duration )
 */
static bool PartitionDurationFormatPattern(
    JSContext* cx, Handle<DurationFormatObject*> durationFormat,
    Handle<Value> durationLike, bool formatToParts,
    MutableHandle<Value> result) {
  using namespace temporal;

  Duration duration;
  if (!ToTemporalDuration(cx, durationLike, &duration)) {
    return false;
  }

  // Normalize -0 to +0 by adding zero.
  duration.years += +0.0;
  duration.months += +0.0;
  duration.weeks += +0.0;
  duration.days += +0.0;
  duration.hours += +0.0;
  duration.minutes += +0.0;
  duration.seconds += +0.0;
  duration.milliseconds += +0.0;
  duration.microseconds += +0.0;
  duration.nanoseconds += +0.0;

  static_assert(durationUnits.size() == FormattedDurationValueVectorCapacity,
                "inline stack capacity large enough for all duration units");

  auto* options = GetOrCreateDurationFormatOptions(cx, durationFormat);
  if (!options) {
    return false;
  }

  Rooted<Value> formattedValue(cx);

  // Step 1.
  Rooted<FormattedDurationValueVector> formattedValues(cx, cx);
  if (!formattedValues.reserve(FormattedDurationValueVectorCapacity)) {
    return false;
  }

  // Step 2.
  bool signDisplayed = true;

  // Step 3.
  bool numericUnitFound = false;

  // Step 4.
  for (auto unit : durationUnits) {
    if (numericUnitFound) {
      break;
    }

    // Step 4.a. (Moved below)

    // Step 4.b.
    auto unitOptions = GetUnitOptions(*options, unit);

    // Step 4.c.
    auto style = unitOptions.style();

    // Step 4.d.
    auto display = unitOptions.display();

    // Steps 4.e-f. (Not applicable in our implementation.)

    // Steps 4.g-h.
    if (style == DurationStyle::Numeric || style == DurationStyle::TwoDigit) {
      // Step 4.g.i.
      if (!FormatNumericUnits(cx, durationFormat, duration, unit, signDisplayed,
                              formatToParts, &formattedValue)) {
        return false;
      }

      // Step 4.g.ii.
      if (!formattedValue.isUndefined()) {
        formattedValues.infallibleAppend(formattedValue);
      }

      // Step 4.g.iii.
      numericUnitFound = true;
    } else {
      // Step 4.a.
      auto value = ToDurationValue(duration, unit);

      // Step 4.h.i. (Performed in NewNumberFormat)

      // Step 4.h.ii.
      if (NextUnitFractional(durationFormat, unit)) {
        // Step 4.h.ii.1.
        value = ComputeFractionalDigits(duration, unit);

        // Steps 4.h.ii.2-5. (Performed in NewNumberFormat)

        // Step 4.h.ii.6.
        numericUnitFound = true;
      }

      // Step 4.h.iii. (Condition inverted to reduce indentation.)
      if (display == DurationDisplay::Auto && value.isZero()) {
        continue;
      }

      // Steps 4.h.iii.2-3.
      if (signDisplayed) {
        // Step 4.h.iii.2.a.
        signDisplayed = false;

        // Step 4.h.iii.2.b.
        if (value.isZero() && temporal::DurationSign(duration) < 0) {
          value = DurationValue{-0.0};
        }
      } else {
        // Use the absolute value to avoid changing number-format sign display.
        value = value.abs();
      }

      // Steps 4.h.iii.1, 4.h.iii.4-7.
      auto* nf = GetOrCreateNumberFormat(cx, durationFormat, unit, style);
      if (!nf) {
        return false;
      }

      // Steps 4.h.iii.8-10.
      if (!FormatDurationValue(cx, nf, unit, value, formatToParts,
                               &formattedValue)) {
        return false;
      }

      // Step 4.h.iii.11.
      formattedValues.infallibleAppend(formattedValue);
    }
  }

  // Step 5.
  return ListFormatParts(cx, durationFormat, formattedValues, formatToParts,
                         result);
}

static bool IsDurationFormat(HandleValue v) {
  return v.isObject() && v.toObject().is<DurationFormatObject>();
}

/**
 * Intl.DurationFormat.prototype.format ( durationLike )
 */
static bool durationFormat_format(JSContext* cx, const JS::CallArgs& args) {
  Rooted<DurationFormatObject*> durationFormat(
      cx, &args.thisv().toObject().as<DurationFormatObject>());
  return PartitionDurationFormatPattern(
      cx, durationFormat, args.get(0), /* formatToParts= */ false, args.rval());
}

/**
 * Intl.DurationFormat.prototype.format ( durationLike )
 */
static bool durationFormat_format(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  return CallNonGenericMethod<IsDurationFormat, durationFormat_format>(cx,
                                                                       args);
}

/**
 * Intl.DurationFormat.prototype.formatToParts ( durationLike )
 */
static bool durationFormat_formatToParts(JSContext* cx,
                                         const JS::CallArgs& args) {
  Rooted<DurationFormatObject*> durationFormat(
      cx, &args.thisv().toObject().as<DurationFormatObject>());
  return PartitionDurationFormatPattern(cx, durationFormat, args.get(0),
                                        /* formatToParts= */ true, args.rval());
}

/**
 * Intl.DurationFormat.prototype.formatToParts ( durationLike )
 */
static bool durationFormat_formatToParts(JSContext* cx, unsigned argc,
                                         Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  return CallNonGenericMethod<IsDurationFormat, durationFormat_formatToParts>(
      cx, args);
}

bool js::TemporalDurationToLocaleString(JSContext* cx,
                                        const JS::CallArgs& args) {
  MOZ_ASSERT(args.thisv().isObject());
  MOZ_ASSERT(args.thisv().toObject().is<temporal::DurationObject>());

  Rooted<DurationFormatObject*> durationFormat(
      cx, NewBuiltinClassInstance<DurationFormatObject>(cx));
  if (!durationFormat) {
    return false;
  }

  if (!intl::InitializeObject(cx, durationFormat,
                              cx->names().InitializeDurationFormat, args.get(0),
                              args.get(1))) {
    return false;
  }

  return PartitionDurationFormatPattern(cx, durationFormat, args.thisv(),
                                        /* formatToParts= */ false,
                                        args.rval());
}
