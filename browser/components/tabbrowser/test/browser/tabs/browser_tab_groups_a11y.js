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
  const tab4 = BrowserTestUtils.addTab(gBrowser, "about:blank");

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

  Assert.ok(
    tabGroup.tabs.every(tab => !tab.hasAttribute("aria-hidden")),
    "tabs in expanded tab groups should not be hidden from accessibility tools"
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

  Assert.ok(
    tabGroup.tabs.every(tab => tab.hasAttribute("aria-hidden")),
    "when the group is collapsed and has no active tab inside, all tabs in the group should be hidden from accessbility tools"
  );

  info(
    "activating a tab in a collapsed tab group should make only that tab visible to accessibility tools"
  );
  await BrowserTestUtils.switchTab(gBrowser, tab2);

  Assert.ok(
    !tab2.hasAttribute("aria-hidden"),
    "the active tab in a collapsed tab group should be visible to accessibility tools"
  );
  Assert.ok(
    tab3.hasAttribute("aria-hidden"),
    "inactive tabs in collapsed tab groups should still be hidden from accessibility tools"
  );

  Assert.ok(
    !tab4.hasAttribute("aria-hidden"),
    "a normal ungrouped tab should be visible to accessibility tools"
  );

  info("move an inactive tab into a collapsed tab group");
  const tabAddedToGroup = BrowserTestUtils.waitForEvent(
    tabGroup,
    "TabGrouped",
    false,
    e => e.detail == tab4
  );

  tabGroup.addTabs([tab4]);

  await tabAddedToGroup;

  Assert.ok(
    tab4.hasAttribute("aria-hidden"),
    "when an inactive tab moves into a collapsed tab group, it should no longer be visibile to accessibility tools"
  );

  info(
    "switching the active tab within a collapsed tab group should hide the old tab, reveal the new active tab"
  );
  await BrowserTestUtils.switchTab(gBrowser, tab4);

  Assert.ok(
    tab2.hasAttribute("aria-hidden"),
    "previously active tab should be hidden"
  );
  Assert.ok(
    !tab4.hasAttribute("aria-hidden"),
    "newly active tab should be visible"
  );

  info(
    "activate the ungrouped tab so that the tab group fully collapses again"
  );
  await BrowserTestUtils.switchTab(gBrowser, tab1);

  Assert.ok(
    tabGroup.tabs.every(tab => tab.hasAttribute("aria-hidden")),
    "when the group is collapsed and has no active tab inside, all tabs in the group should be hidden from accessbility tools"
  );

  await removeTabGroup(tabGroup);
  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab4);
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
