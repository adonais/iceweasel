"use strict";

const PREF = "browser.autocomplete.removeRecords.enabled";
const AC_L10N = new Localization(
  ["toolkit/main-window/autocomplete.ftl"],
  true
);
const DELETE_TOOLTIP = AC_L10N.formatValueSync("autocomplete-delete-address");

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

add_task(async function test_trash_button_when_pref_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");
      const items = getDisplayedPopupItems(browser);

      const rowItem = items[0].querySelector("autocomplete-row-item");
      is(
        rowItem.actions.secondary.type,
        "delete",
        "Address rows show a delete secondary action when the pref is on"
      );
      ok(
        !rowItem.actions.secondary.actions,
        "The trash is a single action, not a flyout"
      );

      const { label, tooltip } = rowItem.actions.secondary;
      is(tooltip, DELETE_TOOLTIP, "The tooltip stays short and omits the row");
      ok(
        label.includes(TEST_ADDRESS_1.organization),
        `The accessible name names the row it belongs to, got "${label}"`
      );

      const button = rowItem.shadowRoot.querySelector(
        "moz-button.secondary-action"
      );
      ok(
        button.iconSrc.endsWith("delete.svg"),
        "The secondary action shows the trash icon"
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

// The Lit render lags the row's selected attribute, so the button can still be
// hidden when the row is already active. Wait it out before clicking, or the
// click falls through to the row and fills the form instead.
async function clickTrashButton(rowItem) {
  const button = rowItem.shadowRoot.querySelector(
    "moz-button.secondary-action"
  );

  await EventUtils.promiseElementReadyForUserInput(button, window, info);
  await TestUtils.waitForCondition(
    () => button.checkVisibility({ checkVisibilityCSS: true }),
    "Wait for the trash button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(button, {}, window);
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

      const dialogClosed = BrowserTestUtils.promiseAlertDialog(
        null,
        undefined,
        {
          callback: win => {
            sawDialog = true;
            const [title, message] = AC_L10N.formatValuesSync([
              { id: "autocomplete-delete-address-title" },
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

      await clickTrashButton(rowItem);
      await dialogClosed;
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

async function activateDelete(browser) {
  const item = getDisplayedPopupItems(browser)[0];
  const rowItem = item.querySelector("autocomplete-row-item");
  await selectFirstRow(browser, item);

  const dialogClosed = BrowserTestUtils.promiseAlertDialog("accept");
  await clickTrashButton(rowItem);
  await dialogClosed;
}

add_task(async function test_delete_removes_the_address() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await removeAllRecords();
  await setStorage(TEST_ADDRESS_1, TEST_ADDRESS_4);
  const before = await getAddresses();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");
      const rowCount = getDisplayedPopupItems(browser).length;

      await withStorageChange("remove", () => activateDelete(browser));

      const remaining = await getAddresses();
      is(remaining.length, 1, "Confirming the removal deleted one address");
      ok(
        before.some(
          address => !remaining.some(kept => kept.guid == address.guid)
        ),
        "Exactly one of the stored addresses is gone"
      );

      await TestUtils.waitForCondition(
        () => browser.autoCompletePopup.popupOpen,
        "Wait for the dropdown to come back after the removal"
      );
      await TestUtils.waitForCondition(
        () => getDisplayedPopupItems(browser).length == rowCount - 1,
        "Wait for the restored dropdown to drop the removed row"
      );

      await closePopup(browser);
    }
  );
  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_deleting_the_last_address_closes_the_dropdown() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await removeAllRecords();
  await setStorage(TEST_ADDRESS_1);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");

      await withStorageChange("remove", () => activateDelete(browser));

      is(
        (await getAddresses()).length,
        0,
        "The last address was removed from storage"
      );
      await TestUtils.waitForCondition(
        () => !browser.autoCompletePopup.popupOpen,
        "Wait for the dropdown to be torn down"
      );
    }
  );
  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_delete_refuses_an_unknown_guid() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await removeAllRecords();
  await setStorage(TEST_ADDRESS_1);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: FORM_URL },
    async browser => {
      await openPopupOn(browser, "#organization");

      const actor =
        browser.browsingContext.currentWindowGlobal.getActor("FormAutofill");
      const dialogClosed = BrowserTestUtils.promiseAlertDialog("accept");
      await actor.onAutoCompleteEntrySelected("FormAutofill:DeleteAddress", {
        guid: "no-such-guid",
      });
      await dialogClosed;

      is(
        (await getAddresses()).length,
        1,
        "A guid that names no stored address removes nothing"
      );

      await TestUtils.waitForCondition(
        () => browser.autoCompletePopup.popupOpen,
        "Wait for the dropdown to come back after the refused removal"
      );
      await closePopup(browser);
    }
  );
  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});
