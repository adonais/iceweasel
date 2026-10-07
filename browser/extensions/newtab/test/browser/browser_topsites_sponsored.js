"use strict";

const lazy = {};

const SPONSORED_TILE_SELECTOR = '.top-sites [data-is-sponsored-link="true"]';

ChromeUtils.defineESModuleGetters(lazy, {
  DEFAULT_TOP_SITES: "resource://newtab/lib/TopSitesFeed.sys.mjs",
});

/**
 * Wait for the newtab page to show a given number of sponsored top sites, and
 * assert that it does. Counting the whole row instead would depend on the
 * search engine, on what earlier tests pinned, and on whether there is a free
 * cell for the add-shortcut tile.
 *
 * @param browser {MozBrowser} The browser showing the newtab page.
 * @param count {Number} The number of sponsored tiles expected.
 */
async function waitForSponsoredTopSites(browser, count) {
  await SpecialPowers.spawn(
    browser,
    [SPONSORED_TILE_SELECTOR, count],
    async (selector, expected) => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelectorAll(selector).length === expected,
        `Wait for ${expected} sponsored top sites`
      );
      Assert.equal(
        content.document.querySelectorAll(selector).length,
        expected,
        `The page shows ${expected} sponsored top sites`
      );
    }
  );
}

/**
 * Open a newtab page showing both sponsored top sites and run a task on it.
 *
 * @param callback {Function} Called with the newtab's browser, in the parent
 *                            process, once the sponsored tiles have rendered.
 */
async function newtabWithSponsoredTopsites(callback = () => {}) {
  // Open about:newtab without using the default load listener
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab",
    false
  );

  // Specially wait for potentially preloaded browsers
  let browser = tab.linkedBrowser;
  await waitForPreloaded(browser);

  // Force TopSitesFeed to re-broadcast its state to the now-connected content
  // process. The initial broadcast from add_setup may have fired before this
  // tab's content process was registered to receive messages.
  Services.prefs.setBoolPref(
    "browser.newtabpage.activity-stream.showSponsoredTopSites",
    false
  );
  Services.prefs.setBoolPref(
    "browser.newtabpage.activity-stream.showSponsoredTopSites",
    true
  );

  // Wait for the re-broadcast to conclude and for both sponsored topsites to
  // render: the row arrives a tile at a time, so the first one is not the set.
  await waitForSponsoredTopSites(browser, 2);

  try {
    await callback(browser);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

add_setup(async function () {
  lazy.DEFAULT_TOP_SITES.push(
    {
      isDefault: true,
      url: "https://example.com/",
      hostname: "example",
      label: "Example Sponsor",
      show_sponsored_label: true,
      sponsored_position: 1,
      sponsored_tile_id: "test-tile-1",
      partner: "test",
      block_key: "test-tile-1",
      faviconSize: 16,
    },
    {
      isDefault: true,
      url: "https://example2.com/",
      hostname: "example2",
      label: "Example Sponsor",
      show_sponsored_label: true,
      sponsored_position: 2,
      sponsored_tile_id: "test-tile-2",
      partner: "test",
      block_key: "test-tile-2",
      faviconSize: 16,
    }
  );

  await pushPrefs([
    "browser.newtabpage.activity-stream.showSponsoredTopSites",
    true,
  ]);
  let topSitesFeed = AboutNewTab.activityStream.store.feeds.get(
    "feeds.system.topsites"
  );
  await topSitesFeed.refresh({ broadcast: true });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.unifiedAds.blockedAds"
    );
    Services.prefs.clearUserPref("browser.topsites.blockedSponsors");
    Services.prefs.clearUserPref("browser.newtabpage.blocked");

    // Clearing the preference does not reset NewTabUtils.blockedLinks'
    // in-memory copy, and the feed does not re-read it on its own.
    await new Promise(resolve => NewTabUtils.undoAll(resolve));
    await topSitesFeed.refresh({ broadcast: true });

    lazy.DEFAULT_TOP_SITES.length = 0;
  });
});

add_task(async function test_dismiss() {
  await newtabWithSponsoredTopsites(async browser => {
    await SpecialPowers.spawn(
      browser,
      [SPONSORED_TILE_SELECTOR],
      async selector => {
        const contextMenuDiv = content.document.querySelector(
          `${selector} + div`
        );

        const contextMenuButton = contextMenuDiv.querySelector(
          ".context-menu-button"
        );

        contextMenuButton.click();

        await ContentTaskUtils.waitForCondition(
          () => contextMenuDiv.querySelector("panel-list"),
          "Should find context menu after clicking button"
        );

        const contextMenu = contextMenuDiv.querySelector("panel-list");

        // "Dismiss" is the 4th item in the context menu.
        const dismissButton = contextMenu.children.item(3);

        dismissButton.click();
      }
    );

    await waitForSponsoredTopSites(browser, 1);
  });
});
