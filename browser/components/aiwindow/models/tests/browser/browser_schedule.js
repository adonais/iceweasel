/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IntervalSchedule, DailySchedule, WeeklySchedule, Schedule } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs"
  );

add_task(function test_Schedule_fromJSON_normalizes_supported_shapes() {
  Assert.equal(new IntervalSchedule(1).hours, 1);

  const interval = Schedule.fromJSON({ type: "interval", hours: "30" });
  Assert.ok(interval instanceof IntervalSchedule);
  Assert.equal(interval.hours, 30);

  const daily = Schedule.fromJSON({ type: "daily", hour: "9", minute: "5" });
  Assert.ok(daily instanceof DailySchedule);
  Assert.equal(daily.hour, 9);
  Assert.equal(daily.minute, 5);

  const weekly = Schedule.fromJSON({
    type: "weekly",
    weekday: "2",
    hour: "14",
    minute: "45",
  });
  Assert.ok(weekly instanceof WeeklySchedule);
  Assert.equal(weekly.weekday, 2);
  Assert.equal(weekly.hour, 14);
  Assert.equal(weekly.minute, 45);

  const existing = new IntervalSchedule(4);
  Assert.equal(Schedule.fromJSON(existing), existing);

  Assert.throws(
    () => Schedule.fromJSON({ type: "yearly" }),
    /Monitor schedule type is invalid/
  );
});

add_task(function test_Schedule_validates_invalid_shapes() {
  Assert.throws(() => Schedule.fromJSON(null), /Monitor schedule is invalid/);
  Assert.throws(
    () => Schedule.fromJSON({}),
    /Monitor schedule type is invalid/
  );
  Assert.throws(
    () => Schedule.fromJSON({ type: "interval", hours: "soon" }),
    /Monitor interval schedule is invalid/
  );

  Assert.throws(
    () => new IntervalSchedule(0),
    /Monitor interval schedule is invalid/
  );
  Assert.throws(
    () => new IntervalSchedule(Infinity),
    /Monitor interval schedule is invalid/
  );
  Assert.throws(() => new DailySchedule(24, 0), /Monitor hour 24 is invalid/);
  Assert.throws(() => new DailySchedule(9, 60), /Monitor minute 60 is invalid/);
  Assert.throws(
    () => new WeeklySchedule(7, 9, 0),
    /Monitor weekday 7 is invalid/
  );
});
