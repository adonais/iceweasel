/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

// A frameloader replacement reports a change in the browser's layers on behalf
// of the BrowserParents involved, whether it stores the old page in the bfcache
// or restores one from it: a cached BrowserParent keeps its layers and never
// reports them itself.

const URL1 = "https://example.com/";
const URL2 = "https://example.com/?two";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({ set: [["fission.bfcacheInParent", true]] });
});

function watchLayerEvents(browser) {
  let events = [];
  let log = e => events.push(`${e.type} hasLayers=${browser.hasLayers}`);
  browser.addEventListener("MozLayerTreeReady", log);
  browser.addEventListener("MozLayerTreeCleared", log);
  return events;
}

// The switcher finishes only once every other tab has unloaded, which can
// take longer under load than a polling wait allows for.
async function waitForTabSwitchDone() {
  if (gBrowser._switcher) {
    await BrowserTestUtils.waitForEvent(gBrowser, "TabSwitchDone");
  }
}

async function settle(browser) {
  await waitForTabSwitchDone();
  await TestUtils.waitForCondition(
    () => browser.hasLayers,
    "Waiting for the browser's layers."
  );
  await TestUtils.waitForTick();
}

async function waitForDark(browser) {
  await waitForTabSwitchDone();
  await TestUtils.waitForCondition(
    () => !browser.renderLayers && !browser.hasLayers,
    "Waiting for the tab to be unloaded in the background."
  );
}

function installPersistedMarker(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    content.addEventListener("pageshow", e => {
      content.document.documentElement.dataset.persisted = e.persisted;
    });
  });
}

async function checkPersisted(browser) {
  await TestUtils.waitForCondition(
    () =>
      SpecialPowers.spawn(
        browser,
        [],
        () => content.document.documentElement.dataset.persisted == "true"
      ),
    "Waiting for the page to be restored from the bfcache."
  );
  ok(true, "The page was restored from the bfcache.");
}

// Restores the previous session history entry from the parent process,
// synchronously; goBack() would first round-trip through the content process.
function restoreFromParent(browser) {
  let sessionHistory = browser.browsingContext.sessionHistory;
  sessionHistory.index -= 1;
  sessionHistory.reloadCurrentEntry();
}

// Opens a tab with URL1, unloads it in the background behind a new foreground
// tab and navigates it to URL2 there, so that URL1's frameloader goes into the
// bfcache without layers.
async function openTabWithDarkCachedPage() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL1);
  let browser = tab.linkedBrowser;
  await settle(browser);
  await installPersistedMarker(browser);

  let otherTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  await waitForDark(browser);

  let loaded = BrowserTestUtils.browserLoaded(browser, false, URL2);
  BrowserTestUtils.startLoadingURIString(browser, URL2);
  await loaded;
  ok(
    !browser.renderLayers && !browser.hasLayers,
    "The background tab stays dark across the navigation."
  );
  return { tab, otherTab };
}

add_task(async function bfcacheSwap() {
  await BrowserTestUtils.withNewTab(URL1, async browser => {
    await installPersistedMarker(browser);
    await settle(browser);
    let events = watchLayerEvents(browser);

    let loaded = BrowserTestUtils.browserLoaded(browser, false, URL2);
    BrowserTestUtils.startLoadingURIString(browser, URL2);
    await loaded;
    await settle(browser);
    Assert.deepEqual(
      events,
      [
        "MozLayerTreeCleared hasLayers=false",
        "MozLayerTreeReady hasLayers=true",
      ],
      "Storing the old page in the bfcache reports the layers cleared once and the new ones ready once."
    );

    events.length = 0;
    let back = BrowserTestUtils.waitForLocationChange(gBrowser, URL1);
    browser.goBack();
    await back;
    await settle(browser);
    await checkPersisted(browser);
    Assert.deepEqual(
      events,
      [],
      "Restoring the page from the bfcache reports no layer events."
    );
  });
});

// A restore into a tab the switcher is still loading brings layers along that
// the restored frameloader will never report, so the restore has to.
add_task(async function bfcacheRestoreWhileLoading() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL1);
  let browser = tab.linkedBrowser;
  await settle(browser);
  await installPersistedMarker(browser);

  let loaded = BrowserTestUtils.browserLoaded(browser, false, URL2);
  BrowserTestUtils.startLoadingURIString(browser, URL2);
  await loaded;
  await settle(browser);
  // Keep the second page out of the bfcache, so that its BrowserParent is
  // destroyed by the restore and can't report anything for the tab.
  await SpecialPowers.spawn(browser, [], () => {
    content.addEventListener("unload", () => {});
  });

  let otherTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  await waitForDark(browser);

  let switched = BrowserTestUtils.switchTab(gBrowser, tab);
  let switcher = gBrowser._switcher;
  is(
    switcher.getTabState(tab),
    switcher.STATE_LOADING,
    "The tab is in STATE_LOADING."
  );
  restoreFromParent(browser);
  ok(browser.hasLayers, "The restored frameloader has layers.");

  await TestUtils.waitForCondition(
    () => switcher.getTabState(tab) == switcher.STATE_LOADED,
    "Waiting for the switcher to learn about the restored layers."
  );
  await switched;
  ok(
    !browser.hasAttribute("pendingpaint"),
    "The tab switch spinner isn't showing."
  );
  await checkPersisted(browser);

  BrowserTestUtils.removeTab(otherTab);
  BrowserTestUtils.removeTab(tab);
});

// A tab in STATE_UNLOADING waits for its layers to be reported cleared. A
// restore stores the frameloader holding them in the bfcache, where it keeps
// them, so the restore has to report them cleared.
add_task(async function bfcacheRestoreWhileUnloading() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.remote.warmup.enabled", true],
      ["browser.tabs.remote.warmup.unloadDelayMs", 30000],
    ],
  });
  let { tab, otherTab } = await openTabWithDarkCachedPage();
  let browser = tab.linkedBrowser;

  gBrowser.warmupTab(tab);
  let switcher = gBrowser._switcher;
  ok(switcher, "The tab switcher is running.");
  await TestUtils.waitForCondition(
    () => switcher.getTabState(tab) == switcher.STATE_LOADED,
    "Waiting for the warmed tab to send up its layers."
  );
  ok(browser.hasLayers, "The warmed tab has layers.");

  // Nothing may be awaited between here and the restore, or the frameloader
  // gets to report its layers cleared first.
  switcher.setTabState(tab, switcher.STATE_UNLOADING);
  is(
    switcher.getTabState(tab),
    switcher.STATE_UNLOADING,
    "The tab is in STATE_UNLOADING, waiting for its layers to be cleared."
  );
  restoreFromParent(browser);
  ok(!browser.hasLayers, "The restored frameloader has no layers.");
  is(
    switcher.getTabState(tab),
    switcher.STATE_UNLOADED,
    "The tab reached STATE_UNLOADED after the restore."
  );
  await checkPersisted(browser);

  BrowserTestUtils.removeTab(otherTab);
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// Restoring a page cached without layers into the selected tab takes the
// browser's layers away until the restored page has painted, and the restored
// frameloader has to inherit the request for layers to paint at all.
add_task(async function bfcacheRestoreIntoLoadedTab() {
  let { tab, otherTab } = await openTabWithDarkCachedPage();
  let browser = tab.linkedBrowser;

  await BrowserTestUtils.switchTab(gBrowser, tab);
  await settle(browser);
  let events = watchLayerEvents(browser);

  restoreFromParent(browser);
  ok(browser.renderLayers, "The restored frameloader is asked for layers.");
  ok(!browser.hasLayers, "The restored frameloader has no layers yet.");

  await settle(browser);
  Assert.deepEqual(
    events,
    ["MozLayerTreeCleared hasLayers=false", "MozLayerTreeReady hasLayers=true"],
    "The restore reports the layers cleared once and the restored page's layers ready once."
  );
  await checkPersisted(browser);

  BrowserTestUtils.removeTab(otherTab);
  BrowserTestUtils.removeTab(tab);
});

// A page cached with layers and restored into an unloaded background tab has
// to inherit the tab's dark state, and the tab has to load normally when it is
// selected afterwards.
add_task(async function bfcacheRestoreInBackground() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL1);
  let browser = tab.linkedBrowser;
  await settle(browser);
  await installPersistedMarker(browser);

  let loaded = BrowserTestUtils.browserLoaded(browser, false, URL2);
  BrowserTestUtils.startLoadingURIString(browser, URL2);
  await loaded;
  await settle(browser);

  let otherTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  await waitForDark(browser);

  restoreFromParent(browser);
  ok(
    !browser.renderLayers,
    "The restored frameloader isn't asked for layers in the background."
  );
  await TestUtils.waitForCondition(
    () => !browser.hasLayers,
    "Waiting for the restored frameloader to release its layers."
  );

  await BrowserTestUtils.switchTab(gBrowser, tab);
  ok(
    !browser.hasAttribute("pendingpaint"),
    "The tab switch spinner isn't showing."
  );
  await checkPersisted(browser);

  BrowserTestUtils.removeTab(otherTab);
  BrowserTestUtils.removeTab(tab);
});
