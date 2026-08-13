/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

/* global add_heuristic_tests */

"use strict";

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
    description:
      "Passport fields are detected from element attributes (id/name)",
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <input type="text" id="passport-name"/>
            <input type="text" id="passport-country"/>
            <input type="text" id="passport-number"/>
          </form>
        </body>
        </html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-name" },
          { fieldName: "passport-country" },
          { fieldName: "passport-number" },
        ],
      },
    ],
  },
  {
    description:
      "Passport fields are detected from labels, exercising the regex alternatives",
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <label>Name on passport <input type="text" id="pp-1"/></label>
            <label>Passport No. <input type="text" id="pp-2"/></label>
            <label>Place of issue <input type="text" id="pp-3"/></label>
          </form>
        </body>
        </html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-name" },
          { fieldName: "passport-number" },
          { fieldName: "passport-country" },
        ],
      },
    ],
  },
  {
    description:
      "Passport issue and expiry dates split into month/day/year are detected",
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <input type="text" id="passport-number"/>
            <input type="text" id="passport-issue-date-month"/>
            <input type="text" id="passport-issue-date-day"/>
            <input type="text" id="passport-issue-date-year"/>
            <input type="text" id="passport-expiry-date-month"/>
            <input type="text" id="passport-expiry-date-day"/>
            <input type="text" id="passport-expiry-date-year"/>
          </form>
        </body>
        </html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-number" },
          { fieldName: "passport-issue-date-month" },
          { fieldName: "passport-issue-date-day" },
          { fieldName: "passport-issue-date-year" },
          { fieldName: "passport-expiry-date-month" },
          { fieldName: "passport-expiry-date-day" },
          { fieldName: "passport-expiry-date-year" },
        ],
      },
    ],
  },
  {
    description: "Single combined issue/expiry date fields are detected",
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <input type="text" id="passport-number"/>
            <label>Date of issue <input type="text" id="pp-issue"/></label>
            <label>Passport expiry date <input type="text" id="pp-expiry"/></label>
          </form>
        </body>
        </html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-number" },
          { fieldName: "passport-issue-date" },
          { fieldName: "passport-expiry-date" },
        ],
      },
    ],
  },
  {
    description:
      "Passport name split into given/additional/family parts is detected from attributes",
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <input type="text" id="passport-number"/>
            <input type="text" id="passport-given-name"/>
            <input type="text" id="passport-additional-name"/>
            <input type="text" id="passport-family-name"/>
          </form>
        </body>
        </html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-number" },
          { fieldName: "passport-given-name" },
          { fieldName: "passport-additional-name" },
          { fieldName: "passport-family-name" },
        ],
      },
    ],
  },
  {
    description: "Passport split name fields are detected from labels",
    prefs: [[PASSPORT_SUPPORTED_PREF, "on"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <label>Passport No. <input type="text" id="pp-num"/></label>
            <label>Passport first name <input type="text" id="pp-first"/></label>
            <label>Passport middle name <input type="text" id="pp-middle"/></label>
            <label>Passport surname <input type="text" id="pp-last"/></label>
          </form>
        </body>
        </html>
      `,
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "passport-number" },
          { fieldName: "passport-given-name" },
          { fieldName: "passport-additional-name" },
          { fieldName: "passport-family-name" },
        ],
      },
    ],
  },
  {
    description:
      "Passport fields are not detected when passport autofill is unavailable",
    prefs: [[PASSPORT_SUPPORTED_PREF, "off"]],
    fixtureData: `
        <html>
        <body>
          <form>
            <input type="text" id="passport-number"/>
          </form>
        </body>
        </html>
      `,
    // With passports unavailable, _inferPassportField is skipped and the field
    // matches no other heuristic, so no section is created.
    expectedResult: [],
  },
]);
