/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_temporal_ZonedDateTime_h
#define builtin_temporal_ZonedDateTime_h

#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"

#include <stdint.h>

#include "builtin/temporal/Calendar.h"
#include "builtin/temporal/Instant.h"
#include "builtin/temporal/TemporalTypes.h"
#include "builtin/temporal/TimeZone.h"
#include "js/RootingAPI.h"
#include "js/TypeDecls.h"
#include "js/Value.h"
#include "vm/NativeObject.h"

class JS_PUBLIC_API JSTracer;

namespace js {
struct ClassSpec;
}

namespace js::temporal {

class ZonedDateTimeObject : public NativeObject {
 public:
  static const JSClass class_;
  static const JSClass& protoClass_;

  JS_DEFINE_TYPED_SLOT(0, SECONDS_SLOT, Double);
  JS_DEFINE_TYPED_SLOT(1, NANOSECONDS_SLOT, Int32);
  JS_DEFINE_TYPED_SLOT(2, TIMEZONE_SLOT, Object);
  JS_DEFINE_TYPED_SLOT(3, CALENDAR_AND_OFFSET_SLOT, Int32);
  static constexpr uint32_t SLOT_COUNT = 4;

  /**
   * Extract the epoch nanoseconds fields from this ZonedDateTime object.
   */
  EpochNanoseconds epochNanoseconds() const {
    double seconds = getFixedSlotTyped(SECONDS_SLOT).toDouble();
    MOZ_ASSERT(-8'640'000'000'000 <= seconds && seconds <= 8'640'000'000'000);

    int32_t nanoseconds = getFixedSlotTyped(NANOSECONDS_SLOT).toInt32();
    MOZ_ASSERT(0 <= nanoseconds && nanoseconds <= 999'999'999);

    return {{int64_t(seconds), nanoseconds}};
  }

  TimeZoneValue timeZone() const {
    return TimeZoneValue(getFixedSlotTyped(TIMEZONE_SLOT));
  }

  CalendarValue calendar() const { return CalendarValue(packed().calendar()); }

  mozilla::Maybe<int32_t> cachedOffsetSeconds() const {
    return packed().offsetSeconds();
  }

  void setCachedOffsetSeconds(int32_t offset) {
    setFixedSlotTyped(CALENDAR_AND_OFFSET_SLOT,
                      Int32Value(packed().withOffsetSeconds(offset).value));
  }

 private:
  PackedCalendarAndOffset packed() const {
    return {getFixedSlotTyped(CALENDAR_AND_OFFSET_SLOT).toInt32()};
  }

  static const ClassSpec classSpec_;
};

class MOZ_STACK_CLASS ZonedDateTime final {
  EpochNanoseconds epochNanoseconds_;
  TimeZoneValue timeZone_;
  CalendarValue calendar_;
  ZonedDateTimeObject* object_ = nullptr;

 public:
  ZonedDateTime() = default;

  ZonedDateTime(const EpochNanoseconds& epochNanoseconds,
                const TimeZoneValue& timeZone, const CalendarValue& calendar,
                ZonedDateTimeObject* object = nullptr)
      : epochNanoseconds_(epochNanoseconds),
        timeZone_(timeZone),
        calendar_(calendar),
        object_(object) {
    MOZ_ASSERT(IsValidEpochNanoseconds(epochNanoseconds));
    MOZ_ASSERT(timeZone);
    MOZ_ASSERT(calendar);
#ifdef DEBUG
    AssertObjectConsistency(epochNanoseconds, timeZone, object);
#endif
  }

  explicit ZonedDateTime(ZonedDateTimeObject* obj)
      : ZonedDateTime(obj->epochNanoseconds(), obj->timeZone(), obj->calendar(),
                      obj) {}

  const auto& epochNanoseconds() const { return epochNanoseconds_; }

  const auto& timeZone() const { return timeZone_; }

  const auto& calendar() const { return calendar_; }

  auto* object() const {
#ifdef DEBUG
    AssertObjectConsistency(epochNanoseconds_, timeZone_, object_);
#endif
    return object_;
  }

  explicit operator bool() const { return !!timeZone_ && !!calendar_; }

  void trace(JSTracer* trc) {
    timeZone_.trace(trc);
    calendar_.trace(trc);
    TraceRoot(trc, &object_, "ZonedDateTime::object");
  }

  const auto* timeZoneDoNotUse() const { return &timeZone_; }
  const auto* calendarDoNotUse() const { return &calendar_; }
  const auto* objectDoNotUse() const {
#ifdef DEBUG
    AssertObjectConsistency(epochNanoseconds_, timeZone_, object_);
#endif
    return &object_;
  }

 private:
#ifdef DEBUG
  static void AssertObjectConsistency(const EpochNanoseconds& epochNanoseconds,
                                      TimeZoneValue timeZone,
                                      const ZonedDateTimeObject* object) {
    MOZ_ASSERT_IF(object, epochNanoseconds == object->epochNanoseconds());
    MOZ_ASSERT_IF(object, timeZone.toTimeZoneObject() ==
                              object->timeZone().toTimeZoneObject());
  }
#endif
};

struct DifferenceSettings;
enum class TemporalDisambiguation;
enum class TemporalOffset;
enum class TemporalUnit;

/**
 * CreateTemporalZonedDateTime ( epochNanoseconds, timeZone, calendar [ ,
 * newTarget ] )
 */
ZonedDateTimeObject* CreateTemporalZonedDateTime(
    JSContext* cx, const EpochNanoseconds& epochNanoseconds,
    JS::Handle<TimeZoneValue> timeZone, JS::Handle<CalendarValue> calendar);

/**
 * AddZonedDateTime ( epochNanoseconds, timeZone, calendar, duration, overflow )
 */
bool AddZonedDateTime(JSContext* cx, JS::Handle<ZonedDateTime> zonedDateTime,
                      const InternalDuration& duration,
                      EpochNanoseconds* result);

/**
 * DifferenceZonedDateTimeWithRounding ( ns1, ns2, timeZone, calendar,
 * largestUnit, roundingIncrement, smallestUnit, roundingMode )
 */
bool DifferenceZonedDateTimeWithRounding(
    JSContext* cx, JS::Handle<ZonedDateTime> zonedDateTime,
    const EpochNanoseconds& ns2, const DifferenceSettings& settings,
    InternalDuration* result);

/**
 * DifferenceZonedDateTimeWithTotal ( ns1, ns2, timeZone, calendar, unit )
 */
bool DifferenceZonedDateTimeWithTotal(JSContext* cx,
                                      JS::Handle<ZonedDateTime> zonedDateTime,
                                      const EpochNanoseconds& ns2,
                                      TemporalUnit unit, double* result);

enum class OffsetBehaviour { Option, Exact, Wall };

enum class MatchBehaviour { MatchExactly, MatchMinutes };

/**
 * InterpretISODateTimeOffset ( isoDate, time, offsetBehaviour,
 * offsetNanoseconds, timeZone, disambiguation, offsetOption, matchBehaviour )
 */
bool InterpretISODateTimeOffset(
    JSContext* cx, const ISODateTime& dateTime, OffsetBehaviour offsetBehaviour,
    int64_t offsetNanoseconds, JS::Handle<TimeZoneValue> timeZone,
    TemporalDisambiguation disambiguation, TemporalOffset offsetOption,
    MatchBehaviour matchBehaviour, EpochNanoseconds* result);

/**
 * InterpretISODateTimeOffset ( isoDate, time, offsetBehaviour,
 * offsetNanoseconds, timeZone, disambiguation, offsetOption, matchBehaviour )
 */
bool InterpretISODateTimeOffset(
    JSContext* cx, const ISODate& isoDate, OffsetBehaviour offsetBehaviour,
    int64_t offsetNanoseconds, JS::Handle<TimeZoneValue> timeZone,
    TemporalDisambiguation disambiguation, TemporalOffset offsetOption,
    MatchBehaviour matchBehaviour, EpochNanoseconds* result);

// Helper for MutableWrappedPtrOperations.
bool WrapZonedDateTime(JSContext* cx,
                       MutableHandle<ZonedDateTime> zonedDateTime);

} /* namespace js::temporal */

namespace js {

template <typename Wrapper>
class WrappedPtrOperations<temporal::ZonedDateTime, Wrapper> {
  const auto& container() const {
    return static_cast<const Wrapper*>(this)->get();
  }

 public:
  explicit operator bool() const { return bool(container()); }

  const auto& epochNanoseconds() const {
    return container().epochNanoseconds();
  }

  JS::Handle<temporal::TimeZoneValue> timeZone() const {
    return JS::Handle<temporal::TimeZoneValue>::fromMarkedLocation(
        container().timeZoneDoNotUse());
  }

  JS::Handle<temporal::CalendarValue> calendar() const {
    return JS::Handle<temporal::CalendarValue>::fromMarkedLocation(
        container().calendarDoNotUse());
  }

  JS::Handle<temporal::ZonedDateTimeObject*> object() const {
    return JS::Handle<temporal::ZonedDateTimeObject*>::fromMarkedLocation(
        container().objectDoNotUse());
  }
};

template <typename Wrapper>
class MutableWrappedPtrOperations<temporal::ZonedDateTime, Wrapper>
    : public WrappedPtrOperations<temporal::ZonedDateTime, Wrapper> {
  auto& container() { return static_cast<Wrapper*>(this)->get(); }

 public:
  /**
   * Wrap the stored time zone into the current compartment and drop object
   * backpointers when they would be cross-compartment.
   */
  bool wrap(JSContext* cx) {
    MOZ_ASSERT(container());
    auto mh = JS::MutableHandle<temporal::ZonedDateTime>::fromMarkedLocation(
        &container());
    return temporal::WrapZonedDateTime(cx, mh);
  }
};

} /* namespace js */

#endif /* builtin_temporal_ZonedDateTime_h */
