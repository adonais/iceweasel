/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { UrlClassifierTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlClassifierTestUtils.sys.mjs"
);

const TRACKING_PAGE =
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  "http://tracking.example.org/browser/browser/base/content/test/protectionsUI/trackingPage.html";
const BENIGN_PAGE =
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  "http://tracking.example.org/browser/browser/base/content/test/protectionsUI/benignPage.html";
const NOTIFICATION_VALUE = "reduced-protection-reload";

function getNotification(browser) {
  let notificationBox = gBrowser.getNotificationBox(browser);
  return notificationBox.getNotificationWithValue(NOTIFICATION_VALUE);
}

function waitForContentBlockingEvent() {
  return new Promise(resolve => {
    let listener = {
      onContentBlockingEvent(webProgress, request, event) {
        if (event & Ci.nsIWebProgressListener.STATE_BLOCKED_TRACKING_CONTENT) {
          gBrowser.removeProgressListener(listener);
          resolve();
        }
      },
    };
    gBrowser.addProgressListener(listener);
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.enabled", true],
      ["privacy.reducePageProtection.infobar.enabled.pbmode", true],
    ],
  });

  await UrlClassifierTestUtils.addTestTrackers();

  registerCleanupFunction(() => {
    UrlClassifierTestUtils.cleanupTestTrackers();
  });
});

// The infobar must NOT appear on initial navigation (first load).
add_task(async function test_no_infobar_on_first_load() {
  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  // Wait a tick for any async notification logic.
  await TestUtils.waitForTick();

  let notification = getNotification(tab.linkedBrowser);
  ok(!notification, "No infobar on first load of a page with trackers");

  BrowserTestUtils.removeTab(tab);
});

// The infobar appears after reloading a page that had blocked trackers.
add_task(async function test_infobar_on_reload() {
  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  info("Reloading to trigger the infobar");
  let loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;

  let notification = await TestUtils.waitForCondition(
    () => getNotification(tab.linkedBrowser),
    "Waiting for reduced protection notification to appear"
  );
  ok(
    notification,
    "Infobar appears after reload with previously blocked trackers"
  );

  BrowserTestUtils.removeTab(tab);
});

// The infobar does NOT appear when navigating to a new page
add_task(async function test_no_infobar_on_navigation() {
  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  info("Navigating to a different page (not reloading)");
  let loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, BENIGN_PAGE);
  await loadedPromise;

  await TestUtils.waitForTick();

  let notification = getNotification(tab.linkedBrowser);
  ok(!notification, "No infobar on address-bar navigation");

  BrowserTestUtils.removeTab(tab);
});

// Clicking the "Reload with reduced protection" button disables TP via
// ScopedPrefs and reloads the page so trackers are no longer blocked.
add_task(async function test_button_disables_tp_and_reloads() {
  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  info("Reloading to trigger the infobar");
  let loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;

  let notification = await TestUtils.waitForCondition(
    () => getNotification(tab.linkedBrowser),
    "Waiting for reduced protection notification"
  );
  ok(notification, "Infobar appeared");

  info("Clicking the reload button on the infobar");
  let reloadPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let button = notification.buttonContainer.querySelector("button");
  button.click();
  await reloadPromise;

  // After the button-triggered reload, TP should be disabled for this site
  // in this tab. The shield should not be active.
  let isActive =
    gBrowser.ownerGlobal.gProtectionsHandler.iconBox.hasAttribute("active");
  ok(!isActive, "Shield is not active: TP disabled via ScopedPrefs");

  BrowserTestUtils.removeTab(tab);
});

// After the infobar is shown for a host, it should not reappear for that host
// on subsequent reloads (dismissed-hosts tracking).
add_task(async function test_no_reappear_after_dismiss() {
  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  info("Reloading to trigger the infobar for the first time");
  let loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;

  await TestUtils.waitForCondition(
    () => getNotification(tab.linkedBrowser),
    "Waiting for the first notification"
  );

  info("Reloading again - infobar should not reappear for this host");
  blockingPromise = waitForContentBlockingEvent();
  loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;
  await blockingPromise;

  // Give async showNotification time to run (or not).
  await TestUtils.waitForTick();

  let notification = getNotification(tab.linkedBrowser);
  ok(!notification, "Infobar does not reappear for the same host");

  BrowserTestUtils.removeTab(tab);
});

// After an address-bar navigation (LOAD_CMD_NORMAL), the dismissed-hosts set
// should be cleared, so the infobar can appear again on the next reload.
add_task(async function test_dismissal_resets_on_navigation() {
  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  info("Reload to trigger and dismiss the infobar");
  let loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;

  await TestUtils.waitForCondition(
    () => getNotification(tab.linkedBrowser),
    "Waiting for notification to appear"
  );

  info("Navigate away via address bar");
  loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, BENIGN_PAGE);
  await loadedPromise;

  info("Navigate back to the tracking page");
  blockingPromise = waitForContentBlockingEvent();
  loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, TRACKING_PAGE);
  await loadedPromise;
  await blockingPromise;

  info("Reload again - infobar should appear because dismissal was reset");
  loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;

  let notification = await TestUtils.waitForCondition(
    () => getNotification(tab.linkedBrowser),
    "Waiting for notification after dismissal reset"
  );
  ok(notification, "Infobar reappears after address-bar navigation reset");

  BrowserTestUtils.removeTab(tab);
});

// The infobar should not appear when the feature pref is disabled.
add_task(async function test_pref_gating() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.reducePageProtection.infobar.enabled.pbmode", false]],
  });

  let blockingPromise = waitForContentBlockingEvent();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TRACKING_PAGE
  );
  await blockingPromise;

  let loadedPromise = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
  await loadedPromise;

  await TestUtils.waitForTick();

  let notification = getNotification(tab.linkedBrowser);
  ok(!notification, "No infobar when the feature pref is disabled");

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
