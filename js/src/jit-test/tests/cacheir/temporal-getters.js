// |jit-test| skip-if: typeof Temporal === 'undefined'

var durationValues = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, -10],
  [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10],

  // Date components just below their 2^32 limit, so they exceed INT32_MAX and
  // are stored as doubles.
  [4294967295, 4294967295, 4294967295, 4294967295, 0, 0, 0, 0, 0, 0],

  // Time components up to the maximum safe integer.
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 9007199254740991],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, -9007199254740991],

  // Values straddling the Int32Value/DoubleValue boundary.
  [0, 0, 0, 0, 2147483647, 2147483648, 4294967295, 0, 0, 0],
];

function testDurationGetters() {
  for (var i = 0; i < 250; ++i) {
    var v = durationValues[i % durationValues.length];
    var d = new Temporal.Duration(...v);

    assertEq(d.years, v[0]);
    assertEq(d.months, v[1]);
    assertEq(d.weeks, v[2]);
    assertEq(d.days, v[3]);
    assertEq(d.hours, v[4]);
    assertEq(d.minutes, v[5]);
    assertEq(d.seconds, v[6]);
    assertEq(d.milliseconds, v[7]);
    assertEq(d.microseconds, v[8]);
    assertEq(d.nanoseconds, v[9]);
  }
}
testDurationGetters();

function testPlainTimeGetters() {
  var timeValues = [
    // All components zero, and all components at their maximum.
    [0, 0, 0, 0, 0, 0],
    [23, 59, 59, 999, 999, 999],

    // Small distinct values, so a mixed-up shift yields a wrong answer.
    [1, 2, 3, 4, 5, 6],

    // Arbitrary mid-range values.
    [13, 37, 42, 123, 456, 789],

    // |second| is exactly the first value with a bit at or above bit 32.
    [16, 32, 4, 512, 256, 128],

    // |second| is the largest value entirely below bit 32.
    [8, 4, 3, 1, 2, 512],
  ];

  for (var i = 0; i < 250; ++i) {
    var [hour, minute, second, ms, us, ns] = timeValues[i % timeValues.length];
    var t = new Temporal.PlainTime(hour, minute, second, ms, us, ns);

    assertEq(t.hour, hour);
    assertEq(t.minute, minute);
    assertEq(t.second, second);
    assertEq(t.millisecond, ms);
    assertEq(t.microsecond, us);
    assertEq(t.nanosecond, ns);
  }
}
testPlainTimeGetters();

function testPlainDateTimeGetters() {
  var dateTimeValues = [
    [1970, 1, 1, 0, 0, 0, 0, 0, 0],
    [2024, 2, 29, 23, 59, 59, 999, 999, 999],
    [2026, 7, 31, 1, 2, 3, 4, 5, 6],
    [1999, 12, 31, 13, 37, 42, 123, 456, 789],
    [2000, 1, 1, 16, 32, 4, 512, 256, 128],
    [-271821, 4, 20, 8, 4, 3, 1, 2, 512],
  ];

  for (var i = 0; i < 250; ++i) {
    var v = dateTimeValues[i % dateTimeValues.length];
    var dt = new Temporal.PlainDateTime(...v);

    assertEq(dt.hour, v[3]);
    assertEq(dt.minute, v[4]);
    assertEq(dt.second, v[5]);
    assertEq(dt.millisecond, v[6]);
    assertEq(dt.microsecond, v[7]);
    assertEq(dt.nanosecond, v[8]);
  }
}
testPlainDateTimeGetters();

var epochValues = [
  [0n, 0],

  // Sub-millisecond, both signs. Everything below 1ms floors to 0 or -1.
  [1n, 0],
  [999999n, 0],
  [-1n, -1],
  [-999999n, -1],

  // Exact millisecond boundaries and one nanosecond past them.
  [1000000n, 1],
  [-1000000n, -1],
  [-1000001n, -2],

  // Just under a second.
  [999999999n, 999],
  [-999999999n, -1000],

  // Values that cross the Int32 range, where the result stops being
  // representable as an Int32.
  [2147483648000000n, 2147483648],
  [-2147483649000000n, -2147483649],

  // Representable extremes.
  [8640000000000000000000n, 8640000000000000],
  [-8640000000000000000000n, -8640000000000000],
];

function testInstantEpochMilliseconds() {
  for (var i = 0; i < 250; ++i) {
    var [nanos, expected] = epochValues[i % epochValues.length];
    assertEq(new Temporal.Instant(nanos).epochMilliseconds, expected);
  }
}
testInstantEpochMilliseconds();

function testZonedDateTimeEpochMilliseconds() {
  var timeZones = ["UTC", "+11:11", "America/New_York"];

  for (var i = 0; i < 250; ++i) {
    var [nanos, expected] = epochValues[i % epochValues.length];
    var tz = timeZones[i % timeZones.length];
    assertEq(new Temporal.ZonedDateTime(nanos, tz).epochMilliseconds, expected);
  }
}
testZonedDateTimeEpochMilliseconds();
