/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

// Replacing a browser's frameloader must carry the old one's layer state over
// to the new one and report the old layers cleared, or the tab switcher waits
// forever for a layer tree that will never be sent or cleared (bug 2071626).

const TEST_URL = "https://example.com/";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.remote.warmup.enabled", true]],
  });
});

// The switcher finishes only once every other tab has unloaded, which can
// take longer under load than a polling wait allows for.
async function waitForTabSwitchDone() {
  if (gBrowser._switcher) {
    await BrowserTestUtils.waitForEvent(gBrowser, "TabSwitchDone");
  }
}

// A warmed tab carries renderLayers without an active docShell, a combination
// the new frameloader has to inherit.
add_task(async function remotenessChangeWhileWarming() {
  let tab = BrowserTestUtils.addTab(gBrowser, TEST_URL, {
    skipAnimation: true,
  });
  let browser = tab.linkedBrowser;
  await BrowserTestUtils.browserLoaded(browser, false, TEST_URL);

  ok(!document.hidden, "The window is visible, so the tab can be warmed.");
  gBrowser.warmupTab(tab);

  let switcher = gBrowser._switcher;
  ok(switcher, "The tab switcher is running.");
  is(
    switcher.getTabState(tab),
    switcher.STATE_LOADING,
    "The warmed tab is in STATE_LOADING."
  );
  ok(browser.renderLayers, "The warmed tab renders layers.");
  ok(!browser.docShellIsActive, "The warmed tab's docShell is inactive.");

  let changed = gBrowser.updateBrowserRemoteness(browser, {
    remoteType: E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE,
  });
  ok(changed, "The browser got a new frameloader.");

  is(
    switcher.getTabState(tab),
    switcher.STATE_LOADING,
    "The tab is still in STATE_LOADING after the remoteness change."
  );
  ok(
    !browser.docShellIsActive,
    "The tab still counts as warming, so its docShell stays inactive."
  );
  let asksForLayers = browser.renderLayers;
  ok(asksForLayers, "The new frameloader is asked for layers.");
  if (!asksForLayers) {
    // The switch below can never complete, so report the failure above rather
    // than hang until the harness times the test out.
    BrowserTestUtils.removeTab(tab);
    return;
  }

  await BrowserTestUtils.switchTab(gBrowser, tab);
  is(gBrowser.selectedTab, tab, "The tab is selected.");

  // The switcher activates the docShell once the new frameloader has sent up
  // its layers, so this is what says the switch got that far.
  await TestUtils.waitForCondition(
    () => browser.docShellIsActive,
    "Waiting for the selected tab's docShell to be activated."
  );
  ok(browser.hasLayers, "The selected tab has layers.");

  BrowserTestUtils.removeTab(tab);
});

// A tab in STATE_UNLOADING waits for its layers to be reported cleared, which
// the frameloader holding them never gets to do.
add_task(async function remotenessChangeWhileUnloading() {
  // Keep the warming unload timer from taking the tab out of STATE_LOADED
  // while we wait for its layers.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.remote.warmup.unloadDelayMs", 30000]],
  });

  let tab = BrowserTestUtils.addTab(gBrowser, TEST_URL, {
    skipAnimation: true,
  });
  let browser = tab.linkedBrowser;
  await BrowserTestUtils.browserLoaded(browser, false, TEST_URL);

  gBrowser.warmupTab(tab);

  let switcher = gBrowser._switcher;
  ok(switcher, "The tab switcher is running.");
  await TestUtils.waitForCondition(
    () => switcher.getTabState(tab) == switcher.STATE_LOADED,
    "Waiting for the warmed tab to send up its layers."
  );
  ok(browser.hasLayers, "The warmed tab has layers.");

  // Nothing may be awaited between here and the remoteness change, or the old
  // frameloader gets to report its layers cleared first.
  switcher.setTabState(tab, switcher.STATE_UNLOADING);
  is(
    switcher.getTabState(tab),
    switcher.STATE_UNLOADING,
    "The tab is in STATE_UNLOADING, waiting for its layers to be cleared."
  );

  let changed = gBrowser.updateBrowserRemoteness(browser, {
    remoteType: E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE,
  });
  ok(changed, "The browser got a new frameloader.");
  ok(!browser.hasLayers, "The new frameloader has no layers.");

  is(
    switcher.getTabState(tab),
    switcher.STATE_UNLOADED,
    "The tab reached STATE_UNLOADED after the remoteness change."
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// With no BrowserParent to inherit from, the new frameloader takes the tab's
// inactive docShell as its cue not to render layers in the background.
add_task(async function remotenessChangeFromNonRemoteInBackground() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:robots", {
    skipAnimation: true,
  });
  let browser = tab.linkedBrowser;
  await BrowserTestUtils.browserLoaded(browser);
  ok(!browser.isRemoteBrowser, "about:robots loads in the parent process.");
  ok(!browser.docShellIsActive, "The background tab's docShell is inactive.");
  Assert.greater(
    browser.getBoundingClientRect().width,
    0,
    "The background tab's browser is laid out."
  );

  let changed = gBrowser.updateBrowserRemoteness(browser, {
    remoteType: E10SUtils.DEFAULT_REMOTE_TYPE,
  });
  ok(changed, "The browser got a new frameloader.");
  ok(browser.isRemoteBrowser, "The browser is remote now.");
  ok(!browser.renderLayers, "The background tab isn't asked to render layers.");
  ok(!browser.docShellIsActive, "The docShell stays inactive.");

  BrowserTestUtils.removeTab(tab);
});

// A tab swapped before its browser has a frame gets its BrowserParent from the
// swap itself, and the same cue has to reach it.
add_task(async function remotenessChangeFromNonRemoteBeforeLayout() {
  let tab = BrowserTestUtils.addTab(gBrowser, "about:robots", {
    skipAnimation: true,
  });
  let browser = tab.linkedBrowser;
  ok(!browser.isRemoteBrowser, "about:robots loads in the parent process.");
  is(
    window.windowUtils.getBoundsWithoutFlushing(browser).width,
    0,
    "The browser has no frame yet."
  );

  let changed = gBrowser.updateBrowserRemoteness(browser, {
    remoteType: E10SUtils.DEFAULT_REMOTE_TYPE,
  });
  ok(changed, "The browser got a new frameloader.");
  ok(browser.isRemoteBrowser, "The browser is remote now.");
  ok(!browser.renderLayers, "The background tab isn't asked to render layers.");
  ok(!browser.docShellIsActive, "The docShell stays inactive.");

  BrowserTestUtils.removeTab(tab);
});

// The switcher raises the priority hint of a tab it is switching to and
// preserves the layers of tabs in its layer cache; both have to survive a
// frameloader replacement along with the request for layers.
add_task(async function remotenessChangeCarriesPriorityHintAndPreservation() {
  let tab = BrowserTestUtils.addTab(gBrowser, TEST_URL, {
    skipAnimation: true,
  });
  let browser = tab.linkedBrowser;
  await BrowserTestUtils.browserLoaded(browser, false, TEST_URL);
  await waitForTabSwitchDone();

  browser.renderLayers = true;
  browser.preserveLayers(true);
  browser.frameLoader.remoteTab.priorityHint = true;

  let changed = gBrowser.updateBrowserRemoteness(browser, {
    remoteType: E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE,
  });
  ok(changed, "The browser got a new frameloader.");

  ok(browser.renderLayers, "The new frameloader is asked for layers.");
  ok(
    browser.frameLoader.remoteTab.priorityHint,
    "The new frameloader carries the priority hint."
  );
  browser.renderLayers = false;
  ok(
    browser.renderLayers,
    "The new frameloader preserves its layers, so it keeps rendering them."
  );
  browser.preserveLayers(false);
  browser.renderLayers = false;
  ok(
    !browser.renderLayers,
    "Rendering stops once the layers aren't preserved."
  );

  BrowserTestUtils.removeTab(tab);
});

// A process switch of the selected tab, which the switcher holds in
// STATE_LOADED, reports the old layers cleared exactly once and the new
// frameloader's layers ready exactly once, while the switcher takes the tab
// through STATE_LOADING again on its own.
add_task(async function remotenessChangeOfSelectedTab() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  let browser = tab.linkedBrowser;
  await waitForTabSwitchDone();
  await TestUtils.waitForCondition(
    () => browser.hasLayers,
    "Waiting for the tab's layers."
  );

  // Warm another tab to have a switcher around that tracks the selected tab.
  let warmTab = BrowserTestUtils.addTab(gBrowser, TEST_URL, {
    skipAnimation: true,
  });
  await BrowserTestUtils.browserLoaded(warmTab.linkedBrowser, false, TEST_URL);
  gBrowser.warmupTab(warmTab);
  let switcher = gBrowser._switcher;
  ok(switcher, "The tab switcher is running.");
  is(
    switcher.getTabState(tab),
    switcher.STATE_LOADED,
    "The selected tab is in STATE_LOADED."
  );

  let events = [];
  let log = e => events.push(`${e.type} hasLayers=${browser.hasLayers}`);
  browser.addEventListener("MozLayerTreeReady", log);
  browser.addEventListener("MozLayerTreeCleared", log);

  let changed = gBrowser.updateBrowserRemoteness(browser, {
    remoteType: E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE,
  });
  ok(changed, "The browser got a new frameloader.");
  Assert.deepEqual(
    events,
    ["MozLayerTreeCleared hasLayers=false"],
    "The replacement reported the old layers cleared."
  );
  ok(browser.renderLayers, "The new frameloader is asked for layers.");
  is(
    switcher.getTabState(tab),
    switcher.STATE_LOADING,
    "The switcher is waiting for the new frameloader's layers."
  );

  // The switcher finishes only once the selected tab is back in STATE_LOADED
  // and the warmed tab has been unloaded again.
  await waitForTabSwitchDone();
  Assert.deepEqual(
    events,
    ["MozLayerTreeCleared hasLayers=false", "MozLayerTreeReady hasLayers=true"],
    "The new frameloader reported its layers ready once."
  );
  ok(
    !tab.hasAttribute("pendingpaint"),
    "The tab switch spinner isn't showing."
  );

  BrowserTestUtils.removeTab(warmTab);
  BrowserTestUtils.removeTab(tab);
});
