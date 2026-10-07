/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The "Set Home Page" bookmark dialog opens from the Custom Homepage subpage,
 * which search reaches through the "Choose a specific site" button on the Home
 * pane. That button is only shown while the homepage is a custom URL, so the
 * dialog's strings are searchable in that state and the results point at the
 * Homepage group.
 */

async function assertHomepageGroupSurfaced(doc, win, query) {
  await runSearchInput(query);

  let homePane = doc.querySelector('setting-pane[data-category="paneHome"]');
  is_element_visible(homePane, `Home pane is shown for "${query}"`);

  let homepageGroup = doc.querySelector('setting-group[groupid="homepage"]');
  is_element_visible(homepageGroup, `Homepage group is shown for "${query}"`);

  let loadPaneControl = getSettingControl(
    "homepageGoToCustomHomepageUrlPanel",
    win
  );
  let buttonEl = loadPaneControl.querySelector("moz-box-button");
  ok(
    buttonEl.parentElement.classList.contains("search-tooltip-parent"),
    `"Choose a specific site" carries the search tooltip for "${query}"`
  );
}

add_task(async function test_bookmark_dialog_strings_are_searchable() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.startup.homepage", "about:robots"]],
  });

  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, {
    leaveOpen: true,
  });
  let doc = gBrowser.selectedBrowser.contentDocument;
  let win = doc.documentGlobal;

  await assertHomepageGroupSurfaced(doc, win, "Set Home Page");
  await clearSearch(doc);
  await assertHomepageGroupSurfaced(doc, win, "bookmark");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
