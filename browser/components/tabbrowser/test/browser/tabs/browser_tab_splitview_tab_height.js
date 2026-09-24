/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Creating a split view must not change the rendered height of the horizontal
// tab strip, whichever UI density is in use and whether or not the tabs
// involved are container tabs or belong to a tab group.

const UIDENSITY = {
  normal: 0,
  compact: 1,
  touch: 2,
};
const TABS = {};

async function getTabstripHeight() {
  await window.promiseDocumentFlushed(() => {});
  return gBrowser.tabContainer.getBoundingClientRect().height;
}

async function setDensity(mode) {
  await SpecialPowers.pushPrefEnv({ set: [["browser.uidensity", mode]] });
  gUIDensity.update();
  await window.promiseDocumentFlushed(() => {});
}

/**
 * Puts two tabs into a split view, checks that the tab strip height is
 * unchanged, then separates them again.
 *
 * @param {MozTabbrowserTab} tabA
 * @param {MozTabbrowserTab} tabB
 * @param {number} expectedHeight
 * @param {string} description
 */
async function checkHeightAcrossSplitView(
  tabA,
  tabB,
  expectedHeight,
  description
) {
  let splitViewCreated = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "SplitViewCreated"
  );
  let splitView = gBrowser.addTabSplitView([tabA, tabB], {
    insertBefore: tabA,
  });
  await splitViewCreated;

  Assert.equal(
    await getTabstripHeight(),
    expectedHeight,
    `Tab strip height is unchanged with a split view of ${description}`
  );

  splitView.unsplitTabs();
  await BrowserTestUtils.waitForMutationCondition(
    gBrowser.tabContainer,
    { childList: true },
    () => {
      return (
        !Array.from(gBrowser.tabContainer.children).some(
          tabChild => tabChild.tagName === "tab-split-view-wrapper"
        ) &&
        !tabA.splitview &&
        !tabB.splitview
      );
    },
    { msg: "Split view has been separated" }
  );

  Assert.equal(
    await getTabstripHeight(),
    expectedHeight,
    `Tab strip height is unchanged after separating the split view of ${description}`
  );
}

add_setup(async function setup_createTabs() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  TABS.plainTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  TABS.containerTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    userContextId: 1,
  });
  TABS.groupedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  gBrowser.addTabGroup([TABS.groupedTab]);

  registerCleanupFunction(async () => {
    for (let [name, tab] of Object.entries(TABS)) {
      await BrowserTestUtils.removeTab(tab);
      delete TABS[name];
    }
    gUIDensity.update();
    Services.prefs.clearUserPref("browser.tabs.splitview.hasUsed");
  });
});

async function run_test_with_density(densityName) {
  const { plainTab, containerTab, groupedTab } = TABS;

  await setDensity(UIDENSITY[densityName]);

  let expectedHeight = await getTabstripHeight();
  Assert.greater(expectedHeight, 0, "Tab strip has a non-zero height");

  await checkHeightAcrossSplitView(
    plainTab,
    containerTab,
    expectedHeight,
    "a plain tab and a container tab"
  );

  Assert.ok(groupedTab.group, "The grouped tab is in a tab group");
  await checkHeightAcrossSplitView(
    plainTab,
    groupedTab,
    expectedHeight,
    "a plain tab and a grouped tab"
  );

  // Splitting with a grouped tab pulls the plain tab into the group and
  // separating them leaves the group behind. Restore both tabs so the next
  // density starts from the same tab strip layout.
  gBrowser.moveTabTo(plainTab, { tabIndex: 1, forceUngrouped: true });
  if (!groupedTab.group) {
    gBrowser.addTabGroup([groupedTab]);
  }
  await SpecialPowers.popPrefEnv();
}

add_task(async function test_splitview_preserves_tabstrip_height_normal() {
  info(`Testing with normal UI density`);
  await run_test_with_density("normal");
});

add_task(async function test_splitview_preserves_tabstrip_height_touch() {
  info(`Testing with touch UI density`);
  await run_test_with_density("touch");
});

add_task(async function test_splitview_preserves_tabstrip_height_compact() {
  info(`Testing with compact UI density`);
  await run_test_with_density("compact");
});
