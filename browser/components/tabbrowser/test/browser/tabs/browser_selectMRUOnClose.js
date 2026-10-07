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

// browserLoaded() only waits for a *future* load event, so callers must
// capture `loadedPromise` right after creating the tab, before any other
// awaits let the load complete and the event get missed.
async function discardTab(tab, loadedPromise) {
  await loadedPromise;
  await gBrowser.prepareDiscardBrowser(tab);
  gBrowser.discardBrowser(tab, true);
  ok(
    tab.hasAttribute("discarded"),
    "tab should be marked discarded after being explicitly unloaded"
  );
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

add_task(async function test_successor_wins_even_if_unloaded() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, false]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/1");
  const successorTab = BrowserTestUtils.addTab(
    gBrowser,
    "https://example.com/2"
  );
  const successorTabLoaded = BrowserTestUtils.browserLoaded(
    successorTab.linkedBrowser
  );
  const loadedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/3");

  await selectAndYield(closedTab);
  gBrowser.setSuccessor(closedTab, successorTab);

  // an unloaded successor should still be selected over a loaded tab.
  await discardTab(successorTab, successorTabLoaded);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    successorTab,
    "Explicit successor still wins even though it's unloaded"
  );

  BrowserTestUtils.removeTab(successorTab);
  BrowserTestUtils.removeTab(loadedTab);
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

add_task(async function test_pref_off_falls_back_to_adjacent_loaded() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, false]] });

  const firstTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/1");
  const closedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/2");
  const unloadedTab = BrowserTestUtils.addTab(
    gBrowser,
    "https://example.com/3"
  );
  const unloadedTabLoaded = BrowserTestUtils.browserLoaded(
    unloadedTab.linkedBrowser
  );

  await discardTab(unloadedTab, unloadedTabLoaded);

  await selectAndYield(closedTab);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    firstTab,
    "Without MRU, closing the active tab selects the adjacent loaded tab, skipping the unloaded one"
  );

  BrowserTestUtils.removeTab(firstTab);
  BrowserTestUtils.removeTab(unloadedTab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_pref_on_falls_back_to_loaded_when_mru_unloaded() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, true]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/1");
  const loadedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/2");
  const mruTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/3");
  const mruTabLoaded = BrowserTestUtils.browserLoaded(mruTab.linkedBrowser);

  await selectAndYield(loadedTab);
  await selectAndYield(mruTab);
  await selectAndYield(closedTab);
  await discardTab(mruTab, mruTabLoaded);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    loadedTab,
    "With MRU pref on, an unloaded MRU tab is skipped in favor of a loaded tab"
  );

  BrowserTestUtils.removeTab(loadedTab);
  BrowserTestUtils.removeTab(mruTab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_falls_back_past_multiple_unloaded_tabs() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, false]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/1");
  const unloadedTab1 = BrowserTestUtils.addTab(
    gBrowser,
    "https://example.com/2"
  );
  const unloadedTab1Loaded = BrowserTestUtils.browserLoaded(
    unloadedTab1.linkedBrowser
  );
  const unloadedTab2 = BrowserTestUtils.addTab(
    gBrowser,
    "https://example.com/3"
  );
  const unloadedTab2Loaded = BrowserTestUtils.browserLoaded(
    unloadedTab2.linkedBrowser
  );
  const loadedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/4");

  await discardTab(unloadedTab1, unloadedTab1Loaded);
  await discardTab(unloadedTab2, unloadedTab2Loaded);

  await selectAndYield(closedTab);

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    loadedTab,
    "Closing a tab skips over multiple consecutive unloaded tabs to reach a loaded one"
  );

  BrowserTestUtils.removeTab(unloadedTab1);
  BrowserTestUtils.removeTab(unloadedTab2);
  BrowserTestUtils.removeTab(loadedTab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_pending_but_not_discarded_tab_is_not_skipped() {
  await SpecialPowers.pushPrefEnv({ set: [[MRU_PREF, false]] });

  const closedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/1");
  const pendingTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/2");
  const loadedTab = BrowserTestUtils.addTab(gBrowser, "https://example.com/3");

  await selectAndYield(closedTab);

  pendingTab.setAttribute("pending", "true");
  ok(
    !pendingTab.hasAttribute("discarded"),
    "pendingTab was never explicitly unloaded"
  );

  BrowserTestUtils.removeTab(closedTab);
  is(
    gBrowser.selectedTab,
    pendingTab,
    "A tab that is pending restoration but wasn't explicitly unloaded should not be skipped"
  );

  pendingTab.removeAttribute("pending");
  BrowserTestUtils.removeTab(pendingTab);
  BrowserTestUtils.removeTab(loadedTab);
  await SpecialPowers.popPrefEnv();
});
