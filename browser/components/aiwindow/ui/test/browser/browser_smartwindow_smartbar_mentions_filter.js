/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the smartbar mention suggestions list filters out tabs that should
 * not be offered as mentions.
 */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.search.suggest.enabled", false]],
  });
});

add_task(async function test_new_tab_filtered_from_open_tabs() {
  const win = await BrowserTestUtils.openNewBrowserWindow();

  const excludedTabs = [];
  for (const url of ["about:newtab", "about:home"]) {
    const tab = BrowserTestUtils.addTab(win.gBrowser, url);
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
    excludedTabs.push(tab);
  }

  await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    "https://example.com/page"
  );

  const mentionsSearch = new SmartbarMentionsPanelSearch(win);
  const urls = mentionsSearch.startQuery("").map(result => result.url);

  Assert.ok(
    urls.includes("https://example.com/page"),
    "A website should be offered as a mention."
  );
  for (const excludedUrl of ["about:newtab", "about:home", "about:blank"]) {
    Assert.ok(
      !urls.some(url => url.startsWith(excludedUrl)),
      `${excludedUrl} should not be offered as a mention.`
    );
  }

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_chat_tab_filtered_from_open_tabs() {
  const win = await BrowserTestUtils.openNewBrowserWindow();

  await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    "https://example.com/page"
  );
  await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    "about:aichatcontent"
  );
  // A query or ref should not let an excluded page through.
  await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    "about:aichatcontent?foo#bar"
  );

  const mentionsSearch = new SmartbarMentionsPanelSearch(win);
  const urls = mentionsSearch.startQuery("").map(result => result.url);

  Assert.ok(
    urls.includes("https://example.com/page"),
    "A website should be offered as a mention."
  );
  Assert.ok(
    !urls.some(url => url.startsWith("about:aichatcontent")),
    "Chat tab should not be offered as a mention."
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_excluded_urls_filtered_from_recently_closed() {
  const win = await BrowserTestUtils.openNewBrowserWindow();

  // Open then close tabs so they are available as recently closed tabs.
  for (const url of ["about:aichatcontent", "about:newtab"]) {
    const tab = await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    const recentlyClosed = BrowserTestUtils.waitForSessionStoreUpdate(tab);
    BrowserTestUtils.removeTab(tab);
    await recentlyClosed;
  }

  const openTab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    "https://example.com/page"
  );
  const closedTabs = BrowserTestUtils.waitForSessionStoreUpdate(openTab);
  BrowserTestUtils.removeTab(openTab);
  await closedTabs;

  const mentionsSearch = new SmartbarMentionsPanelSearch(win);
  const results = mentionsSearch.startQuery("");
  const closedUrlsFiltered = results
    .filter(result => result.type === MENTION_TYPE.TAB_RECENTLY_CLOSED)
    .map(result => result.url);

  Assert.ok(
    closedUrlsFiltered.includes("https://example.com/page"),
    "Recently closed website should be offered as a mention."
  );
  for (const excludedUrl of ["about:aichatcontent", "about:newtab"]) {
    Assert.ok(
      !closedUrlsFiltered.some(url => url.startsWith(excludedUrl)),
      `${excludedUrl} should not be offered as a mention.`
    );
  }

  await BrowserTestUtils.closeWindow(win);
});
