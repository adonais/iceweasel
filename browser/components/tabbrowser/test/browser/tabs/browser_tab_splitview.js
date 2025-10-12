/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.verticalTabs", false]],
  });
});

registerCleanupFunction(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.verticalTabs", false],
      ["sidebar.revamp", false],
    ],
  });
});

add_task(async function test_splitViewCreateAndAddTabs() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab3 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab4 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  // Add tabs to split view
  let splitview = gBrowser.addTabSplitView([tab1, tab2]);
  let splitview2 = gBrowser.addTabSplitView([tab3, tab4]);
  let tabbrowserTabs = document.getElementById("tabbrowser-tabs");
  await BrowserTestUtils.waitForMutationCondition(
    tabbrowserTabs,
    { childList: true },
    () => tabbrowserTabs.querySelectorAll("tab-split-view-wrapper").length === 2
  );

  Assert.ok(splitview.splitViewId, "Split view has id");
  Assert.equal(splitview.tabs.length, 2, "Split view has 2 tabs");
  Assert.ok(splitview.tabs.includes(tab1), "tab1 is in split view wrapper");
  Assert.ok(splitview.tabs.includes(tab2), "tab2 is in split view wrapper");

  Assert.ok(
    splitview2.splitViewId && splitview.splitViewId !== splitview2.splitViewId,
    "Split view has different id than split view 2"
  );
  Assert.equal(splitview2.tabs.length, 2, "Split view 2 has 2 tabs");
  Assert.ok(splitview2.tabs.includes(tab3), "tab3 is in split view wrapper");
  Assert.ok(splitview2.tabs.includes(tab4), "tab4 is in split view wrapper");

  Assert.ok(
    !splitview.hasAttribute("hasactivetab"),
    "The split view wrapper has the expected attribute when it does not contain the selected tab"
  );

  gBrowser.selectTabAtIndex(tab1._tPos);
  await BrowserTestUtils.waitForMutationCondition(
    splitview,
    { attributes: true, attributeFilter: ["hasactivetab"] },
    () => splitview.hasAttribute("hasactivetab")
  );
  Assert.ok(
    splitview.hasAttribute("hasactivetab"),
    "The split view wrapper has the expected attribute when it contains the selected tab"
  );

  // Unsplit tabs
  splitview.unsplitTabs();
  await BrowserTestUtils.waitForMutationCondition(
    tabbrowserTabs,
    { childList: true },
    () => tabbrowserTabs.querySelectorAll("tab-split-view-wrapper").length === 1
  );
  Assert.strictEqual(
    document.querySelectorAll("tab-split-view-wrapper").length,
    1,
    "Tabs have been unsplit from split view"
  );

  // Add tabs back to split view
  splitview = gBrowser.addTabSplitView([tab1, tab2]);

  // Remove split view and close tabs
  splitview.close();
  splitview2.close();
});
