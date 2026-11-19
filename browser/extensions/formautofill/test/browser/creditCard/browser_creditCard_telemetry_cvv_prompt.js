/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SUPPORTED_PREF = "extensions.formautofill.creditCards.cvv.supported";
const ENABLED_PREF = "extensions.formautofill.creditCards.cvv.enabled";

const NEW_CARD_VALUES = {
  "#cc-name": "User 1",
  "#cc-number": "5577000055770004",
  "#cc-exp-month": "12",
  "#cc-exp-year": "2017",
  "#cc-csc": "123",
};

const EXISTING_CARD_VALUES = {
  "#cc-name": TEST_CREDIT_CARD_1["cc-name"],
  "#cc-number": TEST_CREDIT_CARD_1["cc-number"],
  "#cc-exp-month": TEST_CREDIT_CARD_1["cc-exp-month"],
  "#cc-exp-year": TEST_CREDIT_CARD_1["cc-exp-year"],
  "#cc-csc": "456",
};

async function withDoorhanger(newValues, callback) {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues,
      });
      await onPopupShown;

      await callback(
        getNotification().querySelector(".credit-card-capture-content")
      );
    }
  );
}

async function clickToggle(content) {
  const toggle = content.querySelector("moz-toggle");
  await toggle.updateComplete;
  const prefChanged = TestUtils.waitForPrefChange(ENABLED_PREF);
  toggle.click();
  await prefChanged;
  await toggle.updateComplete;
}

function cvvPromptEvents() {
  const extras = metric =>
    (Glean.formautofillCreditcards[metric].testGetValue() ?? []).map(
      event => event.extra
    );
  return { shown: extras("cvvPromptShown"), action: extras("cvvPromptAction") };
}

function submittedFlowId() {
  return Glean.creditcard.submittedCcFormV2.testGetValue()[0].extra.value;
}

/**
 * Check that one cvv_prompt_shown and one cvv_prompt_action event were
 * recorded, with the form's flow id.
 */
function checkCvvPromptEvents(promptType, action, savingEnabled) {
  const { shown, action: actions } = cvvPromptEvents();
  const flowId = submittedFlowId();
  Assert.deepEqual(
    shown,
    [{ prompt_type: promptType, flow_id: flowId }],
    "One cvv_prompt_shown event is recorded"
  );
  Assert.deepEqual(
    actions,
    [
      {
        prompt_type: promptType,
        action,
        cvv_saving_enabled: String(savingEnabled),
        flow_id: flowId,
      },
    ],
    `One cvv_prompt_action "${action}" event is recorded`
  );
}

add_setup(async function () {
  // The security code is supported only while the Rust store serves.
  await switchCreditCardStore({ rust: true });
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, true],
      [ENABLED_AUTOFILL_CREDITCARDS_PREF, true],
    ],
  });
});

add_task(async function test_new_card() {
  const cases = [
    { action: "save", button: MAIN_BUTTON, checked: true, change: "add" },
    {
      action: "save",
      button: MAIN_BUTTON,
      checked: false,
      toggle: true,
      change: "add",
    },
    { action: "not_now", button: SECONDARY_BUTTON, checked: true },
    { action: "never_save", button: MENU_BUTTON, checked: true },
  ];
  for (const { action, button, checked, toggle, change } of cases) {
    await clearGleanTelemetry();
    await withDoorhanger(NEW_CARD_VALUES, async content => {
      if (toggle) {
        await clickToggle(content);
      }
      const onChanged = change && waitForStorageChangedEvents(change);
      await clickDoorhangerButton(button, 0);
      await onChanged;
    });
    await Services.fog.testFlushAllChildren();

    checkCvvPromptEvents("new_card", action, checked);

    await removeAllRecords();
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    Services.prefs.setBoolPref(ENABLED_AUTOFILL_CREDITCARDS_PREF, true);
  }
});

add_task(async function test_new_card_without_security_code() {
  await clearGleanTelemetry();
  await withDoorhanger({ ...NEW_CARD_VALUES, "#cc-csc": "" }, async () => {
    await clickDoorhangerButton(SECONDARY_BUTTON);
  });

  Assert.equal(
    Glean.creditcard.showCaptureDoorhanger.testGetValue().length,
    1,
    "The save doorhanger is shown"
  );
  Assert.deepEqual(
    cvvPromptEvents(),
    { shown: [], action: [] },
    "No cvv_prompt events are recorded without a security code"
  );
});

add_task(async function test_existing_card() {
  const cases = [
    { action: "save", button: MAIN_BUTTON, checked: true, change: "update" },
    {
      action: "save",
      button: MAIN_BUTTON,
      checked: false,
      toggle: true,
      change: "update",
    },
    {
      action: "save_new",
      button: SECONDARY_BUTTON,
      checked: false,
      toggle: true,
      change: "add",
    },
    { action: "no_thanks", button: SECONDARY_BUTTON, checked: true },
    { action: "never_save", button: MENU_BUTTON, checked: true },
  ];
  for (const { action, button, checked, toggle, change } of cases) {
    await setStorage({ ...TEST_CREDIT_CARD_1, "cc-csc": "123" });
    await clearGleanTelemetry();
    await withDoorhanger(EXISTING_CARD_VALUES, async content => {
      if (toggle) {
        await clickToggle(content);
      }
      const onChanged = change && waitForStorageChangedEvents(change);
      await clickDoorhangerButton(button, 0);
      await onChanged;
    });
    await Services.fog.testFlushAllChildren();

    checkCvvPromptEvents("existing_card", action, checked);

    await removeAllRecords();
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    Services.prefs.setBoolPref(ENABLED_AUTOFILL_CREDITCARDS_PREF, true);
  }
});

add_task(async function test_existing_card_plain_update() {
  await setStorage({ ...TEST_CREDIT_CARD_1, "cc-csc": "123" });
  await clearGleanTelemetry();
  await withDoorhanger(
    { ...EXISTING_CARD_VALUES, "#cc-name": "Mark Smith", "#cc-csc": "123" },
    async () => {
      const onChanged = waitForStorageChangedEvents("update");
      await clickDoorhangerButton(MAIN_BUTTON);
      await onChanged;
    }
  );

  Assert.equal(
    Glean.creditcard.showUpdateDoorhanger.testGetValue().length,
    1,
    "The update doorhanger is shown"
  );
  Assert.deepEqual(
    cvvPromptEvents(),
    { shown: [], action: [] },
    "No cvv_prompt events are recorded when the security code is unchanged"
  );

  await removeAllRecords();
});

add_task(async function test_closed_without_a_response() {
  for (const [promptType, values] of [
    ["new_card", NEW_CARD_VALUES],
    ["existing_card", EXISTING_CARD_VALUES],
  ]) {
    if (promptType == "existing_card") {
      await setStorage({ ...TEST_CREDIT_CARD_1, "cc-csc": "123" });
    }
    await clearGleanTelemetry();

    // Closing the tab removes the doorhanger without a button being clicked.
    await withDoorhanger(values, async () => {});
    await Services.fog.testFlushAllChildren();

    checkCvvPromptEvents(promptType, "closed", true);

    await removeAllRecords();
  }
});

add_task(async function test_dismissed_without_a_response() {
  for (const [promptType, values] of [
    ["new_card", NEW_CARD_VALUES],
    ["existing_card", EXISTING_CARD_VALUES],
  ]) {
    if (promptType == "existing_card") {
      await setStorage({ ...TEST_CREDIT_CARD_1, "cc-csc": "123" });
    }
    await clearGleanTelemetry();

    await withDoorhanger(values, async () => {
      const onPopupHidden = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      EventUtils.synthesizeKey("KEY_Escape");
      await onPopupHidden;
    });
    await Services.fog.testFlushAllChildren();

    // Closing the tab afterwards doesn't record a second "closed" event.
    checkCvvPromptEvents(promptType, "closed", true);

    await removeAllRecords();
  }
});
