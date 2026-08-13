/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

/* global add_heuristic_tests */

"use strict";

// A passport section is valid when it contains the passport number (see
// FormAutofillPassportSection.isValidSection).

const PASSPORT_SUPPORTED_PREF = "extensions.formautofill.passports.supported";

// The passports.supported pref has no default, so register one on the default
// branch here; otherwise the per-test "on" overrides would not propagate to the
// content process where field detection runs.
add_setup(async () => {
  Services.prefs
    .getDefaultBranch("")
    .setStringPref(PASSPORT_SUPPORTED_PREF, "off");
});

add_heuristic_tests([
  {
    description: `A passport section is valid when it has the passport number`,
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html><body>
            <input id="passport-number">
            <input id="passport-name">
        </body></html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-number" },
          { fieldName: "passport-name" },
        ],
      },
    ],
  },
  {
    description: `A passport section is valid when it only has the passport number`,
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html><body>
            <input id="passport-number">
        </body></html>
      `,
    expectedResult: [
      {
        description: "A section with only the passport number",
        fields: [{ fieldName: "passport-number", reason: "regex-heuristic" }],
      },
    ],
  },
  {
    description: `A passport section is invalid when it has no passport number`,
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html><body>
            <input id="passport-name">
            <input id="passport-country">
        </body></html>
      `,
    expectedResult: [
      {
        description: "A section with two passport fields but no number",
        invalid: true,
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-name" },
          { fieldName: "passport-country" },
        ],
      },
    ],
  },
]);
