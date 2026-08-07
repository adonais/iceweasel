"use strict";

const PATH = "/browser/docshell/test/browser/dummy_page.html";
const URL_COM = "https://example.com" + PATH;
const URL_ORG = "https://example.org" + PATH;
const URL_ORG_A = URL_ORG + "#a";
const URL_NET = "https://example.net" + PATH;
const URL_IFRAME =
  "https://example.com/browser/docshell/test/browser/dummy_iframe_page.html";

add_task(async function purge_keeps_current_without_hang() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.navigation.webidl.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL_COM);
  const browser = tab.linkedBrowser;

  for (const url of [URL_ORG, URL_NET]) {
    const loaded = BrowserTestUtils.browserLoaded(browser, false, url);
    BrowserTestUtils.startLoadingURIString(browser, url);
    await loaded;
  }

  const sh = browser.browsingContext.sessionHistory;
  await TestUtils.waitForCondition(() => sh.count == 3);
  is(sh.index, 2, "on the last entry");

  browser.goBack();
  await TestUtils.waitForCondition(() => sh.index == 1, "went back one entry");

  browser.purgeSessionHistory();

  await TestUtils.waitForCondition(() => sh.count < 3, "history was purged");
  Assert.greaterOrEqual(sh.count, 1, "the current entry was kept");
  is(
    sh.getEntryAtIndex(sh.index).URI.spec,
    URL_ORG,
    "kept the page the user was viewing"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function purge_with_subframe_does_not_hang() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.navigation.webidl.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, URL_IFRAME);
  const browser = tab.linkedBrowser;

  const loaded = BrowserTestUtils.browserLoaded(browser, false, URL_COM);
  BrowserTestUtils.startLoadingURIString(browser, URL_COM);
  await loaded;

  const sh = browser.browsingContext.sessionHistory;
  await TestUtils.waitForCondition(() => sh.count == 2);

  // Go back so the subframed page is the current, non-last entry. Purging then
  // duplicates its top-level entry via addEntry, and the subframe walk in the
  // history commit used to loop forever on that duplicate.
  browser.goBack();
  await TestUtils.waitForCondition(
    () => sh.index == 0,
    "back on the subframed page"
  );

  browser.purgeSessionHistory();

  await TestUtils.waitForCondition(() => sh.count == 1, "history was purged");
  ok(true, "purge with a subframe completed without hanging");

  BrowserTestUtils.removeTab(tab);
});
