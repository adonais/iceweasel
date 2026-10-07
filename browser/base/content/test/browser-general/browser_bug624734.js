/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Bug 624734 - Star UI has no tooltip until bookmarked page is visited

add_task(async function () {
  let tab = (gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser));
  CustomizableUI.addWidgetToArea(
    "bookmarks-menu-button",
    CustomizableUI.AREA_NAVBAR,
    0
  );

  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    // eslint-disable-next-line sdl/no-insecure-url
    "http://example.com/browser/browser/base/content/test/browser-general/dummy_page.html"
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  await TestUtils.waitForCondition(
    () => BookmarkingUI.status != BookmarkingUI.STATUS_UPDATING,
    "BookmarkingUI was updating for too long"
  );

  let elem = document.getElementById("context-bookmarkpage");
  let l10n = document.l10n.getAttributes(elem);
  ok(
    [
      "main-context-menu-bookmark-page",
      "main-context-menu-bookmark-page-with-shortcut",
      "main-context-menu-bookmark-page-mac",
    ].includes(l10n.id)
  );

  gBrowser.removeCurrentTab();
  CustomizableUI.removeWidgetFromArea("bookmarks-menu-button");
});
