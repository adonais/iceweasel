// SKIP test262 export
// Behavior is not currently specified.

const tests = [
  // ==== Date only ====

  // dd-MMM-yyyy
  ["24-Apr-2023", "2023-04-24T00:00:00"],
  ["24-apr-2023", "2023-04-24T00:00:00"],
  ["24-April-2023", "2023-04-24T00:00:00"],
  ["24-APRIL-2023", "2023-04-24T00:00:00"],
  ["24-Apr-2033", "2033-04-24T00:00:00"],

  // dd-MMM-yy
  ["24-Apr-23", "2023-04-24T00:00:00"],
  ["24-Apr-33", "2033-04-24T00:00:00"],

  // dd-MMM-yyy
  ["24-Apr-023", "2023-04-24T00:00:00"],

  // MMM-dd-yyyy
  ["Apr-24-2023", "2023-04-24T00:00:00"],
  ["apr-24-2023", "2023-04-24T00:00:00"],
  ["April-24-2023", "2023-04-24T00:00:00"],
  ["APRIL-24-2023", "2023-04-24T00:00:00"],
  ["Apr-24-2033", "2033-04-24T00:00:00"],

  // Year should get fixed up even with leading 0s
  ["Apr-24-23", "2023-04-24T00:00:00"],
  ["Apr-24-0023", "2023-04-24T00:00:00"],
  ["24-Apr-0023", "2023-04-24T00:00:00"],
  ["24-Apr-00023", "2023-04-24T00:00:00"],
  ["24-Apr-000023", "2023-04-24T00:00:00"],

  // MMM-dd-yy
  ["Apr-24-23", "2023-04-24T00:00:00"],
  ["Apr-24-33", "2033-04-24T00:00:00"],

  // MMM-dd-yyy
  ["Apr-24-023", "2023-04-24T00:00:00"],

  // yyyy-MM-dd
  ["2023-Apr-24", "2023-04-24T00:00:00"],
  ["2033-Apr-24", "2033-04-24T00:00:00"],

  // yy-MM-dd
  ["33-Apr-24", "2033-04-24T00:00:00"],

  // yyy-MM-dd
  ["033-Apr-24", "2033-04-24T00:00:00"],

  // ==== Date followed by hour and TZ ====

  ["24-Apr-2023 12:34:56", "2023-04-24T12:34:56"],
  ["24-Apr-2023 (Mon) 12:34:56", "2023-04-24T12:34:56"],
  ["24-Apr-2023(Mon)12:34:56", "2023-04-24T12:34:56"],

  ["24-Apr-2023,12:34:56", "2023-04-24T12:34:56"],

  ["24-Apr-2023 12:34:56 GMT", "2023-04-24T12:34:56Z"],
  ["24-Apr-2023 12:34:56 +04", "2023-04-24T12:34:56+04:00"],
  ["24-Apr-2023 12:34:56 +04:30", "2023-04-24T12:34:56+04:30"],
  ["24-Apr-2023 12:34:56 -04", "2023-04-24T12:34:56-04:00"],
  ["24-Apr-2023 12:34:56 -04:30", "2023-04-24T12:34:56-04:30"],

  ["24-Apr-2023 GMT", "2023-04-24T00:00:00Z"],
  ["24-Apr-2023GMT", "2023-04-24T00:00:00Z"],
  ["24-Apr-2023GMT-04", "2023-04-24T00:00:00-04:00"],
  ["24-Apr-2023GMT-04:30", "2023-04-24T00:00:00-04:30"],
  ["24-Apr-2023GMT+04", "2023-04-24T00:00:00+04:00"],
  ["24-Apr-2023GMT+04:30", "2023-04-24T00:00:00+04:30"],

  ["24-Apr-2023,GMT", "2023-04-24T00:00:00Z"],
  ["24-Apr-2023/GMT", "2023-04-24T00:00:00Z"],

  ["24-Apr-2023/12:34:56", "2023-04-24T12:34:56"],

  ["Apr-24-2023 12:34:56", "2023-04-24T12:34:56"],
  ["Apr-24-2023 12:34:56 GMT", "2023-04-24T12:34:56Z"],
  ["Apr-24-2023 12:34:56 +04", "2023-04-24T12:34:56+04:00"],
  ["Apr-24-2023 12:34:56 +04:30", "2023-04-24T12:34:56+04:30"],

  // ==== non dd-MMM-yyyy. Uses fallback path ====

  // Extra delimiter.
  ["24-Apr- 2023", "2023-04-24T00:00:00"],
  ["24-Apr -2023", "-002023-04-24T00:00:00"],
  ["24- Apr-2023", "-002023-04-24T00:00:00"],
  ["24 -Apr-2023", "-002023-04-24T00:00:00"],

  ["24-Apr-/2023", "2023-04-24T00:00:00"],
  ["24-Apr/-2023", "-002023-04-24T00:00:00"],
  ["24-/Apr-2023", "-002023-04-24T00:00:00"],
  ["24/-Apr-2023", "-002023-04-24T00:00:00"],

  ["24-Apr-()2023", "2023-04-24T00:00:00"],
  ["24-Apr()-2023", "-002023-04-24T00:00:00"],
  ["24-()Apr-2023", "-002023-04-24T00:00:00"],
  ["24()-Apr-2023", "-002023-04-24T00:00:00"],

  // mday being 3+ digits
  ["024-Apr-2023", "-002023-04-24T00:00:00"],
  ["0024-Apr-2023", "-002023-04-24T00:00:00"],

  // year w/ 5 or 6 digits
  ["24-Apr-10000", "+010000-04-24T00:00:00"],
  ["24-Apr-10000 10:00", "+010000-04-24T10:00:00"],
  ["24-Apr-275760", "+275760-04-24T00:00:00"],

  // Delimiter other than space after prefix
  ["24-Apr-2312.10:13:14", "2312-04-24T10:13:14"],
  ["24-Apr-2312,10:13:14", "2312-04-24T10:13:14"],
  ["24-Apr-2312-10:13:14", "2312-04-24T10:13:14"],
  ["24-Apr-2312-04:30", "2312-04-24T04:30:00"],
  ["24-Apr-2312/10:13:14", "2312-04-24T10:13:14"],
  ["24-Apr-2312()10:13:14", "2312-04-24T10:13:14"],
  // Open paren only comments out the time
  ["24-Apr-2312(10:13:14", "2312-04-24T00:00:00"],

  // mday being 3+ digits, while year being 2-3 digits.
  ["024-Apr-23", "2023-04-24T00:00:00"],
  ["024-Apr-023", "2023-04-24T00:00:00"],
];

for (const [testString, isoString] of tests) {
  const testDate = new Date(testString);
  const isoDate = new Date(isoString);

  assertEq(testDate.getTime(), isoDate.getTime(),
           testString);
}

const invalidTests = [
  // mday being out of range.
  "32-01-32",

  // Duplicate date.
  "2012-Apr-08 12/12/12",

  // > TimeClip limit
  "13-Sep-275760 00:00:01 GMT",

  // Rejected delimiters after prefix
  "24-Apr-2312T10:13:14",
  "24-Apr-2312:10:13:14",
  "24-Apr-2312^10:13:14",
  "24-Apr-2312|10:13:14",
  "24-Apr-2312~10:13:14",
  "24-Apr-2312+10:13:14",
  "24-Apr-2312=10:13:14",
  "24-Apr-2312?10:13:14",

  // Late weekday
  "24-Apr-2023 Mon 12:34:56",
  "24-Apr-2023,Mon 12:34:56",
];

for (const testString of invalidTests) {
  assertEq(Number.isNaN(new Date(testString).getTime()), true, testString);
}

if (typeof reportCompare === "function")
    reportCompare(true, true);
