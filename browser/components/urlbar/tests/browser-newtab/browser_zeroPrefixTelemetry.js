/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab address bar's zero-prefix view counts into the `newtab_searchbar`
// label of the urlbar.zeroprefix2 counters. The view lives in a content process,
// so the counters travel over Glean's IPC.

"use strict";

const METRICS = ["abandonment", "engagement", "exposure"];

add_setup(async function () {
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
  // A recent search, so the zero-prefix query has something to show and the
  // view opens the way it does for a user who has searched before.
  await NewtabSearchbarTestUtils.formHistory.add(["a recent search"]);
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
});

add_task(async function abandonment() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await showZeroPrefix(browser);
  await checkCounters({ exposure: 1 });

  await NewtabSearchbarTestUtils.blur(browser);
  await NewtabSearchbarTestUtils.waitForViewClosed(browser);
  await checkCounters({ abandonment: 1 });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function engagement() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await showZeroPrefix(browser);
  await checkCounters({ exposure: 1 });

  let loaded = BrowserTestUtils.browserLoaded(browser);
  await BrowserTestUtils.synthesizeKey("KEY_ArrowDown", {}, browser);
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  await loaded;
  await checkCounters({ engagement: 1 });

  BrowserTestUtils.removeTab(tab);
});

// A search that isn't zero prefix counts into nothing.
add_task(async function notZeroPrefix() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: "a recent",
  });
  await NewtabSearchbarTestUtils.blur(browser);
  await NewtabSearchbarTestUtils.waitForViewClosed(browser);
  await checkCounters({});

  BrowserTestUtils.removeTab(tab);
});

async function showZeroPrefix(browser) {
  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: "",
  });

  Assert.greater(
    await NewtabSearchbarTestUtils.getResultCount(browser),
    0,
    "There should be at least one row in the zero prefix view"
  );
}

/**
 * Asserts the counters recorded since the previous call and resets them.
 *
 * @param {object} expected
 *   Maps metric names to the value expected under the `newtab_searchbar`
 *   label. Metrics left out are expected not to have been recorded at all.
 */
async function checkCounters(expected) {
  await Services.fog.testFlushAllChildren();
  for (let metric of METRICS) {
    Assert.strictEqual(
      Glean.urlbarZeroprefix2[metric].newtab_searchbar.testGetValue(),
      expected[metric] ?? null,
      `urlbar.zeroprefix2.${metric}["newtab_searchbar"]`
    );
  }
  Services.fog.testResetFOG();
}
