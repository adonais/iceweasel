/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab search bar's page is gone by the time the tab navigates back or
// closes, so its bounce is tracked parent-side and triggered from the chrome
// window's address bar.

"use strict";

const { Interactions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/places/Interactions.sys.mjs"
);

// The view time below which a navigation away counts as a bounce.
const MAX_VIEW_TIME_SECONDS = 10;

// What the stubbed `Interactions` reports the results page was viewed for, so
// the bounce doesn't hinge on how long the page happens to take.
let viewTime = (MAX_VIEW_TIME_SECONDS / 2) * 1000;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.urlbar.events.bounce.maxSecondsFromLastSearch",
        MAX_VIEW_TIME_SECONDS,
      ],
    ],
  });
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });

  sinon
    .stub(Interactions, "getRecentInteractionsForBrowser")
    .callsFake(() => [{ created_at: Date.now(), totalViewTime: viewTime }]);

  registerCleanupFunction(function () {
    sinon.restore();
  });
});

add_telemetry_task(async function test_bounce_back_button(browser) {
  await doSearch(browser);
  await doEnter(browser);
  await assertEngagementTelemetry([{ sap: "newtab_searchbar" }]);

  await goBack();

  await assertBounceTelemetry([{ sap: "newtab_searchbar" }]);
});

add_telemetry_task(async function test_bounce_tab_close(browser) {
  await doSearch(browser);
  await doEnter(browser);
  await assertEngagementTelemetry([{ sap: "newtab_searchbar" }]);

  BrowserTestUtils.removeTab(gBrowser.getTabForBrowser(browser));

  await assertBounceTelemetry([{ sap: "newtab_searchbar" }]);
});

// Staying on the results page is what the probe measures the absence of.
add_telemetry_task(async function test_no_bounce(browser) {
  viewTime = MAX_VIEW_TIME_SECONDS * 2 * 1000;
  registerCleanupFunction(function () {
    viewTime = (MAX_VIEW_TIME_SECONDS / 2) * 1000;
  });

  await doSearch(browser);
  await doEnter(browser);
  await assertEngagementTelemetry([{ sap: "newtab_searchbar" }]);

  await goBack();
  await Interactions.interactionUpdatePromise;

  await assertBounceTelemetry([]);
});

async function goBack() {
  let onLocationChange = BrowserTestUtils.waitForLocationChange(
    gBrowser,
    "about:newtab"
  );
  gBrowser.goBack();
  await onLocationChange;
}
