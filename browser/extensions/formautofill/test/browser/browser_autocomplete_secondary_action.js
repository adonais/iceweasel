"use strict";

const PREF = "browser.autocomplete.removeRecords.enabled";
const AC_L10N = new Localization(
  ["toolkit/main-window/autocomplete.ftl"],
  true
);

add_setup(async function setup_storage() {
  await setStorage(TEST_ADDRESS_1);
});

add_task(async function test_no_secondary_action_when_pref_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");
      const rowItem = getDisplayedPopupItems(browser)[0].querySelector(
        "autocomplete-row-item"
      );
      is(
        rowItem.actions.secondary,
        null,
        "Address rows have no secondary action when the pref is off"
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
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");
      const items = getDisplayedPopupItems(browser);

      const rowItem = items[0].querySelector("autocomplete-row-item");
      is(
        rowItem.actions.secondary.type,
        "menupopup",
        "Address rows show a flyout secondary action when the pref is on"
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

      // The "Manage addresses" footer row must not get a secondary action.
      const footer = items.at(-1).querySelector("autocomplete-row-item");
      is(
        footer.actions.secondary,
        null,
        "The manage footer row has no secondary action"
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

add_task(async function test_delete_confirms_without_device_sign_in() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  const { FormAutofillUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
  );
  const originalVerify = FormAutofillUtils.verifyUserOSAuth;
  let verifyCalls = 0;
  FormAutofillUtils.verifyUserOSAuth = () => {
    verifyCalls++;
    return Promise.resolve(true);
  };
  let sawDialog = false;

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");
      const item = getDisplayedPopupItems(browser)[0];
      const rowItem = item.querySelector("autocomplete-row-item");
      await selectFirstRow(browser, item);

      const deleteLabel = rowItem.actions.secondary.actions[1].label;
      const menupopup = await openFlyout(rowItem, deleteLabel);
      const menuitem = [...menupopup.querySelectorAll("menuitem")].find(
        mi => mi.getAttribute("label") === deleteLabel
      );

      const dialogClosed = BrowserTestUtils.promiseAlertDialog(
        null,
        undefined,
        {
          callback: win => {
            sawDialog = true;
            const [title, message] = AC_L10N.formatValuesSync([
              { id: "autocomplete-remove-address-title" },
              { id: "autocomplete-remove-record-message" },
            ]);
            is(
              win.document.getElementById("infoTitle").textContent,
              title,
              "The confirmation asks whether to remove the address"
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

      is(verifyCalls, 0, "Removing an address does not ask for device sign in");
      ok(sawDialog, "The confirmation dialog was shown");
      ok(
        browser.autoCompletePopup.popupOpen,
        "The dropdown is restored once the confirmation is dismissed"
      );

      const addresses = await getAddresses();
      is(
        addresses.length,
        1,
        "Cancelling the confirmation leaves the address in place"
      );

      await closePopup(browser);
    }
  );
  FormAutofillUtils.verifyUserOSAuth = originalVerify;
  await SpecialPowers.popPrefEnv();
});
