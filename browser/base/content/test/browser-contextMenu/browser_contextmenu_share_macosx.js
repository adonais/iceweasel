/* Any copyright is dedicated to the Public Domain.
  http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);
UrlbarTestUtils.init(this);
const BASE = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  // eslint-disable-next-line sdl/no-insecure-url
  "http://example.com"
);
const TEST_URL_1 = BASE + "browser_contextmenu_shareurl.html";
const TEST_URL_2 = "https://example.org/";

let shareUrlWithPickerSpy = sinon.spy();

let { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
let mockMacSharingService = MockRegistrar.register(
  "@mozilla.org/widget/macsharingservice;1",
  {
    shareUrlWithPicker(anchor, urls, titles, shareTitle) {
      shareUrlWithPickerSpy(
        anchor,
        Array.from(urls),
        Array.from(titles),
        shareTitle
      );
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
// copy link + mac picker item, plus QR code if enabled.
const expectedItemCount = qrCodeEnabled ? 3 : 2;

/**
 * Test the "Share" submenu in the tab context menu on macOS.
 */
add_task(async function test_contextmenu_share_macosx() {
  await BrowserTestUtils.withNewTab(TEST_URL_1, async () => {
    let contextMenu = await openTabContextMenu(gBrowser.selectedTab);
    await BrowserTestUtils.waitForMutationCondition(
      contextMenu,
      { childList: true },
      () => contextMenu.querySelector(".share-tab-url-item")
    );
    ok(true, "Got Share item");

    await openShareMenuPopup(contextMenu);
    let popup = contextMenu.querySelector(".share-tab-url-item").menupopup;
    let items = Array.from(popup.querySelectorAll("menuitem"));
    is(
      items.length,
      expectedItemCount,
      `There should be ${expectedItemCount} menu items.`
    );

    info("Click the macOS share picker item");
    let pickerItem = popup.querySelector(".share-mac-picker-item");
    Assert.ok(pickerItem, "macOS share picker item exists");
    let menuPopupClosed = BrowserTestUtils.waitForPopupEvent(
      contextMenu,
      "hidden"
    );
    Services.fog.testResetFOG();
    GleanPings.prototypeNoCodeEvents.setEnabled(true);
    popup.activateItem(pickerItem);
    await menuPopupClosed;

    await TestUtils.waitForCondition(
      () => shareUrlWithPickerSpy.calledOnce,
      "shareUrlWithPicker called"
    );
    let [, urls, titles, shareTitle] = shareUrlWithPickerSpy.getCall(0).args;
    Assert.deepEqual(urls, [TEST_URL_1], "Shared the correct URL");
    Assert.equal(titles[0], "Sharing URL", "Shared the correct title");
    Assert.equal(shareTitle, "Sharing URL", "Share title matches page title");

    let events =
      Glean.browserUsage.interaction
        .testGetValue()
        ?.map(e => [e.extra.source, e.extra.widget_id]) ?? [];
    Assert.deepEqual(
      events,
      [
        ["tabs-context", "macos-share-picker"],
        ["tabs-context-entrypoint", "macos-share-picker"],
      ],
      "picker click records the macos-share-picker widget id"
    );

    info("Test the copy link button");
    contextMenu = await openTabContextMenu(gBrowser.selectedTab);
    await openShareMenuPopup(contextMenu);
    popup = contextMenu.querySelector(".share-tab-url-item").menupopup;
    let copyLinkItem = popup.querySelector(".share-copy-link");
    Assert.ok(copyLinkItem, "Copy Link item exists");
    menuPopupClosed = BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");
    await SimpleTest.promiseClipboardChange(TEST_URL_1, () =>
      popup.activateItem(copyLinkItem)
    );
    await menuPopupClosed;

    shareUrlWithPickerSpy.resetHistory();
  });
});

/**
 * Test that for multiple selected tabs on macOS:
 *  - The share picker item is enabled and forwards every URL/title
 *  - "Copy links" copies all shareable URLs to the clipboard
 */
add_task(async function test_contextmenu_share_multiselect_macosx() {
  let tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL_1);
  let tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL_2);

  await triggerClickOn(tab1, { ctrlKey: true });
  ok(tab1.multiselected, "tab1 is multiselected");
  ok(tab2.multiselected, "tab2 is multiselected");

  let contextMenu = await openTabContextMenu(tab2);
  await BrowserTestUtils.waitForMutationCondition(
    contextMenu,
    { childList: true },
    () => contextMenu.querySelector(".share-tab-url-item")
  );

  await openShareMenuPopup(contextMenu);

  let popup = contextMenu.querySelector(".share-tab-url-item").menupopup;
  let pickerItem = popup.querySelector(".share-mac-picker-item");
  Assert.ok(pickerItem, "macOS share picker item exists");
  ok(
    !pickerItem.hasAttribute("disabled"),
    "share picker is enabled for multi-tab"
  );

  info("Clicking the picker forwards every selected tab's URL");
  let menuPopupClosed = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  popup.activateItem(pickerItem);
  await menuPopupClosed;

  await TestUtils.waitForCondition(
    () => shareUrlWithPickerSpy.calledOnce,
    "shareUrlWithPicker was called once"
  );
  let [, urls] = shareUrlWithPickerSpy.getCall(0).args;
  Assert.deepEqual(
    urls,
    [TEST_URL_1, TEST_URL_2],
    "shareUrlWithPicker received both tab URLs"
  );

  info("Verify that Copy Links copies every selected tab's URL");
  contextMenu = await openTabContextMenu(tab2);
  await openShareMenuPopup(contextMenu);
  popup = contextMenu.querySelector(".share-tab-url-item").menupopup;

  let copyLinkItem = popup.querySelector(".share-copy-link");
  ok(copyLinkItem, "copy link item exists");
  ok(
    !copyLinkItem.hasAttribute("disabled"),
    "copy link is enabled for multi-tab"
  );

  menuPopupClosed = BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");
  await SimpleTest.promiseClipboardChange(TEST_URL_1 + "\n" + TEST_URL_2, () =>
    popup.activateItem(copyLinkItem)
  );
  await menuPopupClosed;

  info("Verify HTML clipboard contains linked anchors for both tabs");
  let htmlContent = getHTMLClipboard();
  let htmlDoc = new DOMParser().parseFromString(htmlContent, "text/html");
  let anchors = Array.from(htmlDoc.querySelectorAll("a"));
  is(anchors.length, 2, "HTML clipboard has 2 anchor elements");
  is(
    anchors[0].getAttribute("href"),
    TEST_URL_1,
    "First anchor href matches URL 1"
  );
  ok(anchors[0].textContent, "First anchor has non-empty title");
  is(
    anchors[1].getAttribute("href"),
    TEST_URL_2,
    "Second anchor href matches URL 2"
  );
  ok(anchors[1].textContent, "Second anchor has non-empty title");

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  shareUrlWithPickerSpy.resetHistory();
});

/**
 * Test that Copy Links is enabled when the first selected tab is about:blank
 * but another selected tab has a real URL.
 */
add_task(
  async function test_contextmenu_share_multiselect_blank_first_macosx() {
    let tab1 = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:blank"
    );
    let tab2 = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      TEST_URL_1
    );

    await triggerClickOn(tab1, { ctrlKey: true });
    ok(tab1.multiselected, "tab1 (blank) is multiselected");
    ok(tab2.multiselected, "tab2 (real URL) is multiselected");

    let contextMenu = await openTabContextMenu(tab1);
    await BrowserTestUtils.waitForMutationCondition(
      contextMenu,
      { childList: true },
      () => contextMenu.querySelector(".share-tab-url-item")
    );

    await openShareMenuPopup(contextMenu);

    let popup = contextMenu.querySelector(".share-tab-url-item").menupopup;
    let copyLinkItem = popup.querySelector(".share-copy-link");
    ok(copyLinkItem, "copy links item exists");
    ok(
      !copyLinkItem.hasAttribute("disabled"),
      "copy links is enabled when at least one tab has a shareable URL"
    );

    let menuPopupClosed = BrowserTestUtils.waitForPopupEvent(
      contextMenu,
      "hidden"
    );
    contextMenu.hidePopup();
    await menuPopupClosed;

    BrowserTestUtils.removeTab(tab1);
    BrowserTestUtils.removeTab(tab2);
  }
);

/**
 * Test that Copy Links is disabled when all selected tabs have non-shareable URLs.
 */
add_task(async function test_contextmenu_share_multiselect_all_blank_macosx() {
  let tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  let tab2 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  await triggerClickOn(tab1, { ctrlKey: true });
  ok(tab1.multiselected, "tab1 is multiselected");
  ok(tab2.multiselected, "tab2 is multiselected");

  let contextMenu = await openTabContextMenu(tab2);
  await BrowserTestUtils.waitForMutationCondition(
    contextMenu,
    { childList: true },
    () => contextMenu.querySelector(".share-tab-url-item")
  );

  await openShareMenuPopup(contextMenu);

  let popup = contextMenu.querySelector(".share-tab-url-item").menupopup;
  let copyLinkItem = popup.querySelector(".share-copy-link");
  ok(copyLinkItem, "copy links item exists");
  is(
    copyLinkItem.getAttribute("disabled"),
    "true",
    "copy links is disabled when all selected tabs have non-shareable URLs"
  );

  let menuPopupClosed = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  contextMenu.hidePopup();
  await menuPopupClosed;

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

/**
 * Test the share group in the address bar context menu on macOS: Share…,
 * Create QR Code and Copy Clean Link.
 */
add_task(async function test_urlbar_contextmenu_share_macosx() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.shareqrcode.enabled", true]],
  });
  await BrowserTestUtils.withNewTab(TEST_URL_1, async () => {
    await UrlbarTestUtils.withContextMenu(window, popup => {
      let shareItem = popup.querySelector(".share-mac-picker-item");
      let qrCodeItem = popup.querySelector(".share-qrcode-item");
      let stripOnShare = popup.querySelector('[anonid="strip-on-share"]');

      Assert.ok(shareItem, "Share item is present");
      Assert.ok(qrCodeItem, "Create QR Code item is present");
      Assert.ok(stripOnShare, "Copy Clean Link item is present");

      Assert.ok(BrowserTestUtils.isVisible(shareItem), "Share item is visible");
      Assert.ok(
        BrowserTestUtils.isVisible(qrCodeItem),
        "Create QR Code is visible when the pref is enabled"
      );
      Assert.ok(!shareItem.hasAttribute("disabled"), "Share item is enabled");
      Assert.ok(
        !qrCodeItem.hasAttribute("disabled"),
        "Create QR Code is enabled"
      );
    });
  });
  await SpecialPowers.popPrefEnv();
});

/**
 * Test that Create QR Code is hidden when the QR code pref is disabled.
 */
add_task(async function test_urlbar_contextmenu_share_qrcode_pref_off() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.shareqrcode.enabled", false]],
  });
  await BrowserTestUtils.withNewTab(TEST_URL_1, async () => {
    await UrlbarTestUtils.withContextMenu(window, popup => {
      let qrCodeItem = popup.querySelector(".share-qrcode-item");
      Assert.ok(qrCodeItem, "Create QR Code item is still in the DOM");
      Assert.ok(
        !BrowserTestUtils.isVisible(qrCodeItem),
        "Create QR Code is hidden when the pref is disabled"
      );
    });
  });
  await SpecialPowers.popPrefEnv();
});

/**
 * Test that the Share item opens the picker anchored to the address bar, with
 * the current tab's URL and title.
 */
add_task(async function test_urlbar_contextmenu_share_invokes_picker() {
  await BrowserTestUtils.withNewTab(TEST_URL_1, async () => {
    shareUrlWithPickerSpy.resetHistory();
    await UrlbarTestUtils.withContextMenu(window, popup => {
      popup.activateItem(popup.querySelector(".share-mac-picker-item"));
    });

    await TestUtils.waitForCondition(
      () => shareUrlWithPickerSpy.calledOnce,
      "shareUrlWithPicker was called"
    );
    let [anchor, urls, titles, shareTitle] =
      shareUrlWithPickerSpy.getCall(0).args;
    Assert.equal(
      anchor,
      gURLBar.inputField,
      "Picker is anchored to the address bar input field"
    );
    Assert.deepEqual(urls, [TEST_URL_1], "Shared the current tab's URL");
    Assert.equal(titles[0], "Sharing URL", "Shared the correct title");
    Assert.equal(shareTitle, "Sharing URL", "Share title matches page title");

    shareUrlWithPickerSpy.resetHistory();
  });
});

/**
 * Test that Share and Create QR Code are disabled for a URL that cannot be
 * shared.
 */
add_task(async function test_urlbar_contextmenu_share_unshareable_url() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.shareqrcode.enabled", true]],
  });
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await UrlbarTestUtils.withContextMenu(window, popup => {
      Assert.ok(
        popup.querySelector(".share-mac-picker-item").hasAttribute("disabled"),
        "Share is disabled for an unshareable URL"
      );
      Assert.ok(
        popup.querySelector(".share-qrcode-item").hasAttribute("disabled"),
        "Create QR Code is disabled for an unshareable URL"
      );
    });
  });
  await SpecialPowers.popPrefEnv();
});
