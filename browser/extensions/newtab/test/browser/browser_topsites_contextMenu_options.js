/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// test_newtab calls SpecialPowers.spawn, which injects ContentTaskUtils in the
// scope of the callback. Eslint doesn't know about that.
/* global ContentTaskUtils */

const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);

SearchTestUtils.init(this);

add_setup(async function () {
  // Set up the configuration so that Baidu is available as a search engine, so
  // the search shortcut works.
  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      identifier: "google",
      base: {
        name: "Google",
        aliases: ["google"],
        urls: {
          search: {
            base: "https://www.google.com/search",
            searchTermParamName: "q",
          },
        },
      },
    },
    {
      identifier: "baidu",
      base: {
        name: "百度",
        aliases: ["百度", "baidu"],
        urls: {
          search: {
            base: "https://www.baidu.com/baidu",
            searchTermParamName: "wd",
          },
        },
      },
    },
  ]);
});

test_newtab({
  async before() {
    // Some reason test-linux1804-64-qr/debug can end up with example.com, so
    // clear history so we only have the expected default top sites.
    await clearHistoryAndBookmarks();
    clearPinnedTopSites();
    return setDefaultTopSites();
  },
  // Test verifies the menu options for a default top site.
  test: async function defaultTopSites_menuOptions(defaultTopSites) {
    // The menu asserted below is the one a default, unpinned site gets.
    await content.waitForTopSite(defaultTopSites[0]);
    const siteSelector = `.top-site-outer:has(a.top-site-button[href="${defaultTopSites[0]}"])`;

    const contextMenuItems =
      await content.openContextMenuAndGetOptions(siteSelector);

    Assert.equal(contextMenuItems.length, 6, "Number of options is correct");

    const expectedItemsText = [
      "Pin",
      "Edit",
      "Add New Shortcut",
      "Open in a New Window",
      "Open in a New Private Window",
      "Dismiss",
    ];

    for (let i = 0; i < contextMenuItems.length; i++) {
      await ContentTaskUtils.waitForCondition(
        () => contextMenuItems[i].textContent === expectedItemsText[i],
        "Name option is correct"
      );
    }
  },
});

test_newtab({
  before: setDefaultTopSites,
  // Test verifies that the next top site in queue replaces a dismissed top site.
  test: async function defaultTopSites_dismiss(defaultTopSites) {
    const siteSelector =
      ".top-site-outer:not(.search-shortcut, .placeholder, .add-button-tile)";
    // Every configured site renders a tile, but the ones the search shortcuts
    // experiment matches render as search shortcuts, which siteSelector
    // excludes. The row also renders a tile at a time, so the presence of one
    // tile does not mean the whole set has arrived.
    const shortcutSelector = ".top-site-outer.search-shortcut";
    const count = selector =>
      content.document.querySelectorAll(selector).length;
    await ContentTaskUtils.waitForCondition(
      () =>
        count(siteSelector) + count(shortcutSelector) >= defaultTopSites.length,
      "Wait for the configured top sites to render"
    );

    const defaultTopSitesNumber = count(siteSelector);
    Assert.equal(
      defaultTopSitesNumber,
      defaultTopSites.length - count(shortcutSelector),
      "Every configured top site that is not a search shortcut is loaded"
    );

    // The href is on the `.top-site-button` anchor, not on the `.top-site-outer`
    // list item the selector matches.
    const siteHref = site =>
      site.querySelector(".top-site-button").getAttribute("href");

    // Skip the search topsites select the second default topsite
    const secondTopSite = siteHref(
      content.document.querySelectorAll(siteSelector)[1]
    );

    const contextMenuItems =
      await content.openContextMenuAndGetOptions(siteSelector);
    await ContentTaskUtils.waitForCondition(
      () => contextMenuItems[5].textContent === "Dismiss",
      "'Dismiss' is the last item in the context menu list"
    );

    contextMenuItems[5].click();

    // Wait for the topsite to be dismissed and the second one to replace it
    await ContentTaskUtils.waitForCondition(
      () =>
        siteHref(content.document.querySelector(siteSelector)) ===
        secondTopSite,
      "First default topsite was dismissed"
    );

    await ContentTaskUtils.waitForCondition(
      () => count(siteSelector) === defaultTopSitesNumber - 1,
      "One fewer top site is displayed after one of them is dismissed"
    );
  },
  async after() {
    await new Promise(resolve => NewTabUtils.undoAll(resolve));
  },
});

test_newtab({
  before: setDefaultTopSites,
  test: async function searchTopSites_dismiss() {
    const siteSelector = ".search-shortcut";
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelectorAll(siteSelector).length === 1,
      "1 search topsites is loaded by default"
    );

    const contextMenuItems =
      await content.openContextMenuAndGetOptions(siteSelector);
    is(
      contextMenuItems.length,
      2,
      "Search TopSites should only have Unpin and Dismiss"
    );

    // Unpin
    contextMenuItems[0].click();

    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelectorAll(siteSelector).length === 1,
      "1 search topsite displayed after we unpin the other one"
    );
  },
  after: () => {
    // Required for multiple test runs in the same browser, pref is used to
    // prevent pinning the same search topsite twice
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts.havePinned"
    );
  },
});
