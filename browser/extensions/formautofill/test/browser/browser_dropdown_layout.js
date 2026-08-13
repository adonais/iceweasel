"use strict";

const URL =
  "http://example.org/browser/browser/extensions/formautofill/test/browser/autocomplete_basic.html";

add_setup(async function setup_storage() {
  await setStorage(TEST_ADDRESS_1, TEST_ADDRESS_2, TEST_ADDRESS_3);
});

add_task(async function test_address_dropdown() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: URL },
    async function (browser) {
      const focusInput = "#organization";
      await openPopupOn(browser, focusInput);
      const firstItem = getDisplayedPopupItems(browser)[0];

      const expectedIcon = "chrome://browser/skin/fxa/avatar-empty.svg";

      is(getACItemIcon(firstItem), expectedIcon, "Got expected icon");

      await closePopup(browser);
    }
  );
});
