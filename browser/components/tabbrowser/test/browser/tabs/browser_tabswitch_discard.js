/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Discarding a background tab while the async tab switcher is alive must not
 * leave the switcher with stale state for that tab, or the next switch to the
 * tab finishes before it has painted and leaves its browser blank.
 */
add_task(async function test_discard_during_tab_switch() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  await TestUtils.waitForCondition(
    () => !gBrowser._switcher,
    "Waiting for the tab switch to settle"
  );

  let otherTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    ownerTab: tab,
  });
  gBrowser.selectedTab = otherTab;
  ok(
    gBrowser._switcher,
    "The switcher is alive while the previous tab awaits unloading"
  );
  ok(gBrowser.discardBrowser(tab, true), "The background tab was discarded");
  ok(!tab.linkedPanel, "The discarded tab has a lazy browser");
  ok(
    !gBrowser._switcher ||
      gBrowser._switcher.getTabState(tab) == gBrowser._switcher.STATE_UNLOADED,
    "The switcher no longer tracks the discarded tab as loaded"
  );

  // Closing the owned tab selects the discarded tab again, and leaves the
  // switcher with nothing to wait for besides that tab's reloaded browser.
  let switchDone = BrowserTestUtils.waitForEvent(gBrowser, "TabSwitchDone");
  BrowserTestUtils.removeTab(otherTab, { skipPermitUnload: true });
  is(gBrowser.selectedTab, tab, "The discarded tab is selected again");
  await switchDone;
  ok(
    !tab.linkedBrowser.hasAttribute("blank"),
    "The reloaded tab's browser is not left blank"
  );

  BrowserTestUtils.removeTab(tab);
});
