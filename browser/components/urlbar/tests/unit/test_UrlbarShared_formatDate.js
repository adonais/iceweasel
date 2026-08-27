/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests `UrlbarShared.formatDate()` and `parseDate()`.

"use strict";

add_setup(async function init() {
  // This test deals with `Intl` formating of dates and times, which depends on
  // the system locale, and assumes it's en-US. Make sure it's actually en-US.
  await QuickSuggestTestUtils.setRegionAndLocale({
    locale: "en-US",
    skipSuggestReset: true,
  });

  Assert.equal(
    new Intl.Locale(Services.locale.appLocaleAsBCP47).getWeekInfo().firstDay,
    7,
    "Sanity check: First day of week in en-US is 7 (Sunday)"
  );
});

// Main test for `UrlbarShared.formatDate()`.
add_task(async function formatDate() {
  // For each test, we'll set `now`, call `formatDate` with `date` and
  // `options`, and check the return value against `expected`.
  let tests = [
    {
      desc: "> 12 months ago",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2013-05-11T04:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "May 11, 2013",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "12 months ago (most recent possible date)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2024-10-31T23:59:59-07:00",
      cases: [
        {
          expected: {
            formattedDate: "Oct 31, 2024",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "11 months ago (oldest possible date)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2024-11-01T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "11 months ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },

        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Nov 1, 2024",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "5 weeks ago (most recent possible date)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-09-13T23:59:59-07:00",
      cases: [
        {
          expected: {
            formattedDate: "1 month ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Sep 13",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "4 weeks ago (oldest possible date)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-09-14T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "4 weeks ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Sep 14",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "7 days ago",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-08T23:59:59-07:00",
      cases: [
        {
          expected: {
            formattedDate: "1 week ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 8",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "6 days ago",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-09T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "6 days ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 9",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "2 days ago",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-13T23:59:59-07:00",
      cases: [
        {
          expected: {
            formattedDate: "2 days ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 13",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "yesterday",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-14T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "yesterday",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            capitalizeRelativeDate: true,
          },
          expected: {
            formattedDate: "Yesterday",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 14",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "today (past)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-15T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "today",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            capitalizeRelativeDate: true,
          },
          expected: {
            formattedDate: "Today",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 15",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "today (now)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-15T12:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "today",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            capitalizeRelativeDate: true,
          },
          expected: {
            formattedDate: "Today",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 15",
            formattedTime: undefined,
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "today (future)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-15T20:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "today",
            formattedTime: "8:00 PM",
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            capitalizeRelativeDate: true,
            includeTimeZone: true,
          },
          expected: {
            formattedDate: "Today",
            formattedTime: "8:00 PM GMT-7",
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Oct 15",
            formattedTime: "8:00 PM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "tomorrow",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-16T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "tomorrow",
            formattedTime: "12:00 AM",
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            capitalizeRelativeDate: true,
            includeTimeZone: true,
          },
          expected: {
            formattedDate: "Tomorrow",
            formattedTime: "12:00 AM GMT-7",
            isRelative: true,
            dateFormatType:
              UrlbarShared.DATE_FORMAT_TYPE.YESTERDAY_TODAY_TOMORROW,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Thu",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
            forceMonthAndDayWhenAbsolute: true,
          },
          expected: {
            formattedDate: "Oct 16",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "6 days from now",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-21T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "Tue",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            includeTimeZone: true,
          },
          expected: {
            formattedDate: "Tue",
            formattedTime: "12:00 AM GMT-7",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            forceAbsoluteDate: true,
          },
          expected: {
            formattedDate: "Tue",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            forceMonthAndDayWhenAbsolute: true,
          },
          expected: {
            formattedDate: "Oct 21",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "7 days from now",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-22T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "Oct 22",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            includeTimeZone: true,
          },
          expected: {
            formattedDate: "Oct 22",
            formattedTime: "12:00 AM GMT-7",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "last day this year",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-12-31T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "Dec 31",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            includeTimeZone: true,
          },
          expected: {
            formattedDate: "Dec 31",
            formattedTime: "12:00 AM GMT-7",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "first day next year",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2026-01-01T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "Jan 1, 2026",
            formattedTime: "12:00 AM",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
        {
          options: {
            includeTimeZone: true,
          },
          expected: {
            formattedDate: "Jan 1, 2026",
            formattedTime: "12:00 AM GMT-7",
            isRelative: false,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.ABSOLUTE,
          },
        },
      ],
    },

    {
      desc: "> 4 weeks ago but still in same month",
      now: "2025-03-31T12:00:00-07:00[-07:00]",
      date: "2025-03-01T00:00:00-07:00",
      cases: [
        {
          expected: {
            formattedDate: "5 weeks ago",
            formattedTime: undefined,
            isRelative: true,
            dateFormatType: UrlbarShared.DATE_FORMAT_TYPE.DAYS_WEEKS_MONTHS_AGO,
          },
        },
      ],
    },
  ];

  for (let { desc, now, date, cases } of tests) {
    UrlbarTestUtils.stubNowZonedDateTime(now);
    for (let { options, expected } of cases) {
      let actual = UrlbarShared.formatDate(new Date(date), options);

      // There's another task that tests `parseDate()`, so just check that the
      // `parseDateResult` is present rather than its properties.
      Assert.ok(actual.parseDateResult, "parseDateResult should be present");
      delete actual.parseDateResult;

      Assert.deepEqual(
        actual,
        expected,
        "formatDate test: " + JSON.stringify({ desc, now, date, options })
      );
    }
  }
});

// Main test for `UrlbarShared.parseDate()`.
add_task(async function parseDate_main() {
  // For each test, we'll set `now`, call `parseDate` with `date`, and check the
  // return value against `expected`.
  doParseDateTests([
    {
      desc: "far past",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2013-05-11T04:00:00-07:00",
      expected: {
        daysAgo: 4540,
        weeksAgo: 649,
        monthsAgo: 149,
        isFuture: false,
      },
    },

    {
      desc: "the last day of last year",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2024-12-31T12:00:00-07:00",
      expected: {
        daysAgo: 288,
        weeksAgo: 41,
        monthsAgo: 10,
        isFuture: false,
      },
    },

    {
      desc: "the first day of this year",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-01-01T12:00:00-07:00",
      expected: {
        daysAgo: 287,
        weeksAgo: 41,
        monthsAgo: 9,
        isFuture: false,
      },
    },

    {
      desc: "the last day of the month before last",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-08-31T12:00:00-07:00",
      expected: {
        daysAgo: 45,
        weeksAgo: 6,
        monthsAgo: 2,
        isFuture: false,
      },
    },

    {
      desc: "the first day of last month",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-09-01T12:00:00-07:00",
      expected: {
        daysAgo: 44,
        weeksAgo: 6,
        monthsAgo: 1,
        isFuture: false,
      },
    },

    {
      desc: "the last day of last month",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-09-30T12:00:00-07:00",
      expected: {
        daysAgo: 15,
        weeksAgo: 2,
        monthsAgo: 1,
        isFuture: false,
      },
    },

    {
      desc: "the first day of this month",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-01T12:00:00-07:00",
      expected: {
        daysAgo: 14,
        weeksAgo: 2,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the last day of the week before last",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-04T12:00:00-07:00",
      expected: {
        daysAgo: 11,
        weeksAgo: 2,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the first day of last week",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-05T12:00:00-07:00",
      expected: {
        daysAgo: 10,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the last day of last week",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-11T12:00:00-07:00",
      expected: {
        daysAgo: 4,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the first day of this week",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-12T12:00:00-07:00",
      expected: {
        daysAgo: 3,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the day before yesterday",
      now: [
        "2025-10-15T00:00:00-07:00[-07:00]",
        "2025-10-15T23:59:59-07:00[-07:00]",
      ],
      date: ["2025-10-13T00:00:00-07:00", "2025-10-13T23:59:59-07:00"],
      expected: {
        daysAgo: 2,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "yesterday",
      now: [
        "2025-10-15T00:00:00-07:00[-07:00]",
        "2025-10-15T23:59:59-07:00[-07:00]",
      ],
      date: ["2025-10-14T00:00:00-07:00", "2025-10-14T23:59:59-07:00"],
      expected: {
        daysAgo: 1,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "today (past)",
      now: [
        "2025-10-15T12:00:00-07:00[-07:00]",
        "2025-10-15T23:59:59-07:00[-07:00]",
      ],
      date: ["2025-10-15T00:00:00-07:00", "2025-10-15T11:59:59-07:00"],
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "today (now)",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-15T12:00:00-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "today (future)",
      now: [
        "2025-10-15T00:00:00-07:00[-07:00]",
        "2025-10-15T12:00:00-07:00[-07:00]",
      ],
      date: ["2025-10-15T12:00:01-07:00", "2025-10-15T23:59:59-07:00"],
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "tomorrow",
      now: [
        "2025-10-15T00:00:00-07:00[-07:00]",
        "2025-10-15T23:59:59-07:00[-07:00]",
      ],
      date: ["2025-10-16T00:00:00-07:00", "2025-10-16T23:59:59-07:00"],
      expected: {
        daysAgo: -1,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the day after tomorrow",
      now: [
        "2025-10-15T00:00:00-07:00[-07:00]",
        "2025-10-15T23:59:59-07:00[-07:00]",
      ],
      date: ["2025-10-17T00:00:00-07:00", "2025-10-17T23:59:59-07:00"],
      expected: {
        daysAgo: -2,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the last day of this week",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-18T12:00:00-07:00",
      expected: {
        daysAgo: -3,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the first day of next week",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-19T12:00:00-07:00",
      expected: {
        daysAgo: -4,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the last day of next week",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-25T12:00:00-07:00",
      expected: {
        daysAgo: -10,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the first day of the week after next",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-26T12:00:00-07:00",
      expected: {
        daysAgo: -11,
        weeksAgo: -2,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the last day of this month",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-10-31T12:00:00-07:00",
      expected: {
        daysAgo: -16,
        weeksAgo: -2,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the first day of next month",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-11-01T12:00:00-07:00",
      expected: {
        daysAgo: -17,
        weeksAgo: -2,
        monthsAgo: -1,
        isFuture: true,
      },
    },

    {
      desc: "the last day of next month",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-11-30T12:00:00-07:00",
      expected: {
        daysAgo: -46,
        weeksAgo: -7,
        monthsAgo: -1,
        isFuture: true,
      },
    },

    {
      desc: "the first day of the month after next",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-12-01T12:00:00-07:00",
      expected: {
        daysAgo: -47,
        weeksAgo: -7,
        monthsAgo: -2,
        isFuture: true,
      },
    },

    {
      desc: "the last day of this year",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2025-12-31T12:00:00-07:00",
      expected: {
        daysAgo: -77,
        weeksAgo: -11,
        monthsAgo: -2,
        isFuture: true,
      },
    },

    {
      desc: "the first day of next year",
      now: "2025-10-15T12:00:00-07:00[-07:00]",
      date: "2026-01-01T12:00:00-07:00",
      expected: {
        daysAgo: -78,
        weeksAgo: -11,
        monthsAgo: -3,
        isFuture: true,
      },
    },

    {
      desc: "far future",
      now: "2025-10-15T00:00:00-07:00[-07:00]",
      date: "3013-05-11T04:00:00-07:00",
      expected: {
        daysAgo: -360702,
        weeksAgo: -51529,
        monthsAgo: -11851,
        isFuture: true,
      },
    },
  ]);
});

// `UrlbarShared.parseDate()` test where "now" is the first day in a week.
add_task(async function parseDate_nowIsFirstDayInWeek() {
  let now = "2025-10-12T12:00:00-07:00[-07:00]";
  doParseDateTests([
    {
      now,
      desc: "the last day of the week before last",
      date: "2025-10-04T23:59:59-07:00",
      expected: {
        daysAgo: 8,
        weeksAgo: 2,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of last week",
      date: "2025-10-05T00:00:00-07:00",
      expected: {
        daysAgo: 7,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of last week",
      date: "2025-10-11T23:59:59-07:00",
      expected: {
        daysAgo: 1,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of this week",
      date: "2025-10-12T00:00:00-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of this week",
      date: "2025-10-18T23:59:59-07:00",
      expected: {
        daysAgo: -6,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of next week",
      date: "2025-10-19T00:00:00-07:00",
      expected: {
        daysAgo: -7,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the last day of next week",
      date: "2025-10-25T23:59:59-07:00",
      expected: {
        daysAgo: -13,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of the week after next",
      date: "2025-10-26T00:00:00-07:00",
      expected: {
        daysAgo: -14,
        weeksAgo: -2,
        monthsAgo: 0,
        isFuture: true,
      },
    },
  ]);
});

// `UrlbarShared.parseDate()` test where "now" is the last day in a week.
add_task(async function parseDate_nowIsLastDayInWeek() {
  let now = "2025-10-18T12:00:00-07:00[-07:00]";
  doParseDateTests([
    {
      now,
      desc: "the last day of the week before last",
      date: "2025-10-04T23:59:59-07:00",
      expected: {
        daysAgo: 14,
        weeksAgo: 2,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of last week",
      date: "2025-10-05T00:00:00-07:00",
      expected: {
        daysAgo: 13,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of last week",
      date: "2025-10-11T23:59:59-07:00",
      expected: {
        daysAgo: 7,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of this week",
      date: "2025-10-12T00:00:00-07:00",
      expected: {
        daysAgo: 6,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of this week",
      date: "2025-10-18T23:59:59-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of next week",
      date: "2025-10-19T00:00:00-07:00",
      expected: {
        daysAgo: -1,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the last day of next week",
      date: "2025-10-25T23:59:59-07:00",
      expected: {
        daysAgo: -7,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of the week after next",
      date: "2025-10-26T00:00:00-07:00",
      expected: {
        daysAgo: -8,
        weeksAgo: -2,
        monthsAgo: 0,
        isFuture: true,
      },
    },
  ]);
});

// `UrlbarShared.parseDate()` test where "now" is the first day in a month.
add_task(async function parseDate_nowIsFirstDayInMonth() {
  let now = "2025-10-01T12:00:00-07:00[-07:00]";
  doParseDateTests([
    {
      now,
      desc: "the last day of the month before last",
      date: "2025-08-31T23:59:59-07:00",
      expected: {
        daysAgo: 31,
        weeksAgo: 4,
        monthsAgo: 2,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of last month",
      date: "2025-09-01T00:00:00-07:00",
      expected: {
        daysAgo: 30,
        weeksAgo: 4,
        monthsAgo: 1,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of last month",
      date: "2025-09-30T23:59:59-07:00",
      expected: {
        daysAgo: 1,
        weeksAgo: 0,
        monthsAgo: 1,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of this month",
      date: "2025-10-01T00:00:00-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of this month",
      date: "2025-10-31T23:59:59-07:00",
      expected: {
        daysAgo: -30,
        weeksAgo: -4,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of next month",
      date: "2025-11-01T00:00:00-07:00",
      expected: {
        daysAgo: -31,
        weeksAgo: -4,
        monthsAgo: -1,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the last day of next month",
      date: "2025-11-30T23:59:59-07:00",
      expected: {
        daysAgo: -60,
        weeksAgo: -9,
        monthsAgo: -1,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of the month after next",
      date: "2025-12-01T00:00:00-07:00",
      expected: {
        daysAgo: -61,
        weeksAgo: -9,
        monthsAgo: -2,
        isFuture: true,
      },
    },
  ]);
});

// `UrlbarShared.parseDate()` test where "now" is the last day in a month.
add_task(async function parseDate_nowDayInMonth_last() {
  let now = "2025-10-31T12:00:00-07:00[-07:00]";
  doParseDateTests([
    {
      now,
      desc: "the last day of the month before last",
      date: "2025-08-31T23:59:59-07:00",
      expected: {
        daysAgo: 61,
        weeksAgo: 8,
        monthsAgo: 2,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of last month",
      date: "2025-09-01T00:00:00-07:00",
      expected: {
        daysAgo: 60,
        weeksAgo: 8,
        monthsAgo: 1,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of last month",
      date: "2025-09-30T23:59:59-07:00",
      expected: {
        daysAgo: 31,
        weeksAgo: 4,
        monthsAgo: 1,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the first day of this month",
      date: "2025-10-01T00:00:00-07:00",
      expected: {
        daysAgo: 30,
        weeksAgo: 4,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      now,
      desc: "the last day of this month",
      date: "2025-10-31T23:59:59-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of next month",
      date: "2025-11-01T00:00:00-07:00",
      expected: {
        daysAgo: -1,
        weeksAgo: 0,
        monthsAgo: -1,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the last day of next month",
      date: "2025-11-30T23:59:59-07:00",
      expected: {
        daysAgo: -30,
        weeksAgo: -5,
        monthsAgo: -1,
        isFuture: true,
      },
    },

    {
      now,
      desc: "the first day of the month after next",
      date: "2025-12-01T00:00:00-07:00",
      expected: {
        daysAgo: -31,
        weeksAgo: -5,
        monthsAgo: -2,
        isFuture: true,
      },
    },
  ]);
});

// `UrlbarShared.parseDate()` test where the first day of the week is not Sunday
// as it is in en-US.
add_task(async function parseDate_firstDayOfWeek() {
  doParseDateTests([
    {
      desc: "the last day of the week before last",
      now: "2025-10-15T12:00:00-07:00[-07:00]", // Wednesday
      date: "2025-10-05T23:59:59-07:00", // two Sunday's ago
      firstDayOfWeek: 1, // Monday
      expected: {
        daysAgo: 10,
        weeksAgo: 2,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the first day of last week",
      now: "2025-10-15T12:00:00-07:00[-07:00]", // Wednesday
      date: "2025-10-06T00:00:00-07:00", // two Monday's ago
      firstDayOfWeek: 1, // Monday
      expected: {
        daysAgo: 9,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the last day of last week",
      now: "2025-10-15T12:00:00-07:00[-07:00]", // Wednesday
      date: "2025-10-12T23:59:59-07:00", // one Sunday ago
      firstDayOfWeek: 1, // Monday
      expected: {
        daysAgo: 3,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the first day of this week",
      now: "2025-10-15T12:00:00-07:00[-07:00]", // Wednesday
      date: "2025-10-13T00:00:00-07:00", // one Monday ago
      firstDayOfWeek: 1, // Monday
      expected: {
        daysAgo: 2,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    {
      desc: "the last day of this week",
      now: "2025-10-15T12:00:00-07:00[-07:00]", // Wednesday
      date: "2025-10-19T23:59:59-07:00", // one Sunday from now
      firstDayOfWeek: 1, // Monday
      expected: {
        daysAgo: -4,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    {
      desc: "the first day of next week",
      now: "2025-10-15T12:00:00-07:00[-07:00]", // Wednesday
      date: "2025-10-20T00:00:00-07:00", // one Monday from now
      firstDayOfWeek: 1, // Monday
      expected: {
        daysAgo: -5,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },
  ]);
});

// Tests `UrlbarShaared.parseDate()` with dates across time zone changes.
add_task(function parseDate_timeZoneTransition() {
  // This task is based around 2025-11-02, when Daylight Saving Time ends in the
  // U.S. On 2025-11-02 at 2:00 am, the time changes to 1:00 am Standard Time.
  doParseDateTests([
    {
      desc: "`now` and `date` both in PDT (daylight saving)",
      now: "2025-10-02T12:00:00-07:00[America/Los_Angeles]",
      date: "2025-10-01T00:00:00-07:00",
      expected: {
        daysAgo: 1,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    // `now` in PST, `date` in PDT
    {
      desc: "`now` in PST, `date` in PDT -- 1",
      now: "2025-11-03T00:00:00-08:00[America/Los_Angeles]",
      date: "2025-11-01T00:00:00-07:00",
      expected: {
        daysAgo: 2,
        // Nov 3, 2025 is a Monday; Nov 1, 2025 is a Saturday => last week
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },
    {
      desc: "`now` in PST, `date` in PDT -- 2",
      now: "2025-11-02T12:00:00-08:00[America/Los_Angeles]",
      date: "2025-11-01T00:00:00-07:00",
      expected: {
        daysAgo: 1,
        // Nov 2, 2025 is a Sunday; Nov 1, 2025 is a Saturday => last week
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },
    {
      desc: "`now` in PST, `date` in PDT -- 3",
      now: "2025-11-02T01:00:00-08:00[America/Los_Angeles]",
      date: "2025-11-01T00:00:00-07:00",
      expected: {
        daysAgo: 1,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },
    {
      desc: "`now` in PST, `date` in PDT -- 4",
      now: "2025-11-02T23:59:59-08:00[America/Los_Angeles]",
      date: "2025-11-01T00:00:00-07:00",
      expected: {
        daysAgo: 1,
        weeksAgo: 1,
        monthsAgo: 0,
        isFuture: false,
      },
    },
    {
      desc: "`now` in PST, `date` in PDT -- 5",
      now: "2025-11-02T01:00:00-08:00[America/Los_Angeles]",
      date: "2025-11-02T00:00:00-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },
    {
      desc: "`now` in PST, `date` in PDT -- 6",
      now: "2025-11-02T01:00:00-08:00[America/Los_Angeles]",
      date: "2025-11-02T01:00:00-07:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },

    // `now` in PDT, `date` in PST
    {
      desc: "`now` in PDT, `date` in PST -- 1",
      now: "2025-11-02T01:00:00-07:00[America/Los_Angeles]",
      date: "2025-11-02T01:00:00-08:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },
    {
      desc: "`now` in PDT, `date` in PST -- 2",
      now: "2025-11-02T00:00:00-07:00[America/Los_Angeles]",
      date: "2025-11-02T01:00:00-08:00",
      expected: {
        daysAgo: 0,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: true,
      },
    },
    {
      desc: "`now` in PDT, `date` in PST -- 3",
      now: "2025-11-01T00:00:00-07:00[America/Los_Angeles]",
      date: "2025-11-02T23:59:59-08:00",
      expected: {
        daysAgo: -1,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },
    {
      desc: "`now` in PDT, `date` in PST -- 4",
      now: "2025-11-01T00:00:00-07:00[America/Los_Angeles]",
      date: "2025-11-02T01:00:00-08:00",
      expected: {
        daysAgo: -1,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },
    {
      desc: "`now` in PDT, `date` in PST -- 5",
      now: "2025-11-01T00:00:00-07:00[America/Los_Angeles]",
      date: "2025-11-02T12:00:00-08:00",
      expected: {
        daysAgo: -1,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },
    {
      desc: "`now` in PDT, `date` in PST -- 6",
      now: "2025-11-01T00:00:00-07:00[America/Los_Angeles]",
      date: "2025-11-03T00:00:00-08:00",
      expected: {
        daysAgo: -2,
        weeksAgo: -1,
        monthsAgo: 0,
        isFuture: true,
      },
    },

    // `now` and `date` both in PST (standard time)
    {
      desc: "`now` and `date` both in PST (standard time)",
      now: "2025-11-11T12:00:00-08:00[America/Los_Angeles]",
      date: "2025-11-10T00:00:00-08:00",
      expected: {
        daysAgo: 1,
        weeksAgo: 0,
        monthsAgo: 0,
        isFuture: false,
      },
    },
  ]);
});

function doParseDateTests(tests) {
  for (let { desc, now, date, firstDayOfWeek, expected } of tests) {
    UrlbarTestUtils.stubFirstDayOfWeek(firstDayOfWeek);

    let nows = typeof now == "string" ? [now] : now;
    let dates = typeof date == "string" ? [date] : date;
    for (let n of nows) {
      let zonedNow = UrlbarTestUtils.stubNowZonedDateTime(n);
      for (let d of dates) {
        Assert.deepEqual(
          UrlbarShared.parseDate(new Date(d)),
          {
            ...expected,
            zonedNow,
            zonedDate: new Date(d)
              .toTemporalInstant()
              .toZonedDateTimeISO(zonedNow),
          },
          "parseDate test: " + JSON.stringify({ desc, now: n, date: d })
        );
      }
    }

    UrlbarTestUtils.stubFirstDayOfWeek(null);
  }
}
