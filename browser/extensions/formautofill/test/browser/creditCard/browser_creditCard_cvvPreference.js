"use strict";

const CVV_SUPPORTED_PREF = "extensions.formautofill.creditCards.cvv.supported";
const CVV_ENABLED_PREF = "extensions.formautofill.creditCards.cvv.enabled";

async function withPaymentsPane(callback) {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#passwordsAutofill" },
    async browser => {
      let doc = browser.contentDocument;
      let settingControl = await TestUtils.waitForCondition(
        () => doc.getElementById("setting-control-saveSecurityCodes"),
        "Waiting for the security codes setting to be rendered"
      );
      await callback({ browser, doc, settingControl });
    }
  );
}

add_setup(async function () {
  // The security code is supported only while the Rust store serves.
  await switchCreditCardStore({ rust: true });
});

add_task(async function test_hidden_when_not_supported() {
  await SpecialPowers.pushPrefEnv({ set: [[CVV_SUPPORTED_PREF, "off"]] });

  await withPaymentsPane(async ({ settingControl }) => {
    ok(settingControl.hidden, "Security codes checkbox should be hidden");
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_hidden_while_json_store_serves() {
  await switchCreditCardStore({ rust: false });
  await SpecialPowers.pushPrefEnv({
    set: [
      [CVV_SUPPORTED_PREF, "on"],
      [CVV_ENABLED_PREF, true],
    ],
  });

  await withPaymentsPane(async ({ settingControl }) => {
    ok(settingControl.hidden, "Security codes checkbox should be hidden");
  });

  await SpecialPowers.popPrefEnv();
  await switchCreditCardStore({ rust: true });
});

add_task(async function test_reflects_pref_when_supported() {
  for (let enabled of [true, false]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        [CVV_SUPPORTED_PREF, "on"],
        [CVV_ENABLED_PREF, enabled],
      ],
    });

    await withPaymentsPane(async ({ doc, settingControl }) => {
      ok(!settingControl.hidden, "Security codes checkbox should be visible");
      is(
        doc.getElementById("saveSecurityCodes").checked,
        enabled,
        `Security codes checkbox should be ${enabled ? "checked" : "unchecked"}`
      );
    });

    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_toggle_updates_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CVV_SUPPORTED_PREF, "on"],
      [CVV_ENABLED_PREF, true],
    ],
  });

  await withPaymentsPane(async ({ doc }) => {
    let checkbox = doc.getElementById("saveSecurityCodes");

    let prefChanged = TestUtils.waitForPrefChange(CVV_ENABLED_PREF);
    checkbox.click();
    await prefChanged;
    ok(!checkbox.checked, "Security codes checkbox should be unchecked");
    ok(
      !Services.prefs.getBoolPref(CVV_ENABLED_PREF),
      "Security codes pref should be disabled"
    );

    prefChanged = TestUtils.waitForPrefChange(CVV_ENABLED_PREF);
    checkbox.click();
    await prefChanged;
    ok(checkbox.checked, "Security codes checkbox should be checked");
    ok(
      Services.prefs.getBoolPref(CVV_ENABLED_PREF),
      "Security codes pref should be enabled"
    );
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_toggle_records_telemetry() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CVV_SUPPORTED_PREF, "on"],
      [CVV_ENABLED_PREF, true],
    ],
  });

  for (const hadSavedCvv of [false, true]) {
    if (hadSavedCvv) {
      await setStorage({ ...TEST_CREDIT_CARD_1, "cc-csc": "123" });
    }
    Services.fog.testResetFOG();

    await withPaymentsPane(async ({ doc }) => {
      const checkbox = doc.getElementById("saveSecurityCodes");
      const prefChanged = TestUtils.waitForPrefChange(CVV_ENABLED_PREF);
      checkbox.click();
      await prefChanged;
      checkbox.click();
    });

    await TestUtils.waitForCondition(
      () =>
        (Glean.formautofillCreditcards.cvvSavingToggled.testGetValue() ?? [])
          .length == 2,
      "Waiting for both cvv_saving_toggled events"
    );
    Assert.deepEqual(
      Glean.formautofillCreditcards.cvvSavingToggled
        .testGetValue()
        .map(event => event.extra),
      [
        {
          enabled: "false",
          source: "settings",
          had_saved_cvv: `${hadSavedCvv}`,
        },
        {
          enabled: "true",
          source: "settings",
          had_saved_cvv: `${hadSavedCvv}`,
        },
      ],
      `Toggling the setting is recorded with had_saved_cvv ${hadSavedCvv}`
    );
  }

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});
