/**
 * Tests DateNormalizationUtils object.
 */

"use strict";

const { DateNormalizationUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/DateNormalizationUtils.sys.mjs"
);

add_task(function test_normalizeMonth() {
  Assert.equal(DateNormalizationUtils.normalizeMonth("01"), 1);
  Assert.equal(DateNormalizationUtils.normalizeMonth(12), 12);
  Assert.equal(DateNormalizationUtils.normalizeMonth("13"), undefined);
  Assert.equal(DateNormalizationUtils.normalizeMonth("0"), undefined);
  Assert.equal(DateNormalizationUtils.normalizeMonth(""), undefined);
  Assert.equal(DateNormalizationUtils.normalizeMonth("ab"), undefined);
});

add_task(function test_normalizeDay() {
  Assert.equal(DateNormalizationUtils.normalizeDay("1"), 1);
  Assert.equal(DateNormalizationUtils.normalizeDay(31), 31);
  Assert.equal(DateNormalizationUtils.normalizeDay("32"), undefined);
  Assert.equal(DateNormalizationUtils.normalizeDay("0"), undefined);
  Assert.equal(DateNormalizationUtils.normalizeDay("nope"), undefined);
});

add_task(function test_normalizeYear() {
  Assert.equal(DateNormalizationUtils.normalizeYear("2030"), 2030);
  // A 2-digit year is shifted into the 2000s.
  Assert.equal(DateNormalizationUtils.normalizeYear("30"), 2030);
  Assert.equal(DateNormalizationUtils.normalizeYear("0"), undefined);
  Assert.equal(DateNormalizationUtils.normalizeYear("-1"), undefined);
  Assert.equal(DateNormalizationUtils.normalizeYear(""), undefined);
});

add_task(function test_parseISODate() {
  Assert.deepEqual(DateNormalizationUtils.parseISODate("2030-05-09"), {
    year: "2030",
    month: "05",
    day: "09",
  });
  Assert.deepEqual(DateNormalizationUtils.parseISODate("2030-5-9"), {
    year: "2030",
    month: "5",
    day: "9",
  });
  Assert.deepEqual(
    DateNormalizationUtils.parseISODate(" 2030-05-09 "),
    { year: "2030", month: "05", day: "09" },
    "leading/trailing whitespace is trimmed"
  );
  Assert.deepEqual(DateNormalizationUtils.parseISODate("2030/05/09"), {});
  Assert.deepEqual(DateNormalizationUtils.parseISODate("2030-05"), {});
  Assert.deepEqual(DateNormalizationUtils.parseISODate("garbage"), {});
});

add_task(function test_formatISODate() {
  Assert.equal(
    DateNormalizationUtils.formatISODate({ year: 2030, month: 5, day: 9 }),
    "2030-05-09",
    "month and day are zero-padded; year is not"
  );
  Assert.equal(
    DateNormalizationUtils.formatISODate({
      year: "2030",
      month: "12",
      day: "31",
    }),
    "2030-12-31"
  );
  Assert.equal(
    DateNormalizationUtils.formatISODate({ year: 2030, month: 5 }),
    "",
    "missing a component yields an empty string"
  );
});

add_task(function test_normalizeComponents_orchestration() {
  const parts = ["month", "day", "year"];

  // All components present: the string is never consulted.
  Assert.deepEqual(
    DateNormalizationUtils.normalizeComponents({
      string: "2099-01-02",
      month: 5,
      day: 1,
      year: 2030,
      parts,
    }),
    { month: 5, day: 1, year: 2030 }
  );

  // A missing component is backfilled from the combined string.
  Assert.deepEqual(
    DateNormalizationUtils.normalizeComponents({
      string: "2030-12-09",
      parts,
    }),
    { month: 12, day: 9, year: 2030 }
  );

  // Out-of-range components are dropped to undefined.
  Assert.deepEqual(
    DateNormalizationUtils.normalizeComponents({
      month: 13,
      day: 40,
      year: -3,
      parts,
    }),
    { month: undefined, day: undefined, year: undefined }
  );
});

add_task(function test_normalizeComponents_parts_subset() {
  // A credit-card-shaped caller requests only month/year; no day is returned.
  const result = DateNormalizationUtils.normalizeComponents({
    month: 5,
    year: "30",
    parts: ["month", "year"],
  });
  Assert.deepEqual(result, { month: 5, year: 2030 });
  Assert.ok(!("day" in result), "day is not included when not requested");
});

add_task(function test_parseMonthYearString() {
  // The parser returns the raw year; the 2-digit shift happens in normalizeYear.
  Assert.deepEqual(DateNormalizationUtils.parseMonthYearString("05/26"), {
    month: 5,
    year: 26,
  });
  Assert.deepEqual(DateNormalizationUtils.parseMonthYearString("2028-09"), {
    month: 9,
    year: 2028,
  });
  Assert.deepEqual(DateNormalizationUtils.parseMonthYearString(" 06 / 27 "), {
    month: 6,
    year: 27,
  });
  Assert.deepEqual(DateNormalizationUtils.parseMonthYearString("nope"), {
    month: undefined,
    year: undefined,
  });
});

add_task(function test_normalizeComponents_parserByParts() {
  // month/year parts (no "day") use the lenient multi-format parser, while
  // day-bearing parts use the strict ISO parser.
  Assert.deepEqual(
    DateNormalizationUtils.normalizeComponents({
      string: "06/27",
      parts: ["month", "year"],
    }),
    { month: 6, year: 2027 }
  );
  Assert.deepEqual(
    DateNormalizationUtils.normalizeComponents({
      string: "2030-05-09",
      parts: ["month", "day", "year"],
    }),
    { month: 5, day: 9, year: 2030 }
  );
});

add_task(function test_normalizeComponents_numericZeroComponent() {
  // A numeric 0 component is falsy, so it counts as missing and the string
  // backfills it (preserving the historical `||` precedence behavior).
  Assert.deepEqual(
    DateNormalizationUtils.normalizeComponents({
      string: "2030-05-09",
      month: 0,
      day: 0,
      year: 0,
      parts: ["month", "day", "year"],
    }),
    { month: 5, day: 9, year: 2030 }
  );
});
