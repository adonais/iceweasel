/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let URLs, component, contentWindow;

async function sortBy(sortOption) {
  component.controller.onChangeSortOption({}, sortOption);
  await TestUtils.waitForCondition(
    () => component.controller.historyCache.sortOption == sortOption
  );
  await component.updateComplete;
}

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
const hasRole = (el, role) => accessibleOf(el)?.role == role;
const areTreeItems = els =>
  els.every(el => hasRole(el, Ci.nsIAccessibleRole.ROLE_OUTLINEITEM));

const treeEl = () =>
  component.shadowRoot.querySelector(".sidebar-panel-scrollable-content");
const isTree = () => hasRole(treeEl(), Ci.nsIAccessibleRole.ROLE_OUTLINE);
const allRows = () => [...component.lists].flatMap(list => [...list.rowEls]);
const waitForRows = minimum =>
  TestUtils.waitForCondition(
    () => allRows().length >= minimum,
    "Waiting for history rows."
  );

add_setup(async () => {
  const historyInfo = await populateHistory();
  URLs = historyInfo.URLs;
  const sidebarInfo = await showHistorySidebar();
  component = sidebarInfo.component;
  contentWindow = sidebarInfo.contentWindow;
});

registerCleanupFunction(() => {
  SidebarController.hide();
  cleanUpExtraTabs();
  Services.prefs.clearUserPref("sidebar.history.sortOption");
});

add_task(async function test_sort_by_date() {
  await sortBy("date");
  const cards = [...component.cards];
  Assert.equal(cards.length, 3, "There is a card for each day.");
  const expandedCards = cards.filter(card => card.expanded);
  Assert.ok(expandedCards.length, "Some days start expanded.");
  const visibleRows = URLs.length * expandedCards.length;
  await waitForRows(visibleRows);
  const summaries = cards.map(card => card.summaryEl);
  await TestUtils.waitForCondition(
    () => areTreeItems(summaries) && areTreeItems(allRows()),
    "Waiting for the history tree items."
  );
  Assert.ok(isTree(), "History is exposed as a tree.");

  cards.forEach((card, i) => {
    const summary = card.summaryEl;
    Assert.equal(attrOf(summary, "level"), "1", "A day is a level 1 item.");
    Assert.equal(
      attrOf(summary, "setsize"),
      String(cards.length),
      "The day set size counts the days."
    );
    Assert.equal(
      attrOf(summary, "posinset"),
      String(i + 1),
      "The day position is set."
    );
  });
  Assert.equal(
    summaries.filter(isExpanded).length,
    expandedCards.length,
    "The expanded days are exposed as expanded."
  );

  const rows = allRows();
  Assert.equal(rows.length, visibleRows, "Each open day has its visits.");
  for (const list of component.lists) {
    [...list.rowEls].forEach((row, i) => {
      Assert.equal(attrOf(row, "level"), "2", "A visit is a level 2 item.");
      Assert.equal(
        attrOf(row, "setsize"),
        String(URLs.length),
        "The visit set size counts the visits of the day."
      );
      Assert.equal(
        attrOf(row, "posinset"),
        String(i + 1),
        "The visit position is set."
      );
    });
  }
});

add_task(async function test_card_header_click_toggles() {
  const card = component.cards[2];
  Assert.ok(!card.expanded, "The card starts collapsed.");
  const isExposedAsExpanded = () => isExpanded(card.summaryEl);
  EventUtils.synthesizeMouseAtCenter(card.summaryEl, {}, contentWindow);
  await TestUtils.waitForCondition(
    () => card.expanded && isExposedAsExpanded(),
    "Clicking the header expands the card."
  );
  EventUtils.synthesizeMouseAtCenter(card.summaryEl, {}, contentWindow);
  await TestUtils.waitForCondition(
    () => !card.expanded && !isExposedAsExpanded(),
    "Clicking the header collapses the card."
  );
});

add_task(async function test_sort_by_date_and_site() {
  await sortBy("datesite");
  const siteCard = () => component.shadowRoot.querySelector(".nested-card");
  const dayCards = () =>
    [...component.cards].filter(
      card => !card.classList.contains("nested-card")
    );
  await TestUtils.waitForCondition(siteCard, "Waiting for the site cards.");
  siteCard().expanded = true;
  await siteCard().updateComplete;
  await waitForRows(1);
  await TestUtils.waitForCondition(
    () =>
      areTreeItems(dayCards().map(card => card.summaryEl)) &&
      areTreeItems([siteCard().summaryEl]) &&
      areTreeItems(allRows()),
    "Waiting for the history tree items."
  );

  Assert.ok(isTree(), "History is exposed as a tree.");
  Assert.equal(dayCards().length, 3, "There is a card for each day.");
  for (const card of dayCards()) {
    Assert.equal(attrOf(card.summaryEl, "level"), "1", "Days are level 1.");
  }
  Assert.equal(
    attrOf(siteCard().summaryEl, "level"),
    "2",
    "Sites are level 2."
  );
  Assert.equal(
    attrOf(siteCard().summaryEl, "setsize"),
    String(URLs.length),
    "Sites are counted within their day."
  );
  Assert.equal(attrOf(allRows()[0], "level"), "3", "Visits are level 3.");
});

add_task(async function test_flat_sort_is_a_flat_tree() {
  await sortBy("lastvisited");
  await TestUtils.waitForCondition(
    () =>
      ![...component.cards].some(
        card => card.getAttribute("type") == "accordion"
      ),
    "Waiting for the flat layout."
  );
  await waitForRows(1);
  const list = component.lists[0];
  Assert.ok(
    hasRole(
      list.shadowRoot.querySelector("#fxview-tab-list"),
      Ci.nsIAccessibleRole.ROLE_OUTLINE
    ),
    "A flat sort is exposed as a tree."
  );
  await TestUtils.waitForCondition(
    () => areTreeItems([...list.rowEls]),
    "Waiting for the visits to be tree items."
  );
  Assert.equal(attrOf(list.rowEls[0], "level"), "1", "Visits are level 1.");
});

add_task(async function test_empty_history_is_not_a_tree() {
  await sortBy("date");
  await PlacesUtils.history.clear();
  await TestUtils.waitForCondition(
    () => component.controller.isHistoryEmpty,
    "Waiting for history to be empty."
  );
  await component.updateComplete;
  Assert.ok(!isTree(), "An empty history is not a tree.");
});
