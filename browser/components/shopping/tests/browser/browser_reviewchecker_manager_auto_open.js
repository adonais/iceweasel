/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ShoppingUtils: "resource:///modules/ShoppingUtils.sys.mjs",
  ReviewCheckerManager: "resource:///modules/ReviewCheckerManager.sys.mjs",
});

const ACTIVE_PREF = "browser.shopping.experience2023.active";
const AUTO_OPEN_ENABLED_PREF =
  "browser.shopping.experience2023.autoOpen.enabled";
const AUTO_OPEN_USER_ENABLED_PREF =
  "browser.shopping.experience2023.autoOpen.userEnabled";

function assertSidebarState(isOpen) {
  let { SidebarController } = window;
  let rcSidebarPanelOpen =
    SidebarController.isOpen &&
    SidebarController.currentID == "viewReviewCheckerSidebar";
  Assert.equal(isOpen, rcSidebarPanelOpen);
}

async function testSidebarAutoOpen(testURL, isOpen) {
  let shownPromise =
    isOpen && BrowserTestUtils.waitForEvent(window, "SidebarShown");
  await BrowserTestUtils.withNewTab(testURL, async () => {
    if (isOpen) {
      // If we should be opening the sidebar, wait for it to have
      // sent a shown event.
      await shownPromise;
    } else {
      // Otherwise if nothing will be shown, wait a turn for the
      // change to propagate.
      await TestUtils.waitForTick();
    }

    // Finally, assert the sidebar has the expected open state.
    assertSidebarState(isOpen);

    // Clean up any opened sidebar tools.
    SidebarController.hide();
  });
}

async function clickCloseButton() {
  await withReviewCheckerSidebar(async () => {
    const { ContentTaskUtils } = ChromeUtils.importESModule(
      "resource://testing-common/ContentTaskUtils.sys.mjs"
    );
    let shoppingContainer = await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector("shopping-container")?.wrappedJSObject,
      "Review Checker is loaded."
    );
    let closeButtonEl = await ContentTaskUtils.waitForCondition(
      () => shoppingContainer.closeButtonEl,
      "close button is present."
    );
    closeButtonEl.click();
  });
}

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["browser.shopping.experience2023.integratedSidebar", true],
      ["browser.shopping.experience2023.enabled", false],
      ["sidebar.main.tools", "aichat,reviewchecker,syncedtabs,history"],
      ["toolkit.shopping.ohttpRelayURL", ""],
      ["toolkit.shopping.ohttpConfigURL", ""],
    ],
  });
  registerCleanupFunction(async () => {
    SidebarController.hide();
  });
});

add_task(async function test_auto_open_rc_sidebar() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
    ],
  });

  await testSidebarAutoOpen(PRODUCT_TEST_URL, true);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_no_auto_open_for_supported_site() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
    ],
  });

  await testSidebarAutoOpen(SUPPORTED_SITE_URL, false);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_open_disabled_rc_sidebar() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", false],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
    ],
  });

  await testSidebarAutoOpen(PRODUCT_TEST_URL, false);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_open_user_disabled_rc_sidebar() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", false],
    ],
  });

  await testSidebarAutoOpen(PRODUCT_TEST_URL, false);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_open_not_opted_in_rc_sidebar() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 0],
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
      ["browser.shopping.experience2023.autoActivateCount", 1],
    ],
  });

  await testSidebarAutoOpen(PRODUCT_TEST_URL, false);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_open_rc_sidebar_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
      ["sidebar.main.tools", "aichat,syncedtabs,history"],
    ],
  });

  await testSidebarAutoOpen(PRODUCT_TEST_URL, false);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_open_rc_sidebar_other_panel_open() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
    ],
  });

  await SidebarController.show("viewHistorySidebar");

  await testSidebarAutoOpen(PRODUCT_TEST_URL, false);

  SidebarController.hide();

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_open_on_tab_switch() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
    ],
  });

  let shownPromise = BrowserTestUtils.waitForEvent(window, "SidebarShown");

  await BrowserTestUtils.withNewTab(PRODUCT_TEST_URL, async function (browser) {
    // Wait for the sidebar to auto-open for this tab.
    await shownPromise;

    assertSidebarState(true);

    // Add a new tab
    let newProductTab = BrowserTestUtils.addTab(
      gBrowser,
      OTHER_PRODUCT_TEST_URL
    );
    let newProductBrowser = newProductTab.linkedBrowser;
    await BrowserTestUtils.browserLoaded(
      newProductBrowser,
      false,
      OTHER_PRODUCT_TEST_URL
    );

    // Hide the sidebar.
    await clickCloseButton();

    shownPromise = BrowserTestUtils.waitForEvent(window, "SidebarShown");

    await BrowserTestUtils.switchTab(gBrowser, newProductTab);

    // Wait for the sidebar to show again.
    await shownPromise;

    assertSidebarState(true);

    // Close the sidebar again.
    await clickCloseButton();

    // Switch back to the first tab.
    let firstTab = gBrowser.getTabForBrowser(browser);
    await BrowserTestUtils.switchTab(gBrowser, firstTab);

    // Wait a turn for the change to propagate to make sure nothing is shown.
    await TestUtils.waitForTick();

    assertSidebarState(false);

    await BrowserTestUtils.removeTab(newProductTab);
  });

  await SpecialPowers.popPrefEnv();
});

/* Tests that the sidebar stays open when navigating to an unsupported site
 *  within the same tab with auto-open disabled
 */

add_task(async function test_auto_open_disabled_unsupported_site_rc_sidebar() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.optedIn", 1],
      ["browser.shopping.experience2023.autoOpen.enabled", TreeColumn],
      ["browser.shopping.experience2023.autoOpen.userEnabled", false],
    ],
  });

  await BrowserTestUtils.withNewTab(PRODUCT_TEST_URL, async function (browser) {
    await SidebarController.show("viewReviewCheckerSidebar");
    ok(SidebarController.isOpen, "Sidebar is open");

    // Navigate to a new supported site URL:
    BrowserTestUtils.startLoadingURIString(browser, "about:newtab");
    await BrowserTestUtils.browserLoaded(browser);

    ok(SidebarController.isOpen, "Sidebar should be open");
  });

  SidebarController.hide();

  await SpecialPowers.popPrefEnv();
});

/* Tests that the sidebar will re-open when switching back to a product page tab switch
 * after the sidebar was auto-closed on a different unsupported tab.
 */
add_task(async function test_auto_open_on_tab_switch_to_unsupported_site() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.shopping.experience2023.autoOpen.enabled", true],
      ["browser.shopping.experience2023.autoOpen.userEnabled", true],
      ["browser.shopping.experience2023.autoClose.userEnabled", true],
    ],
  });

  SidebarController.hide();

  let shownPromise = BrowserTestUtils.waitForEvent(window, "SidebarShown");

  await BrowserTestUtils.withNewTab(PRODUCT_TEST_URL, async function (browser) {
    // Wait for the sidebar to auto-open for this tab.
    await shownPromise;

    assertSidebarState(true);

    // Add an unsupported tab
    let unsupportedTab = BrowserTestUtils.addTab(gBrowser, "about:newtab");
    await BrowserTestUtils.switchTab(gBrowser, unsupportedTab);

    assertSidebarState(false);

    // Switch back to the first tab.
    let firstTab = gBrowser.getTabForBrowser(browser);
    shownPromise = BrowserTestUtils.waitForEvent(window, "SidebarShown");

    await BrowserTestUtils.switchTab(gBrowser, firstTab);

    // Wait for the sidebar to show again.
    await shownPromise;

    assertSidebarState(true);

    await BrowserTestUtils.removeTab(unsupportedTab);
  });

  SidebarController.hide();

  await SpecialPowers.popPrefEnv();
});
