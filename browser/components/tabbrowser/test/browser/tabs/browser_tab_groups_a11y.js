"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.enabled", true]],
  });
});

add_task(async function test_TabGroupA11y() {
  const tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const tab3 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  const tabGroup = gBrowser.addTabGroup([tab2, tab3]);

  await BrowserTestUtils.switchTab(gBrowser, tab1);

  Assert.equal(
    tabGroup.labelElement.getAttribute("role"),
    "button",
    "tab group label should have the button role"
  );

  Assert.equal(
    tabGroup.labelElement.getAttribute("aria-label"),
    "Unnamed Group",
    "tab group label aria-label should default to 'unnamed' if not set"
  );

  Assert.equal(
    tabGroup.labelElement.getAttribute("aria-description"),
    "Unnamed Group — Tab Group",
    "tab group label aria-description should provide the name of the tab group plus more context"
  );

  Assert.equal(
    tabGroup.labelElement.getAttribute("aria-expanded"),
    "true",
    "tab group label aria-expanded should default to true, since tab groups default to not collapsed"
  );

  tabGroup.label = "test";
  tabGroup.collapsed = true;
  await BrowserTestUtils.waitForCondition(
    () => tabGroup.labelElement.getAttribute("aria-label") == "test",
    "Tab group label was updated"
  );
  Assert.equal(
    tabGroup.labelElement.getAttribute("aria-label"),
    "test",
    "tab group label aria-label should equal the name of the tab group"
  );

  Assert.equal(
    tabGroup.labelElement.getAttribute("aria-description"),
    "test — Tab Group",
    "tab group label aria-description should provide the name of the tab group plus more context"
  );

  Assert.equal(
    tabGroup.labelElement.getAttribute("aria-expanded"),
    "false",
    "tab group label aria-expanded should be false when the tab group is collapsed"
  );

  await removeTabGroup(tabGroup);
  BrowserTestUtils.removeTab(tab1);
});

async function flushL10n() {
  while (document.hasPendingL10nMutations) {
    await BrowserTestUtils.waitForEvent(document, "L10nMutationsFinished");
  }
}

add_task(async function test_collapsedTabGroupTooltips() {
  const tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const tab3 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  const group = gBrowser.addTabGroup([tab1, tab2]);
  await BrowserTestUtils.switchTab(gBrowser, tab2);
  Assert.equal(
    group.labelElement.getAttribute("tooltiptext"),
    "Unnamed Group — Expanded",
    "Group label tooltip indicates its expanded state"
  );

  info("Collapse the group to confirm tooltip states");
  let collapseFinished = BrowserTestUtils.waitForEvent(
    group,
    "TabGroupCollapse"
  );
  group.collapsed = true;
  await collapseFinished;
  await flushL10n();
  Assert.equal(
    group.labelElement.getAttribute("tooltiptext"),
    "Unnamed Group — Collapsed",
    "Group label tooltip indicates its collapsed state"
  );
  Assert.equal(
    group.overflowCountLabel.getAttribute("tooltiptext"),
    "1 more tab",
    "Overflow count tooltip shows singular 'tab'"
  );

  info("Add a third tab to the group to confirm overflow tooltip pluralizes");
  group.addTabs([tab3]);
  await flushL10n();
  Assert.equal(
    group.overflowCountLabel.getAttribute("tooltiptext"),
    "2 more tabs",
    "Overflow count tooltip indicates remaining tabs"
  );

  await removeTabGroup(group);
});
