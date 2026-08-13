/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(
  async function test_tabs_browsing_sidebar_visible_when_redesign_enabled() {
    let tab = await openPrefsTab("tabsBrowsing");
    let doc = tab.linkedBrowser.contentDocument;

    is_element_visible(
      doc.getElementById("category-tabs-browsing"),
      "Tabs and Browsing category is visible when settings redesign is enabled"
    );

    await BrowserTestUtils.removeTab(tab);
  }
);

add_task(async function test_tabs_browsing_pane_loads_setting_groups() {
  let tab = await openPrefsTab("tabsBrowsing");
  let doc = tab.linkedBrowser.contentDocument;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="browserLayout"]')
  );

  for (let groupId of [
    "browserLayout",
    "tabs",
    "pageNavigation",
    "keyboardShortcuts",
    "media",
    "performance",
    "recommendations",
  ]) {
    let group = doc.querySelector(`setting-group[groupid="${groupId}"]`);
    ok(group, `${groupId} setting-group exists`);
    is_element_visible(group, `${groupId} setting-group is visible`);
  }

  let firstGroup = doc.querySelector('setting-group[groupid="browserLayout"]');
  ok(
    firstGroup,
    "Tabs and Browsing pane loaded with setting-groups (no registration errors)"
  );

  info("Check keyboardShortcuts group is rendered as expected");
  const keyboardGroup = doc.querySelector(
    `setting-group[groupid="keyboardShortcuts"]`
  );
  const customkeysLink = keyboardGroup.querySelector(
    "#keyboardCustomkeysLinkTabs"
  );
  ok(BrowserTestUtils.isVisible(customkeysLink), "Customkeys link is visible");
  ok(
    customkeysLink,
    "Customkeys link is included in the Keyboard shortcuts group"
  );
  is(
    customkeysLink.href,
    "about:keyboard",
    "Customkeys moz-box-link's href attribute is set to about:keyboard"
  );

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_tabs_browsing_pane_click_sidebar() {
  let tab = await openPrefsTab("");
  let doc = tab.linkedBrowser.contentDocument;

  let navButton = doc.getElementById("category-tabs-browsing");
  await navButton.updateComplete;

  let paneLoaded = waitForPaneChange("tabsBrowsing");
  synthesizeClick(navButton);
  await paneLoaded;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="browserLayout"]')
  );
  ok(
    doc.querySelector('setting-group[groupid="browserLayout"]'),
    "Browser layout setting-group is present after clicking Tabs and Browsing nav button"
  );

  await BrowserTestUtils.removeTab(tab);
});
