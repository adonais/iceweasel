/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FormHistory } = ChromeUtils.importESModule(
  "resource://gre/modules/FormHistory.sys.mjs"
);

const PREF = "browser.autocomplete.removeRecords.enabled";
const URL = `data:text/html,<input type="text" name="field1">`;

async function withFormHistoryPopup(task) {
  await BrowserTestUtils.withNewTab({ gBrowser, url: URL }, async browser => {
    const {
      autoCompletePopup,
      autoCompletePopup: { richlistbox: itemsBox },
    } = browser;

    await FormHistory.update([
      { op: "remove" },
      { op: "add", fieldname: "field1", value: "value1" },
      { op: "add", fieldname: "field1", value: "value2" },
    ]);
    await SpecialPowers.spawn(browser, [], async () => {
      content.document.querySelector("input").focus();
    });

    await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    await TestUtils.waitForCondition(() => autoCompletePopup.popupOpen);

    await task(browser, autoCompletePopup, itemsBox);

    await SpecialPowers.spawn(browser, [], async () => {
      content.document.querySelector("input").blur();
    });
  });
}

function getRowItem(itemsBox, index) {
  return itemsBox
    .querySelectorAll(".autocomplete-row-item")
    [index].querySelector("autocomplete-row-item");
}

add_task(async function test_no_secondary_action_when_pref_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  await withFormHistoryPopup(async (browser, autoCompletePopup, itemsBox) => {
    const rowItem = getRowItem(itemsBox, 0);
    Assert.equal(
      rowItem.actions.secondary,
      null,
      "Form history rows have no secondary action when the pref is off"
    );
    Assert.ok(
      !rowItem.shadowRoot.querySelector("moz-button.secondary-action"),
      "No secondary action button is rendered"
    );
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_trash_button_when_pref_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  await withFormHistoryPopup(async (browser, autoCompletePopup, itemsBox) => {
    const rowItem = getRowItem(itemsBox, 0);
    Assert.equal(
      rowItem.actions.secondary.type,
      "delete",
      "Form history rows show a delete secondary action when the pref is on"
    );
    Assert.ok(
      !rowItem.actions.secondary.actions,
      "The trash is a single action, not a flyout"
    );

    const button = rowItem.shadowRoot.querySelector(
      "moz-button.secondary-action"
    );
    Assert.ok(button, "The trash button is rendered");
    Assert.ok(
      button.iconSrc.endsWith("delete.svg"),
      "The secondary action shows the trash icon"
    );

    await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    await TestUtils.waitForCondition(() => rowItem.selected);

    EventUtils.synthesizeMouseAtCenter(button, {});
    await TestUtils.waitForTick();
    Assert.ok(
      autoCompletePopup.popupOpen,
      "The popup stays open when the trash button is clicked"
    );
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_trash_button_shows_no_confirmation() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });
  let sawDialog = false;
  const observer = () => {
    sawDialog = true;
  };
  Services.obs.addObserver(observer, "common-dialog-loaded");

  await withFormHistoryPopup(async (browser, autoCompletePopup, itemsBox) => {
    const rowItem = getRowItem(itemsBox, 0);
    const button = rowItem.shadowRoot.querySelector(
      "moz-button.secondary-action"
    );

    await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    await TestUtils.waitForCondition(() => rowItem.selected);

    EventUtils.synthesizeMouseAtCenter(button, {});
    await TestUtils.waitForTick();

    Assert.ok(
      !sawDialog,
      "Form history entries are removed without a confirmation prompt"
    );
    Assert.ok(
      autoCompletePopup.popupOpen,
      "The popup stays open after the trash button is clicked"
    );
  });

  Services.obs.removeObserver(observer, "common-dialog-loaded");
  await SpecialPowers.popPrefEnv();
});
