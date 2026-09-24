/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const CVV_PREF = "extensions.formautofill.creditCards.cvv.enabled";

function getSecurityCodeField(win) {
  return win.document.querySelector("#cc-csc");
}

add_setup(async function () {
  let { formAutofillStorage } = ChromeUtils.importESModule(
    "resource://autofill/FormAutofillStorage.sys.mjs"
  );
  await formAutofillStorage.initialize();
});

add_task(async function test_securityCodeAbsentWhenPrefDisabled() {
  await SpecialPowers.pushPrefEnv({ set: [[CVV_PREF, false]] });

  await testDialog(EDIT_CREDIT_CARD_DIALOG_URL, win => {
    ok(
      !getSecurityCodeField(win),
      "The security code field is taken out of the form"
    );
    ok(
      win.document.querySelector("#cc-csc-container").hidden,
      "The security code container stays hidden"
    );
    win.document.querySelector("#cancel").click();
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_securityCodeShownWhenPrefEnabled() {
  await SpecialPowers.pushPrefEnv({ set: [[CVV_PREF, true]] });

  await testDialog(EDIT_CREDIT_CARD_DIALOG_URL, async win => {
    let field = getSecurityCodeField(win);
    ok(field, "The security code field is in the form");
    ok(
      !win.document.querySelector("#cc-csc-container").hidden,
      "The security code container is shown"
    );
    await field.updateComplete;
    win.document.querySelector("#cancel").click();
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_savedSecurityCodeIsShown() {
  await SpecialPowers.pushPrefEnv({ set: [[CVV_PREF, true]] });

  const record = Object.assign({}, TEST_CREDIT_CARD_1, {
    guid: "saved-security-code",
    "cc-csc": "123",
  });

  await testDialog(
    EDIT_CREDIT_CARD_DIALOG_URL,
    async win => {
      let field = getSecurityCodeField(win);
      await field.updateComplete;
      is(field.value, "123", "The saved security code is shown");
      is(
        field.inputEl.value,
        "123",
        "The value reaches the inner input so it is editable"
      );
      win.document.querySelector("#cancel").click();
    },
    { record }
  );

  await SpecialPowers.popPrefEnv();
});
