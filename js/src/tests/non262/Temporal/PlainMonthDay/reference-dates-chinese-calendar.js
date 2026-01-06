// |reftest| skip-if(!this.hasOwnProperty("Temporal"))

const calendar = "chinese";

// The Chinese calendar has 29-30 days per month.
const tests = [
  {
    day: 29,
    leapMonth: false,
    expected: [
      "1972-03-14[u-ca=chinese]",
      "1972-04-12[u-ca=chinese]",
      "1972-05-12[u-ca=chinese]",
      "1972-06-10[u-ca=chinese]",
      "1972-07-09[u-ca=chinese]",
      "1972-08-08[u-ca=chinese]",
      "1972-09-06[u-ca=chinese]",
      "1972-10-06[u-ca=chinese]",
      "1972-11-04[u-ca=chinese]",
      "1972-12-04[u-ca=chinese]",
      "1972-01-15[u-ca=chinese]",
      "1972-02-13[u-ca=chinese]",
    ],
  },
  {
    day: 29,
    leapMonth: true,
    expected: [
      "1651-03-20[u-ca=chinese]",
      "1947-04-20[u-ca=chinese]",
      "1966-05-19[u-ca=chinese]",
      "1963-06-20[u-ca=chinese]",
      "1971-07-21[u-ca=chinese]",
      "1960-08-21[u-ca=chinese]",
      "1968-09-21[u-ca=chinese]",
      "1957-10-22[u-ca=chinese]",
      "2014-11-21[u-ca=chinese]",
      "1984-12-21[u-ca=chinese]",
      "2034-01-19[u-ca=chinese]",
      "1404-02-19[u-ca=chinese]",
    ],
  },
  {
    day: 30,
    leapMonth: false,
    expected: [
      "1970-03-07[u-ca=chinese]",
      "1972-04-13[u-ca=chinese]",
      "1966-04-20[u-ca=chinese]",
      "1970-06-03[u-ca=chinese]",
      "1972-07-10[u-ca=chinese]",
      "1971-08-20[u-ca=chinese]",
      "1972-09-07[u-ca=chinese]",
      "1971-10-18[u-ca=chinese]",
      "1972-11-05[u-ca=chinese]",
      "1972-12-05[u-ca=chinese]",
      "1970-01-07[u-ca=chinese]",
      "1972-02-14[u-ca=chinese]",
    ],
  },
  {
    day: 30,
    leapMonth: true,
    expected: [
      "1461-03-20[u-ca=chinese]",
      "1765-04-19[u-ca=chinese]",
      "1955-05-21[u-ca=chinese]",
      "1944-06-20[u-ca=chinese]",
      "1952-07-21[u-ca=chinese]",
      "1941-08-22[u-ca=chinese]",
      "1938-09-23[u-ca=chinese]",
      "1718-10-23[u-ca=chinese]",
      "-005738-11-17[u-ca=chinese]",
      "-004098-12-19[u-ca=chinese]",
      "-002172-01-19[u-ca=chinese]",
      "-000179-02-18[u-ca=chinese]",
    ],
  },
];

for (let {day, leapMonth, expected} of tests) {
  assertEq(expected.length, 12);

  for (let i = 1; i <= 12; ++i) {
    let expectedToString = expected[i - 1];

    // Skip over dates which are too far into the past (and therefore are likely
    // incorrect anyway). This avoids slowing down this test.
    if (expectedToString.startsWith("-")) {
      continue;
    }

    let monthCode = "M" + String(i).padStart(2, "0") + (leapMonth ? "L" : "");

    let pmd = Temporal.PlainMonthDay.from({calendar, monthCode, day});
    assertEq(pmd.monthCode, monthCode);
    assertEq(pmd.day, day);
    assertEq(pmd.toString(), expectedToString);
  }
}

if (typeof reportCompare === "function")
  reportCompare(true, true);
