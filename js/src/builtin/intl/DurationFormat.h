/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_intl_DurationFormat_h
#define builtin_intl_DurationFormat_h

#include <stdint.h>

#include "builtin/SelfHostingDefines.h"
#include "builtin/temporal/TemporalUnit.h"
#include "js/Class.h"
#include "vm/NativeObject.h"

namespace mozilla::intl {
class ListFormat;
class NumberFormat;
}  // namespace mozilla::intl

namespace js {

namespace intl {
enum class DurationDisplay : uint8_t { Auto, Always };
enum class DurationStyle : uint8_t { Long, Short, Narrow, Numeric, TwoDigit };

struct DurationFormatOptions {
  // Packed representation to keep the unit options as small as possible.
  //
  // Use |uint8_t| instead of the actual enum type to avoid GCC warnings:
  // https://gcc.gnu.org/bugzilla/show_bug.cgi?id=61414
#define DECLARE_DURATION_UNIT(name)                \
  /* DurationDisplay */ uint8_t name##Display : 1; \
  /* DurationStyle */ uint8_t name##Style : 3;

  DECLARE_DURATION_UNIT(years);
  DECLARE_DURATION_UNIT(months);
  DECLARE_DURATION_UNIT(weeks);
  DECLARE_DURATION_UNIT(days);
  DECLARE_DURATION_UNIT(hours);
  DECLARE_DURATION_UNIT(minutes);
  DECLARE_DURATION_UNIT(seconds);
  DECLARE_DURATION_UNIT(milliseconds);
  DECLARE_DURATION_UNIT(microseconds);
  DECLARE_DURATION_UNIT(nanoseconds);

#undef DECLARE_DURATION_UNIT

  int8_t fractionalDigits;
};

struct DurationUnitOptions {
  // Use the same bit-widths for fast extraction from DurationFormatOptions.
  /* DurationDisplay */ uint8_t display_ : 1;
  /* DurationStyle */ uint8_t style_ : 3;

  auto display() const { return static_cast<DurationDisplay>(display_); }

  auto style() const { return static_cast<DurationStyle>(style_); }
};

}  // namespace intl

class DurationFormatObject : public NativeObject {
 public:
  static const JSClass class_;
  static const JSClass& protoClass_;

  static constexpr uint32_t INTERNALS_SLOT = 0;
  static constexpr uint32_t LIST_FORMAT_SLOT = 1;
  static constexpr uint32_t NUMBER_FORMAT_YEARS_SLOT = 2;
  static constexpr uint32_t NUMBER_FORMAT_MONTHS_SLOT = 3;
  static constexpr uint32_t NUMBER_FORMAT_WEEKS_SLOT = 4;
  static constexpr uint32_t NUMBER_FORMAT_DAYS_SLOT = 5;
  static constexpr uint32_t NUMBER_FORMAT_HOURS_SLOT = 6;
  static constexpr uint32_t NUMBER_FORMAT_MINUTES_SLOT = 7;
  static constexpr uint32_t NUMBER_FORMAT_SECONDS_SLOT = 8;
  static constexpr uint32_t NUMBER_FORMAT_MILLISECONDS_SLOT = 9;
  static constexpr uint32_t NUMBER_FORMAT_MICROSECONDS_SLOT = 10;
  static constexpr uint32_t NUMBER_FORMAT_NANOSECONDS_SLOT = 11;
  static constexpr uint32_t OPTIONS_SLOT = 12;
  static constexpr uint32_t TIME_SEPARATOR_SLOT = 13;
  static constexpr uint32_t SLOT_COUNT = 14;

  static_assert(INTERNALS_SLOT == INTL_INTERNALS_OBJECT_SLOT,
                "INTERNALS_SLOT must match self-hosting define for internals "
                "object slot");

 private:
  static constexpr uint32_t numberFormatSlot(temporal::TemporalUnit unit) {
    MOZ_ASSERT(temporal::TemporalUnit::Year <= unit &&
               unit <= temporal::TemporalUnit::Nanosecond);

    static_assert(uint32_t(temporal::TemporalUnit::Year) ==
                  NUMBER_FORMAT_YEARS_SLOT);
    static_assert(uint32_t(temporal::TemporalUnit::Nanosecond) ==
                  NUMBER_FORMAT_NANOSECONDS_SLOT);

    return uint32_t(unit);
  }

 public:
  mozilla::intl::NumberFormat* getNumberFormat(
      temporal::TemporalUnit unit) const {
    const auto& slot = getFixedSlot(numberFormatSlot(unit));
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<mozilla::intl::NumberFormat*>(slot.toPrivate());
  }

  void setNumberFormat(temporal::TemporalUnit unit,
                       mozilla::intl::NumberFormat* numberFormat) {
    setFixedSlot(numberFormatSlot(unit), PrivateValue(numberFormat));
  }

  mozilla::intl::ListFormat* getListFormat() const {
    const auto& slot = getFixedSlot(LIST_FORMAT_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<mozilla::intl::ListFormat*>(slot.toPrivate());
  }

  void setListFormat(mozilla::intl::ListFormat* listFormat) {
    setFixedSlot(LIST_FORMAT_SLOT, PrivateValue(listFormat));
  }

  intl::DurationFormatOptions* getOptions() const {
    const auto& slot = getFixedSlot(OPTIONS_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<intl::DurationFormatOptions*>(slot.toPrivate());
  }

  void setOptions(intl::DurationFormatOptions* options) {
    setFixedSlot(OPTIONS_SLOT, PrivateValue(options));
  }

  JSString* getTimeSeparator() const {
    const auto& slot = getFixedSlot(TIME_SEPARATOR_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return slot.toString();
  }

  void setTimeSeparator(JSString* timeSeparator) {
    setFixedSlot(TIME_SEPARATOR_SLOT, StringValue(timeSeparator));
  }

 private:
  static const JSClassOps classOps_;
  static const ClassSpec classSpec_;

  static void finalize(JS::GCContext* gcx, JSObject* obj);
};

/**
 * `toLocaleString` implementation for Temporal.Duration objects.
 */
[[nodiscard]] extern bool TemporalDurationToLocaleString(
    JSContext* cx, const JS::CallArgs& args);

}  // namespace js

#endif /* builtin_intl_DurationFormat_h */
