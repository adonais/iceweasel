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

add_task(async function test_hidden_when_not_supported() {
  await SpecialPowers.pushPrefEnv({ set: [[CVV_SUPPORTED_PREF, "off"]] });

  await withPaymentsPane(async ({ settingControl }) => {
    ok(settingControl.hidden, "Security codes checkbox should be hidden");
  });

  await SpecialPowers.popPrefEnv();
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
