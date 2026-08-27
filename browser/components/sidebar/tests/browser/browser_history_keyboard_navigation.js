/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let URLs, dates, today, component, contentWindow;

add_setup(async () => {
  const historyInfo = await populateHistory();
  URLs = historyInfo.URLs;
  dates = historyInfo.dates;
  today = dates[0];

  const sidebarInfo = await showHistorySidebar();
  component = sidebarInfo.component;
  contentWindow = sidebarInfo.contentWindow;
});

registerCleanupFunction(() => {
  SidebarController.hide();
  cleanUpExtraTabs();
  Services.prefs.clearUserPref("sidebar.history.sortOption");
});

add_task(async function test_initial_tab_stop() {
  const { lists, cards } = component;
  await BrowserTestUtils.waitForMutationCondition(
    lists[0].shadowRoot,
    { subtree: true, childList: true },
    () => lists[0].rowEls.length === URLs.length
  );
  await component.updateComplete;

  // Before any navigation, the only tab stop is the first card's header.
  // No row or other header should be reachable with Tab.
  const tabStops = [];
  for (const card of cards) {
    const summary = card.shadowRoot?.querySelector('summary[tabindex="0"]');
    if (summary) {
      tabStops.push(summary);
    }
  }
  for (const list of lists) {
    tabStops.push(...list.shadowRoot.querySelectorAll('[tabindex="0"]'));
  }
  Assert.equal(tabStops.length, 1, "Exactly one tab stop on first load.");
  Assert.equal(
    tabStops[0],
    cards[0].summaryEl,
    "The first card header is the initial tab stop."
  );
});

add_task(async function test_navigation_sort_by_date() {
  const { lists, cards } = component;
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => !!lists.length
  );
  await BrowserTestUtils.waitForMutationCondition(
    lists[0].shadowRoot,
    { subtree: true, childList: true },
    () => lists[0].rowEls.length === URLs.length
  );
  ok(true, "History rows are shown.");
  const rows = lists[0].rowEls;

  cards[0].summaryEl.focus();

  info("Focus the next row.");
  await focusWithKeyboard(rows[0], "KEY_ArrowDown", contentWindow);

  info("Focus the previous card.");
  await focusWithKeyboard(cards[0].summaryEl, "KEY_ArrowUp", contentWindow);

  info("Focus the next row.");
  await focusWithKeyboard(rows[0], "KEY_ArrowDown", contentWindow);

  info("Focus the next row.");
  await focusWithKeyboard(rows[1], "KEY_ArrowDown", contentWindow);

  info("Focus the next row.");
  await focusWithKeyboard(rows[2], "KEY_ArrowDown", contentWindow);

  info("Focus the next row.");
  await focusWithKeyboard(rows[3], "KEY_ArrowDown", contentWindow);

  info("Focus the next card.");
  await focusWithKeyboard(cards[1].summaryEl, "KEY_ArrowDown", contentWindow);

  info("Focus the previous row.");
  await focusWithKeyboard(rows[3], "KEY_ArrowUp", contentWindow);

  info("Open the focused link.");
  let browser = gBrowser.selectedBrowser;
  EventUtils.synthesizeKey("KEY_Enter", {}, contentWindow);
  await BrowserTestUtils.browserLoaded(browser, false, URLs[1]);
});

add_task(async function test_only_active_row_is_tab_stop() {
  const { lists, cards } = component;
  const list = lists[0];
  await BrowserTestUtils.waitForMutationCondition(
    list.shadowRoot,
    { subtree: true, childList: true },
    () => list.rowEls.length === URLs.length
  );

  info("Navigate from the first card header down to the second row.");
  cards[0].summaryEl.focus();
  await focusWithKeyboard(list.rowEls[0], "KEY_ArrowDown", contentWindow);
  await focusWithKeyboard(list.rowEls[1], "KEY_ArrowDown", contentWindow);

  Assert.equal(
    list.rowEls[0].getAttribute("tabindex"),
    -1,
    "The unselected row is not a tab stop."
  );
  Assert.equal(
    list.rowEls[1].getAttribute("tabindex"),
    0,
    "The selected row is a tab stop."
  );

  info("Tab from the focused row exits the panel.");
  const panelBlurred = BrowserTestUtils.waitForEvent(contentWindow, "blur");
  EventUtils.synthesizeKey("KEY_Tab", {}, contentWindow);
  await panelBlurred;
  Assert.ok(
    !contentWindow.document.hasFocus(),
    "Tab from a history row moves focus out of the panel."
  );

  info("Shift+Tab returns to the active row.");
  const rowRefocused = BrowserTestUtils.waitForEvent(list.rowEls[1], "focus");
  EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true });
  await rowRefocused;
  Assert.ok(
    isActiveElement(list.rowEls[1]),
    "Shift+Tab returns focus to the active row."
  );
});

add_task(async function test_shift_tab_returns_into_second_card() {
  const { lists, cards } = component;
  const secondList = lists[1];
  await BrowserTestUtils.waitForMutationCondition(
    secondList.shadowRoot,
    { subtree: true, childList: true },
    () => secondList.rowEls.length === URLs.length
  );

  info("Navigate into the second card's first row.");
  cards[1].summaryEl.focus();
  await focusWithKeyboard(secondList.rowEls[0], "KEY_ArrowDown", contentWindow);

  info("Tab out of the panel.");
  const panelBlurred = BrowserTestUtils.waitForEvent(contentWindow, "blur");
  EventUtils.synthesizeKey("KEY_Tab", {}, contentWindow);
  await panelBlurred;
  Assert.ok(!contentWindow.document.hasFocus(), "Tab exits the panel.");

  info("Shift+Tab returns to the active row in the second card.");
  const rowRefocused = BrowserTestUtils.waitForEvent(
    secondList.rowEls[0],
    "focus"
  );
  EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true });
  await rowRefocused;
  Assert.ok(
    isActiveElement(secondList.rowEls[0]),
    "Shift+Tab returns focus into the second card."
  );
});

add_task(async function test_navigation_left_and_right_home_and_end_keys() {
  const { lists, cards } = component;
  cards[0].summaryEl.focus();

  info("From the header, focus the first visit using right arrow key.");
  await focusWithKeyboard(lists[0].rowEls[0], "KEY_ArrowRight", contentWindow);

  info("From the first visit, focus the header using left arrow key.");
  await focusWithKeyboard(cards[0].summaryEl, "KEY_ArrowLeft", contentWindow);

  info("Focus the last card using End key.");
  await focusWithKeyboard(
    cards[cards.length - 1].summaryEl,
    "KEY_End",
    contentWindow
  );

  info("Focus the first card using Home key.");
  await focusWithKeyboard(cards[0].summaryEl, "KEY_Home", contentWindow);
});

add_task(async function test_navigation_sort_by_date_and_site() {
  const { cards } = component;
  info("Sort history by date and site.");
  const {
    menuButton,
    _menu: menu,
    _menuSortByDateSite: sortByDateSiteButton,
  } = component;
  let promiseMenuShown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, contentWindow);
  await promiseMenuShown;
  menu.activateItem(sortByDateSiteButton);

  // Wait for nested cards to appear.
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.shadowRoot.querySelector(".nested-card")
  );

  info("Focus the first date.");
  const firstDateCard = cards[0];
  firstDateCard.summaryEl.focus();

  info("Collapse and expand the card using arrow keys.");
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, contentWindow);
  await BrowserTestUtils.waitForMutationCondition(
    firstDateCard,
    { attributeFilter: ["expanded"] },
    () => !firstDateCard.expanded
  );
  EventUtils.synthesizeKey("KEY_ArrowRight", {}, contentWindow);
  await BrowserTestUtils.waitForMutationCondition(
    firstDateCard,
    { attributeFilter: ["expanded"] },
    () => firstDateCard.expanded
  );

  info("Move down to the first site.");
  const firstSiteCard = firstDateCard.querySelector(".nested-card");
  await focusWithKeyboard(
    firstSiteCard.summaryEl,
    "KEY_ArrowDown",
    contentWindow
  );

  info("Move back up to the date header.");
  await focusWithKeyboard(
    firstDateCard.summaryEl,
    "KEY_ArrowUp",
    contentWindow
  );

  info("Focus the last site, then move down to the second date.");
  const lastSiteCard = firstDateCard.querySelector(".last-card");
  lastSiteCard.summaryEl.focus();
  const secondDateCard = component.shadowRoot.querySelectorAll(".date-card")[1];
  await focusWithKeyboard(
    secondDateCard.summaryEl,
    "KEY_ArrowDown",
    contentWindow
  );

  info("Move back up to the site header.");
  await focusWithKeyboard(lastSiteCard.summaryEl, "KEY_ArrowUp", contentWindow);
});

add_task(async function test_navigation_sort_by_last_visited() {
  const {
    menuButton,
    _menu: menu,
    _menuSortByLastVisited: sortByLastVisitedButton,
  } = component;
  info("Sort history by last visited.");
  let promiseMenuShown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, contentWindow);
  await promiseMenuShown;
  menu.activateItem(sortByLastVisitedButton);

  // No containers when sorting by last visited.
  // Wait until we have a single card and a single list.
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.cards.length === 1 && component.lists.length === 1
  );

  info("Focus the first row and open the focused link.");
  const tabList = component.lists[0];
  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === URLs.length
  );
  tabList.rowEls[0].focus();
  let browser = gBrowser.selectedBrowser;
  EventUtils.synthesizeKey("KEY_Enter", {}, contentWindow);
  await BrowserTestUtils.browserLoaded(browser, false, URLs[1]);
});

add_task(async function test_arrow_navigation_keeps_headers_visible() {
  info("Populate history with many sites to ensure scrollable content.");
  const pageInfos = Array.from({ length: 30 }, (_, i) => ({
    url: `https://site-${i}.example.com/`,
    title: `Site ${i}`,
    visits: [{ date: new Date() }],
  }));
  await PlacesUtils.history.insertMany(pageInfos);

  info("Sort history by date and site.");
  const {
    menuButton,
    _menu: menu,
    _menuSortByDateSite: sortByDateSiteButton,
  } = component;
  const promiseMenuShown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, contentWindow);
  await promiseMenuShown;
  menu.activateItem(sortByDateSiteButton);

  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () =>
      component.shadowRoot.querySelectorAll(".nested-card").length >=
      pageInfos.length
  );

  const scrollContainer = component.shadowRoot.querySelector(
    ".sidebar-panel-scrollable-content"
  );
  Assert.greater(
    scrollContainer.scrollHeight,
    scrollContainer.clientHeight,
    "Content should overflow the scroll container."
  );

  const firstDateCard = component.cards[0];
  const siteCards = firstDateCard.querySelectorAll(".nested-card");
  siteCards[0].summaryEl.focus();

  info("Arrow down through collapsed headers within the first date group.");
  for (let i = 1; i < siteCards.length; i++) {
    await focusWithKeyboard(
      siteCards[i].summaryEl,
      "KEY_ArrowDown",
      contentWindow
    );
    const rect = siteCards[i].summaryEl.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    Assert.greaterOrEqual(
      Math.round(rect.top),
      Math.round(containerRect.top),
      `Header ${i} top is within the visible scroll area.`
    );
    Assert.lessOrEqual(
      Math.round(rect.bottom),
      Math.round(containerRect.bottom),
      `Header ${i} bottom is within the visible scroll area.`
    );
  }
});
