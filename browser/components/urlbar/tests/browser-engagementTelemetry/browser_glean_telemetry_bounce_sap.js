/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test for the following data of bounce telemetry.
// - sap

const { Interactions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/places/Interactions.sys.mjs"
);

add_setup(async function () {
  await initSapTest();

  // A bounce is recorded only when Interactions reports that the page the
  // engagement loaded was viewed for less than the bounce threshold. The stub
  // resolves the interaction when the bounce triggers, so it always falls within
  // the tracked window.
  sinon
    .stub(Interactions, "getRecentInteractionsForBrowser")
    .callsFake(() => [{ created_at: Date.now(), totalViewTime: 1000 }]);

  registerCleanupFunction(function () {
    sinon.restore();
  });
});

/**
 * Navigates back to the given page, which triggers the bounce of the search that
 * loaded the current one.
 *
 * @param {Window} win
 *   The browser window the search happened in.
 * @param {string} uri
 *   The page to navigate back to.
 */
async function navigateBack(win, uri) {
  const onLocationChange = BrowserTestUtils.waitForLocationChange(
    win.gBrowser,
    uri
  );
  win.gBrowser.goBack();
  await onLocationChange;
}

/**
 * Engages with the current search, then navigates back to the page the search
 * started from.
 *
 * @param {Window} win
 *   The browser window the search happened in.
 * @param {Function} engage
 *   Engages with the current search, loading a page.
 */
async function doEngagementAndNavigateBack(win, engage) {
  const startURI = win.gBrowser.selectedBrowser.currentURI.spec;
  await engage();
  await navigateBack(win, startURI);
}

/**
 * Engages with the second of two searches, which bounces the first one, then
 * navigates back to the first one's page, which bounces the second one.
 *
 * The wait for the first bounce is required on the message path, where it is
 * recorded after a round trip that the second search's bounce tracking waits
 * for.
 *
 * @param {Window} win
 *   The browser window the searches happened in.
 * @param {string} sap
 *   The expected sap of both bounces.
 */
async function doSecondEngagementAndNavigateBack(win, sap) {
  const startURI = win.gBrowser.selectedBrowser.currentURI.spec;
  await doEnter({}, win);
  await assertBounceTelemetry([{ sap }]);
  await navigateBack(win, startURI);
}

// This doesn't use doUrlbarNewTabTest() because the initial about:blank of a new
// tab is replaced in session history by the page the engagement loads, leaving
// nothing to navigate back to.
add_task(async function urlbar_newtab() {
  await doTest(async function () {
    const browser = gBrowser.selectedBrowser;
    BrowserTestUtils.startLoadingURIString(browser, "about:newtab");
    await BrowserTestUtils.browserLoaded(browser, false, "about:newtab");

    await openPopup("x");
    await doEngagementAndNavigateBack(window, () => doEnter());
    await assertBounceTelemetry([{ sap: "urlbar_newtab" }]);
  });
});

add_task(async function urlbar() {
  await doUrlbarTest({
    trigger: win => doSecondEngagementAndNavigateBack(win, "urlbar"),
    assert: () => assertBounceTelemetry([{ sap: "urlbar" }, { sap: "urlbar" }]),
  });
});

add_task(async function searchbar() {
  await doSearchbarTest({
    trigger: win => doSecondEngagementAndNavigateBack(win, "searchbar"),
    assert: () =>
      assertBounceTelemetry([{ sap: "searchbar" }, { sap: "searchbar" }]),
  });
});

// A handoff session searches in engine search mode, where pressing Enter loads
// the engine's search URL directly without picking a result, and only picking a
// result starts tracking a bounce.
add_task(async function handoff() {
  await doHandoffTest({
    trigger: win => doEngagementAndNavigateBack(win, () => doClick()),
    assert: () => assertBounceTelemetry([{ sap: "handoff" }]),
  });
});

add_task(async function urlbar_addonpage() {
  await doUrlbarAddonpageTest({
    trigger: win => doEngagementAndNavigateBack(win, () => doEnter({}, win)),
    assert: () => assertBounceTelemetry([{ sap: "urlbar_addonpage" }]),
  });
});
