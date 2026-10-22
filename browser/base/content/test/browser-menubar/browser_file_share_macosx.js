/* Any copyright is dedicated to the Public Domain.
  http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const BASE = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  // eslint-disable-next-line sdl/no-insecure-url
  "http://example.com"
);
const TEST_URL = BASE + "file_shareurl.html";

let shareUrlWithPickerSpy = sinon.spy();

let mockMacSharingService = MockRegistrar.register(
  "@mozilla.org/widget/macsharingservice;1",
  {
    shareUrlWithPicker(anchor, urls, titles, shareTitle) {
      shareUrlWithPickerSpy(Array.from(urls), Array.from(titles), shareTitle);
    },
    QueryInterface: ChromeUtils.generateQI([Ci.nsIMacSharingService]),
  }
);

registerCleanupFunction(function () {
  MockRegistrar.unregister(mockMacSharingService);
});

const qrCodeEnabled = Services.prefs.getBoolPref(
  "browser.shareqrcode.enabled",
  false
);
// Copy Link and macOS picker item, plus QR code if the pref is enabled.
const expectedItemCount = qrCodeEnabled ? 3 : 2;

/**
 * Test the "Share" submenu in the File menu on macOS.
 * Verifies Copy Link and the macOS system share picker items.
 */
add_task(async function test_file_menu_share() {
  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    // We can't toggle menubar items on OSX, so mocking instead.
    let menu = document.getElementById("menu_FilePopup");
    await simulateMenuOpen(menu);

    await BrowserTestUtils.waitForMutationCondition(
      menu,
      { childList: true },
      () => menu.querySelector(".share-tab-url-item")
    );
    ok(true, "Got Share item");

    let popup = menu.querySelector(".share-tab-url-item").menupopup;
    await simulateMenuOpen(popup);

    let items = Array.from(popup.querySelectorAll("menuitem"));
    is(
      items.length,
      expectedItemCount,
      `There should be ${expectedItemCount} menu items.`
    );

    info("Test the Copy Link item");
    let copyLinkItem = popup.querySelector(".share-copy-link");
    ok(copyLinkItem, "Copy Link item exists");
    await SimpleTest.promiseClipboardChange(TEST_URL, () =>
      copyLinkItem.doCommand()
    );
    await simulateMenuClosed(popup);
    await simulateMenuClosed(menu);

    info("Test the macOS share picker item");
    await simulateMenuOpen(menu);
    popup = menu.querySelector(".share-tab-url-item").menupopup;
    await simulateMenuOpen(popup);

    let pickerItem = popup.querySelector(".share-mac-picker-item");
    ok(pickerItem, "macOS share picker item exists");
    pickerItem.doCommand();

    await TestUtils.waitForCondition(
      () => shareUrlWithPickerSpy.calledOnce,
      "shareUrlWithPicker was called"
    );

    let [urls, titles, shareTitle] = shareUrlWithPickerSpy.getCall(0).args;
    Assert.deepEqual(urls, [TEST_URL], "Shared the correct URL");
    is(titles[0], "Sharing URL", "Shared the correct title");
    is(shareTitle, "Sharing URL", "Share title matches the tab title");

    shareUrlWithPickerSpy.resetHistory();
    await simulateMenuClosed(popup);
    await simulateMenuClosed(menu);
  });
});
