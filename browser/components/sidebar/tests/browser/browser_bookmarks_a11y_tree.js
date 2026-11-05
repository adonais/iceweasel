/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  showBookmarksSidebar,
  openFolder,
  openToolbarFolder,
  findBookmarkItemByGuid,
} = SidebarTestUtils.bookmarks;

const BULK_COUNT = 300;

const accService = Cc["@mozilla.org/accessibilityService;1"].getService(
  Ci.nsIAccessibilityService
);
const accessibleOf = el => accService.getAccessibleFor(el);
const attrOf = (el, name) =>
  accessibleOf(el).attributes.getStringProperty(name);
const isExpanded = el => {
  const state = {};
  accessibleOf(el).getState(state, {});
  return !!(state.value & Ci.nsIAccessibleStates.STATE_EXPANDED);
};
const areTreeItems = els =>
  els.every(
    el => accessibleOf(el)?.role == Ci.nsIAccessibleRole.ROLE_OUTLINEITEM
  );

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.updatedBookmarks.enabled", true]],
  });
  await PlacesUtils.bookmarks.eraseEverything();
});

registerCleanupFunction(async () => {
  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_exposed_as_tree() {
  const outer = await PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Outer",
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
  });
  const inner = await PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Inner",
    parentGuid: outer.guid,
  });
  let firstBulk;
  for (let i = 0; i < BULK_COUNT; i++) {
    const bulk = await PlacesUtils.bookmarks.insert({
      url: `https://example.com/${i}`,
      title: `Bulk ${i}`,
      parentGuid: inner.guid,
    });
    firstBulk ??= bulk;
  }

  const { component } = await showBookmarksSidebar(window);
  const tabList = component.bookmarkList;
  const toolbar = await openToolbarFolder(tabList);
  const toolbarList = toolbar.querySelector("sidebar-bookmark-list");
  const outerEl = await findBookmarkItemByGuid(
    toolbarList,
    "folderEls",
    outer.guid
  );
  await openFolder(outerEl);
  const outerList = outerEl.querySelector("sidebar-bookmark-list");
  const innerEl = await findBookmarkItemByGuid(
    outerList,
    "folderEls",
    inner.guid
  );
  await openFolder(innerEl);
  const innerList = innerEl.querySelector("sidebar-bookmark-list");
  await findBookmarkItemByGuid(innerList, "rowEls", firstBulk.guid);

  const summaryOf = el => el.querySelector(":scope > summary");
  const folders = [
    [toolbar, "1"],
    [outerEl, "2"],
    [innerEl, "3"],
  ];
  const bulkRows = [...innerList.rowEls];
  await TestUtils.waitForCondition(
    () =>
      areTreeItems(bulkRows) &&
      areTreeItems(folders.map(([el]) => summaryOf(el))),
    "Waiting for the bookmarks to be exposed."
  );

  const container = list => list.shadowRoot.querySelector("#fxview-tab-list");
  Assert.equal(
    accessibleOf(container(tabList)).role,
    Ci.nsIAccessibleRole.ROLE_OUTLINE,
    "Bookmarks are exposed as a tree."
  );
  for (const list of [toolbarList, outerList, innerList]) {
    Assert.notEqual(
      accessibleOf(container(list)).role,
      Ci.nsIAccessibleRole.ROLE_OUTLINE,
      "Nested lists are not trees of their own."
    );
  }

  for (const [el, level] of folders) {
    const summary = summaryOf(el);
    Assert.equal(attrOf(summary, "level"), level, "The folder level is set.");
    Assert.ok(isExpanded(summary), "An open folder is exposed as expanded.");
  }

  Assert.less(bulkRows.length, BULK_COUNT, "The list is still virtualized.");
  for (const row of bulkRows) {
    const name = accessibleOf(row).name;
    Assert.equal(attrOf(row, "level"), "4", `${name} level.`);
    Assert.equal(
      attrOf(row, "setsize"),
      String(BULK_COUNT),
      `${name} reports the full set size.`
    );
    Assert.equal(
      attrOf(row, "posinset"),
      String(Number(name.slice("Bulk ".length)) + 1),
      `${name} reports its position in the full set.`
    );
  }
  Assert.ok(!isExpanded(bulkRows[0]), "A bookmark is not exposed as expanded.");

  summaryOf(innerEl).click();
  await TestUtils.waitForCondition(
    () => !isExpanded(summaryOf(innerEl)),
    "Collapsing a folder updates its expanded state."
  );

  SidebarTestUtils.closePanel(window);
});
