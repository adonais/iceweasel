/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const BASE = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const TEST_URL = BASE + "browser_shareurl.html";

let shareUrlWithPickerSpy = sinon.spy();
// Latest raw XPCOM arguments so tests can invoke handlers on the underlying
// objects (`.handler.handle()`), which the sinon spy strips down to POJOs.
let lastArgs = null;

const mockMacSharingService = MockRegistrar.register(
  "@mozilla.org/widget/macsharingservice;1",
  {
    shareUrlWithPicker(
      anchor,
      urls,
      titles,
      shareTitle,
      customItems,
      copyItem
    ) {
      lastArgs = { anchor, urls, titles, shareTitle, customItems, copyItem };
      shareUrlWithPickerSpy(
        anchor,
        Array.from(urls),
        Array.from(titles),
        shareTitle,
        Array.from(customItems).map(i => ({ label: i.label, icon: i.icon })),
        copyItem ? { label: copyItem.label, icon: copyItem.icon } : null
      );
    },
    QueryInterface: ChromeUtils.generateQI([Ci.nsIMacSharingService]),
  }
);

registerCleanupFunction(function () {
  MockRegistrar.unregister(mockMacSharingService);
});

function resetSpy() {
  shareUrlWithPickerSpy.resetHistory();
  lastArgs = null;
}

add_setup(async function () {
  // Place the share button in the nav bar so it is always instantiated in the
  // DOM and directly clickable, without needing to open the overflow panel.
  CustomizableUI.addWidgetToArea(
    "share-tab-button",
    CustomizableUI.AREA_NAVBAR
  );
  registerCleanupFunction(() => CustomizableUI.reset());
});

add_task(async function test_button_exists() {
  let shareTabButton = document.getElementById("share-tab-button");
  Assert.ok(shareTabButton, "Share tab button exists in the nav bar");
  Assert.ok(
    shareTabButton.classList.contains("share-toolbar-picker"),
    "Button carries the share-toolbar-picker class on macOS"
  );
  Assert.ok(
    !shareTabButton.hasAttribute("type"),
    "Button is not a menu-type button on macOS (no submenu popup)"
  );
});

add_task(async function test_share_button_invokes_picker() {
  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    resetSpy();
    document.getElementById("share-tab-button").doCommand();

    await TestUtils.waitForCondition(
      () => shareUrlWithPickerSpy.calledOnce,
      "shareUrlWithPicker was called"
    );

    let [anchor, urls, titles, shareTitle, , copyItem] =
      shareUrlWithPickerSpy.getCall(0).args;
    is(anchor.id, "share-tab-button", "anchor is the toolbar button");
    Assert.deepEqual(urls, [TEST_URL], "urls contains the current tab URL");
    is(titles[0], "Sharing URL", "titles contains the current tab title");
    is(shareTitle, "Sharing URL", "shareTitle matches the tab title");
    ok(copyItem, "copyItem is provided");
    ok(copyItem.label, "copyItem has a non-empty label");
  });
});

add_task(async function test_qr_custom_item_present_when_pref_on() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.shareqrcode.enabled", true]],
  });
  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    resetSpy();
    document.getElementById("share-tab-button").doCommand();
    await TestUtils.waitForCondition(
      () => shareUrlWithPickerSpy.calledOnce,
      "shareUrlWithPicker was called"
    );
    let customItems = shareUrlWithPickerSpy.getCall(0).args[4];
    is(customItems.length, 1, "one custom item when QR pref is on");
    ok(customItems[0].label, "QR custom item has a non-empty label");
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_qr_custom_item_absent_when_pref_off() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.shareqrcode.enabled", false]],
  });
  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    resetSpy();
    document.getElementById("share-tab-button").doCommand();
    await TestUtils.waitForCondition(
      () => shareUrlWithPickerSpy.calledOnce,
      "shareUrlWithPicker was called"
    );
    let customItems = shareUrlWithPickerSpy.getCall(0).args[4];
    is(customItems.length, 0, "no custom items when QR pref is off");
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_copy_item_writes_url_to_clipboard() {
  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    resetSpy();
    document.getElementById("share-tab-button").doCommand();
    await TestUtils.waitForCondition(
      () => lastArgs !== null,
      "copyItem captured"
    );
    ok(lastArgs.copyItem, "copyItem present");
    await SimpleTest.promiseClipboardChange(TEST_URL, () => {
      lastArgs.copyItem.handler.handle();
    });
  });
});
