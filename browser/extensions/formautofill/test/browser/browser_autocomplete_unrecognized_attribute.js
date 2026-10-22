/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* global add_autofill_heuristic_tests */

const SUPPRESS_PREF =
  "extensions.formautofill.suppressUnrecognizedAutocomplete.enabled";

const TEST_PROFILE = {
  organization: "Mozilla",
  "street-address": "32 Vassar Street\nMIT Room 32-G524",
  "address-level2": "Cambridge",
  "address-level1": "MA",
  "postal-code": "02139",
  country: "US",
};

// Every autofill field name the HTML spec defines, plus the modifier
// combinations it allows. Autofill only fills a handful of these, but a site
// using any of them is describing its form, not opting out, so none of them may
// be read as a suppression signal. Kept in the order of the platform's own
// table (dom/base/AutocompleteFieldList.h) so a token the spec gains and Gecko
// has not implemented yet shows up here as a failure.
const VALID_AUTOCOMPLETE_VALUES = [
  "name",
  "honorific-prefix",
  "given-name",
  "additional-name",
  "family-name",
  "honorific-suffix",
  "nickname",
  "organization-title",
  // A site naming these is talking to the password manager.
  "username",
  "new-password",
  "current-password",
  "one-time-code",
  "organization",
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level4",
  "address-level3",
  "address-level2",
  "address-level1",
  "country",
  "country-name",
  "postal-code",
  "cc-name",
  "cc-given-name",
  "cc-additional-name",
  "cc-family-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "transaction-currency",
  "transaction-amount",
  "language",
  "bday",
  "bday-day",
  "bday-month",
  "bday-year",
  "sex",
  "url",
  "photo",
  "tel",
  "tel-country-code",
  "tel-national",
  "tel-area-code",
  "tel-local",
  "tel-local-prefix",
  "tel-local-suffix",
  "tel-extension",
  "email",
  "impp",
  "webauthn",
  // Bug 1754879: neither of these is an opt-out signal either.
  "on",
  "off",
  // A field name may carry a section token, an address hint and a contact hint.
  "shipping street-address",
  "billing address-level2",
  "section-blue address-level1",
  "section-blue shipping postal-code",
  "home tel",
  "work email",
  "mobile tel-national",
  "fax tel",
  "pager tel",
  "billing mobile tel",
  // Tokens match case-insensitively and split on any run of whitespace.
  "  BILLing   MoBiLE   tEl  ",
];

// Values the parser rejects, leaving getAutocompleteInfo() with an empty field
// name. That is the signal the feature reads as "this site does not want
// autofill here".
const INVALID_AUTOCOMPLETE_VALUES = [
  "foobar",
  "none",
  "shopify checkout",
  // The right tokens in the wrong order.
  "street-address shipping",
  // section-* has to come first.
  "name section-blue",
  // A contact hint on a field name that is not a contact field.
  "home address-level2",
  // webauthn has to come last.
  "webauthn username",
];

// These do not parse either, but honouring them would amount to respecting
// autocomplete=off through a side door (Bug 1754879).
const IGNORED_INVALID_AUTOCOMPLETE_VALUES = ["off something", "on something"];

function formWithAutocompleteValues(values) {
  const inputs = values
    .map(
      (value, index) => `<input id="field-${index}" autocomplete="${value}">`
    )
    .join("\n    ");
  return `<form>\n    ${inputs}\n  </form>`;
}

/**
 * Open a form carrying one input per value and hand each (index, value) pair to
 * `check` in the content process, alongside the element, its parsed
 * autocomplete info and FormAutofillUtils.
 *
 * @param {Array<string>} values Autocomplete attribute values, one per input.
 * @param {boolean} expectSuppressed
 *        Whether hasUnrecognizedAutocomplete() should report each value as an
 *        opt-out.
 * @param {boolean} expectParses
 *        Whether getAutocompleteInfo() should resolve each value to a field
 *        name.
 */
async function checkAutocompleteValues(values, expectSuppressed, expectParses) {
  const url =
    TOP_LEVEL_HOST +
    `/document-builder.sjs?html=${encodeURIComponent(
      formWithAutocompleteValues(values)
    )}`;

  await BrowserTestUtils.withNewTab(url, async browser => {
    await SpecialPowers.spawn(
      browser,
      [values, expectSuppressed, expectParses],
      (vals, suppressed, parses) => {
        const { FormAutofillUtils } = ChromeUtils.importESModule(
          "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
        );

        vals.forEach((value, index) => {
          const element = content.document.getElementById(`field-${index}`);
          const info = element.getAutocompleteInfo();

          Assert.equal(
            !!info?.fieldName,
            parses,
            `autocomplete="${value}" ${
              parses ? "resolves to" : "does not resolve to"
            } a field name`
          );
          Assert.equal(
            FormAutofillUtils.hasUnrecognizedAutocomplete(element, info),
            suppressed,
            `autocomplete="${value}" is ${
              suppressed ? "" : "not "
            }treated as an opt-out`
          );
        });
      }
    );
  });
}

add_task(async function test_spec_values_are_never_an_opt_out() {
  await checkAutocompleteValues(VALID_AUTOCOMPLETE_VALUES, false, true);
});

add_task(async function test_unparseable_values_are_an_opt_out() {
  await checkAutocompleteValues(INVALID_AUTOCOMPLETE_VALUES, true, false);
});

add_task(async function test_off_and_on_are_never_an_opt_out() {
  await checkAutocompleteValues(
    IGNORED_INVALID_AUTOCOMPLETE_VALUES,
    false,
    false
  );
});

// The street address carries a value the autocomplete parser cannot resolve to
// a field name. Every other field uses a valid value and must be unaffected,
// except organization, which guards that autocomplete=off is still ignored
// (Bug 1754879).
const UNRECOGNIZED_FORM = `
  <form>
    <input id="street-address" name="street-address" autocomplete="invalid checkout">
    <input id="address-level2" name="address-level2" autocomplete="address-level2">
    <input id="address-level1" name="address-level1" autocomplete="address-level1">
    <input id="postal-code" name="postal-code" autocomplete="postal-code">
    <input id="country" name="country" autocomplete="country">
    <input id="organization" name="organization" autocomplete="off">
  </form>`;

// Mirrors real dynamic sites (e.g. Shopify) that swap a valid autocomplete
// value for an unrecognized one. Identification is lazy - it runs on first
// focus - so the replaced value is the one detection sees.
const DYNAMIC_FORM = `
  <form>
    <input id="street-address" name="street-address" autocomplete="street-address">
    <input id="address-level2" name="address-level2" autocomplete="address-level2">
    <input id="address-level1" name="address-level1" autocomplete="address-level1">
    <input id="postal-code" name="postal-code" autocomplete="postal-code">
    <input id="country" name="country" autocomplete="country">
    <input id="organization" name="organization" autocomplete="off">
  </form>
  <script>
    document
      .getElementById("street-address")
      .setAttribute("autocomplete", "none");
  </script>`;

// Every field name carries a valid address hint, so all of them stay in one
// shipping section.
const MODIFIER_FORM = `
  <form>
    <input id="street-address" autocomplete="shipping street-address">
    <input id="address-level2" autocomplete="shipping address-level2">
    <input id="address-level1" autocomplete="shipping address-level1">
    <input id="postal-code" autocomplete="shipping postal-code">
    <input id="country" autocomplete="shipping country">
  </form>`;

// `city` carries an autocomplete value that parses but that autofill leaves to
// the heuristics, which name the field from its `city` attribute instead.
function fallbackForm(cityAutocompleteValue) {
  return `
  <form>
    <input id="street-address" name="street-address" autocomplete="street-address">
    <input id="city" name="city" autocomplete="${cityAutocompleteValue}">
    <input id="address-level1" name="address-level1" autocomplete="address-level1">
    <input id="postal-code" name="postal-code" autocomplete="postal-code">
    <input id="country" name="country" autocomplete="country">
  </form>`;
}

const FALLBACK_FIELDS = [
  {
    fieldName: "street-address",
    autofill: TEST_PROFILE["street-address"].replace("\n", " "),
  },
  {
    fieldName: "address-level2",
    reason: "regex-heuristic",
    autofill: TEST_PROFILE["address-level2"],
  },
  { fieldName: "address-level1", autofill: "Massachusetts" },
  { fieldName: "postal-code", autofill: TEST_PROFILE["postal-code"] },
  { fieldName: "country", autofill: TEST_PROFILE.country },
];

// The fields that remain once the street address is left out of autofill.
const REMAINING_FIELDS = [
  { fieldName: "address-level2", autofill: TEST_PROFILE["address-level2"] },
  // Autofill expands a US state code into the full name for a text input.
  { fieldName: "address-level1", autofill: "Massachusetts" },
  { fieldName: "postal-code", autofill: TEST_PROFILE["postal-code"] },
  { fieldName: "country", autofill: TEST_PROFILE.country },
  {
    fieldName: "organization",
    reason: "regex-heuristic",
    autofill: TEST_PROFILE.organization,
  },
];

add_autofill_heuristic_tests([
  {
    description:
      "With the pref off, a field with an unrecognized autocomplete value is still classified and filled",
    prefs: [[SUPPRESS_PREF, false]],
    fixtureData: UNRECOGNIZED_FORM,
    profile: TEST_PROFILE,
    expectedResult: [
      {
        fields: [
          {
            fieldName: "street-address",
            reason: "regex-heuristic",
            autofill: TEST_PROFILE["street-address"].replace("\n", " "),
          },
          ...REMAINING_FIELDS,
        ],
      },
    ],
  },
  {
    // Being absent from the section is what withholds the dropdown and keeps
    // the field out of a fill triggered from one of its siblings.
    description:
      "With the pref on, a field with an unrecognized autocomplete value is left out of the section",
    prefs: [[SUPPRESS_PREF, true]],
    fixtureData: UNRECOGNIZED_FORM,
    profile: TEST_PROFILE,
    autofillTrigger: "#address-level2",
    expectedResult: [{ fields: REMAINING_FIELDS }],
  },
  {
    description:
      "A valid autocomplete value replaced with an unrecognized one before identification is also left out",
    prefs: [[SUPPRESS_PREF, true]],
    fixtureData: DYNAMIC_FORM,
    profile: TEST_PROFILE,
    autofillTrigger: "#address-level2",
    expectedResult: [{ fields: REMAINING_FIELDS }],
  },
  {
    description:
      "A field name carrying a valid address hint keeps its autocomplete classification",
    prefs: [[SUPPRESS_PREF, true]],
    fixtureData: MODIFIER_FORM,
    profile: TEST_PROFILE,
    expectedResult: [
      {
        default: { reason: "autocomplete", addressType: "shipping" },
        fields: [
          {
            fieldName: "street-address",
            autofill: TEST_PROFILE["street-address"].replace("\n", " "),
          },
          { fieldName: "address-level2", autofill: "Cambridge" },
          { fieldName: "address-level1", autofill: "Massachusetts" },
          { fieldName: "postal-code", autofill: TEST_PROFILE["postal-code"] },
          { fieldName: "country", autofill: TEST_PROFILE.country },
        ],
      },
    ],
  },
  {
    // address-level4 is the only entry in FormAutofillUtils
    // _unsupportedFieldNameInfo, which makes it the only field name that skips
    // inferFieldInfo's autocomplete early return and reaches the suppression
    // branch. Suppressing it would drop the field instead of letting the
    // heuristics name it from `city`.
    description:
      "A valid field name autofill does not support still falls back to the heuristics",
    prefs: [[SUPPRESS_PREF, true]],
    fixtureData: fallbackForm("address-level4"),
    profile: TEST_PROFILE,
    expectedResult: [{ fields: FALLBACK_FIELDS }],
  },
  {
    // "on" takes the same path, for the same reason.
    description: 'autocomplete="on" also falls back to the heuristics',
    prefs: [[SUPPRESS_PREF, true]],
    fixtureData: fallbackForm("on"),
    profile: TEST_PROFILE,
    expectedResult: [{ fields: FALLBACK_FIELDS }],
  },
  {
    // The tokens are real but the order is not one the spec allows, so the
    // value does not parse and the field is treated as an opt-out -- even
    // though an author writing this probably meant "shipping street-address".
    description:
      "A field name and address hint in the wrong order is left out of the section",
    prefs: [[SUPPRESS_PREF, true]],
    fixtureData: UNRECOGNIZED_FORM.replace(
      'autocomplete="invalid checkout"',
      'autocomplete="street-address shipping"'
    ),
    profile: TEST_PROFILE,
    autofillTrigger: "#address-level2",
    expectedResult: [{ fields: REMAINING_FIELDS }],
  },
]);
