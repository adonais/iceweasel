"use strict";

const PREF = "browser.autocomplete.removeRecords.enabled";
const AC_L10N = new Localization(
  ["toolkit/main-window/autocomplete.ftl"],
  true
);
const CC_URL =
  "https://example.org/browser/browser/extensions/formautofill/test/browser/creditCard/autocomplete_creditcard_basic.html";

add_setup(async function setup_storage() {
  await setStorage(TEST_CREDIT_CARD_1);
});

add_task(async function test_no_secondary_action_when_pref_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async browser => {
      await openPopupOn(browser, "#cc-number");
      const rowItem = getDisplayedPopupItems(browser)[0].querySelector(
        "autocomplete-row-item"
      );
      is(
        rowItem.actions.secondary,
        null,
        "Payment rows have no secondary action when the pref is off"
      );
      ok(
        !rowItem.shadowRoot.querySelector("moz-button.secondary-action"),
        "No secondary action button is rendered"
      );
      await closePopup(browser);
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_flyout_when_pref_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async browser => {
      await openPopupOn(browser, "#cc-number");
      const rowItem = getDisplayedPopupItems(browser)[0].querySelector(
        "autocomplete-row-item"
      );
      is(
        rowItem.actions.secondary.type,
        "menupopup",
        "Payment rows show a flyout secondary action when the pref is on"
      );
      is(
        rowItem.actions.secondary.actions.length,
        2,
        "The flyout has an edit and a delete item"
      );
      const button = rowItem.shadowRoot.querySelector(
        "moz-button.secondary-action"
      );
      ok(
        button.iconSrc.endsWith("more.svg"),
        "The secondary action shows the more icon"
      );
      await closePopup(browser);
    }
  );
  await SpecialPowers.popPrefEnv();
});

async function selectFirstRow(browser, item) {
  await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
  await TestUtils.waitForCondition(
    () => item.hasAttribute("selected"),
    "Wait for the first row to become active"
  );
}

async function openFlyout(rowItem, label) {
  const button = rowItem.shadowRoot.querySelector(
    "moz-button.secondary-action"
  );
  await TestUtils.waitForCondition(
    () => button.checkVisibility({ checkVisibilityCSS: true }),
    "Wait for the secondary action button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(button, {});
  const menupopup = await TestUtils.waitForCondition(
    () =>
      [...document.querySelectorAll("menupopup")].find(m =>
        [...m.querySelectorAll("menuitem")].some(
          mi => mi.getAttribute("label") === label
        )
      ),
    "Wait for the flyout menu to open"
  );
  if (menupopup.state != "open") {
    await BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  }
  return menupopup;
}

async function activateDelete(browser, { verified }) {
  const { FormAutofillUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
  );
  const originalVerify = FormAutofillUtils.verifyUserOSAuth;
  const verifyArgs = [];
  FormAutofillUtils.verifyUserOSAuth = (...args) => {
    verifyArgs.push(args);
    return Promise.resolve(verified);
  };

  await openPopupOn(browser, "#cc-number");
  const item = getDisplayedPopupItems(browser)[0];
  const rowItem = item.querySelector("autocomplete-row-item");
  await selectFirstRow(browser, item);

  const deleteLabel = rowItem.actions.secondary.actions[1].label;
  const menupopup = await openFlyout(rowItem, deleteLabel);
  const menuitem = [...menupopup.querySelectorAll("menuitem")].find(
    mi => mi.getAttribute("label") === deleteLabel
  );

  return {
    menupopup,
    menuitem,
    verifyArgs,
    restore: () => {
      FormAutofillUtils.verifyUserOSAuth = originalVerify;
    },
  };
}

add_task(async function test_delete_asks_for_device_sign_in_then_confirms() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  let sawDialog = false;

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async browser => {
      const { menupopup, menuitem, verifyArgs, restore } = await activateDelete(
        browser,
        { verified: true }
      );

      const dialogClosed = BrowserTestUtils.promiseAlertDialog(
        null,
        undefined,
        {
          callback: win => {
            sawDialog = true;
            const [title, message] = AC_L10N.formatValuesSync([
              { id: "autocomplete-remove-payment-method-title" },
              { id: "autocomplete-remove-record-message" },
            ]);
            is(
              win.document.getElementById("infoTitle").textContent,
              title,
              "The confirmation asks whether to remove the payment method"
            );
            is(
              win.document.getElementById("infoBody").textContent,
              message,
              "The confirmation warns the action cannot be undone"
            );
            win.document.querySelector("dialog").getButton("cancel").click();
          },
        }
      );

      menupopup.activateItem(menuitem);
      await dialogClosed;
      await TestUtils.waitForCondition(
        () => !menupopup.isConnected,
        "Wait for the flyout to be torn down"
      );
      await TestUtils.waitForCondition(
        () => browser.autoCompletePopup.popupOpen,
        "Wait for the dropdown to come back after the confirmation"
      );

      const { FormAutofill } = ChromeUtils.importESModule(
        "resource://autofill/FormAutofill.sys.mjs"
      );
      is(verifyArgs.length, 1, "Device sign in was requested");
      is(
        verifyArgs[0][0],
        FormAutofill.AUTOFILL_CREDITCARDS_OS_AUTH_LOCKED_PREF,
        "Device sign in is gated on the payment methods reauth pref"
      );
      ok(sawDialog, "The confirmation dialog was shown");
      ok(
        browser.autoCompletePopup.popupOpen,
        "The dropdown is restored once the confirmation is dismissed"
      );

      const cards = await getCreditCards();
      is(
        cards.length,
        1,
        "Cancelling the confirmation leaves the payment method in place"
      );

      restore();
      await closePopup(browser);
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_delete_skips_confirm_when_device_sign_in_fails() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  let sawDialog = false;
  const observer = () => {
    sawDialog = true;
  };
  Services.obs.addObserver(observer, "common-dialog-loaded");

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async browser => {
      const { menupopup, menuitem, verifyArgs, restore } = await activateDelete(
        browser,
        { verified: false }
      );

      menupopup.activateItem(menuitem);
      await TestUtils.waitForCondition(
        () => verifyArgs.length,
        "Wait for device sign in to be requested"
      );
      await TestUtils.waitForTick();

      ok(
        !sawDialog,
        "No confirmation is shown when device sign in is declined"
      );

      restore();
      await closePopup(browser);
    }
  );
  Services.obs.removeObserver(observer, "common-dialog-loaded");
  await SpecialPowers.popPrefEnv();
});
