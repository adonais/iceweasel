/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test TrustPanel.
 */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ContentBlockingAllowList:
    "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
});

const ETP_ACTIVE_ICON = 'url("chrome://browser/skin/trust-icon-active.svg")';
const ETP_DISABLED_ICON =
  'url("chrome://browser/skin/trust-icon-disabled.svg")';

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.scotchBonnet.enableOverride", true],
      ["browser.urlbar.trustPanel.featureGate", true],
    ],
  });
  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
  });
});

let urlbarBtn = win => win.document.getElementById("trust-icon");
let urlbarLabel = win => win.document.getElementById("trust-label");
let urlbarIcon = win =>
  gBrowser.ownerGlobal
    .getComputedStyle(urlbarBtn(win))
    .getPropertyValue("list-style-image");

async function toggleETP(tab) {
  let popupShown = BrowserTestUtils.waitForEvent(window.document, "popupshown");
  EventUtils.synthesizeMouseAtCenter(urlbarBtn(window), {}, window);
  await popupShown;

  let waitForReload = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  EventUtils.synthesizeMouseAtCenter(
    window.document.getElementById("trustpanel-toggle"),
    {},
    window
  );
  await waitForReload;
}

add_task(async function basic_test() {
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "https://example.com",
    waitForLoad: true,
  });

  await BrowserTestUtils.waitForCondition(() => urlbarIcon(window) != "none");

  Assert.equal(urlbarIcon(window), ETP_ACTIVE_ICON, "Showing trusted icon");
  Assert.ok(
    !BrowserTestUtils.isVisible(urlbarLabel(window)),
    "Not showing Not Secure label"
  );

  await toggleETP(tab);
  Assert.equal(
    urlbarIcon(window),
    ETP_DISABLED_ICON,
    "Showing ETP disabled icon"
  );

  await toggleETP(tab);
  Assert.equal(urlbarIcon(window), ETP_ACTIVE_ICON, "Showing trusted icon");

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_notsecure_label() {
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    // eslint-disable-next-line @microsoft/sdl/no-insecure-url
    opening: "http://example.com",
    waitForLoad: true,
  });

  await BrowserTestUtils.waitForCondition(() => urlbarIcon(window) != "none");

  Assert.ok(
    BrowserTestUtils.isVisible(urlbarLabel(window)),
    "Showing Not Secure label"
  );

  await BrowserTestUtils.removeTab(tab);
});
