/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
/* eslint-disable mozilla/no-arbitrary-setTimeout */

"use strict";

const MRU_PREF = "browser.tabs.selectMRUOnClose";
const OWNER_PREF = "browser.tabs.selectOwnerOnClose";

// lastAccessed is derived from Date.now(), ensure enough time elapses between
// tab switches
const STEP_MS = 10;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function selectAndYield(tab) {
  await BrowserTestUtils.switchTab(gBrowser, tab);
  await wait(STEP_MS);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.reduceTimerPrecision", false]],
  });
});

add_task(async function test_pref_off_falls_back_to_adjacent() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, false]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const adjacentTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const mruTab = BrowserTestUtils.addTab(gBrowser, "about:blank");

  await selectAndYield(adjacentTab);
  await selectAndYield(mruTab);
  await selectAndYield(closedTab);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    adjacentTab,
    "Without MRU, closing the active tab selects the adjacent tab"
  );

  BrowserTestUtils.removeTab(adjacentTab);
  BrowserTestUtils.removeTab(mruTab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_pref_on_selects_mru_tab() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, true]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const adjacentTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const mruTab = BrowserTestUtils.addTab(gBrowser, "about:blank");

  await selectAndYield(adjacentTab);
  await selectAndYield(mruTab);
  await selectAndYield(closedTab);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    mruTab,
    "With MRU pref on, closing the active tab selects the most-recently-used tab"
  );

  BrowserTestUtils.removeTab(adjacentTab);
  BrowserTestUtils.removeTab(mruTab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_successor_still_wins_over_mru() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, true]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const successorTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const mruTab = BrowserTestUtils.addTab(gBrowser, "about:blank");

  await selectAndYield(mruTab);
  await selectAndYield(closedTab);
  gBrowser.setSuccessor(closedTab, successorTab);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    successorTab,
    "Explicit successor still wins over MRU selection"
  );

  BrowserTestUtils.removeTab(successorTab);
  BrowserTestUtils.removeTab(mruTab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_owner_still_wins_over_mru() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [MRU_PREF, true],
      [OWNER_PREF, true],
    ],
  });

  const ownerTab = gBrowser.selectedTab;
  const mruTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  await selectAndYield(mruTab);
  await selectAndYield(ownerTab);
  const childTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    ownerTab,
  });
  await selectAndYield(childTab);

  BrowserTestUtils.removeTab(childTab);
  is(gBrowser.selectedTab, ownerTab, "Owner selection still wins over MRU");

  BrowserTestUtils.removeTab(mruTab);
  await SpecialPowers.popPrefEnv();
});
