/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test that security codes are only captured when the feature has been rolled
 * out to the user and the user has not declined it.
 */

"use strict";

const { FormAutofill } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofill.sys.mjs"
);

const SUPPORTED_PREF = "extensions.formautofill.creditCards.cvv.supported";
const ENABLED_PREF = "extensions.formautofill.creditCards.cvv.enabled";

const TESTCASES = [
  {
    description: "Rolled out, and the user has not declined",
    supported: "on",
    enabled: true,
    expectedSupported: true,
    expectedEnabled: true,
  },
  {
    description: "Rolled out, but the user declined",
    supported: "on",
    enabled: false,
    expectedSupported: true,
    expectedEnabled: false,
  },
  {
    description: "Not rolled out, even though the user has not declined",
    supported: "off",
    enabled: true,
    expectedSupported: false,
    expectedEnabled: false,
  },
  {
    description: "Neither rolled out nor wanted",
    supported: "off",
    enabled: false,
    expectedSupported: false,
    expectedEnabled: false,
  },
  {
    // Unlike the address and credit card supported prefs, the CVV rollout is
    // per user rather than regional, so only "on" opts a user in.
    description: 'Any value other than "on" is not a rollout',
    supported: "detect",
    enabled: true,
    expectedSupported: false,
    expectedEnabled: false,
  },
];

add_task(async function test_defaultTestEnvironment() {
  Assert.equal(
    Services.prefs.getCharPref(SUPPORTED_PREF),
    "off",
    "The feature is not rolled out by default"
  );
  Assert.ok(
    !FormAutofill.isAutofillCreditCardCVVEnabled,
    "So security codes are not captured by default, whatever the user pref says"
  );
});

add_task(async function test_cvv_prefs() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(SUPPORTED_PREF);
    Services.prefs.clearUserPref(ENABLED_PREF);
  });

  for (const testcase of TESTCASES) {
    info(`Starting testcase: ${testcase.description}`);
    Services.prefs.setCharPref(SUPPORTED_PREF, testcase.supported);
    Services.prefs.setBoolPref(ENABLED_PREF, testcase.enabled);

    Assert.equal(
      FormAutofill.isAutofillCreditCardCVVSupported,
      testcase.expectedSupported,
      `isAutofillCreditCardCVVSupported with supported=${testcase.supported}`
    );
    Assert.equal(
      FormAutofill.isAutofillCreditCardCVVEnabled,
      testcase.expectedEnabled,
      `isAutofillCreditCardCVVEnabled with supported=${testcase.supported}, enabled=${testcase.enabled}`
    );
  }
});
