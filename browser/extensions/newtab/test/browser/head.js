"use strict";

ChromeUtils.defineESModuleGetters(this, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  DiscoveryStreamFeed: "resource://newtab/lib/DiscoveryStreamFeed.sys.mjs",
  ObjectUtils: "resource://gre/modules/ObjectUtils.sys.mjs",
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
  QueryCache: "resource:///modules/asrouter/ASRouterTargeting.sys.mjs",
});

// We import sinon here to make it available across all mochitest test files
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function popPrefs() {
  return SpecialPowers.popPrefEnv();
}
function pushPrefs(...prefs) {
  return SpecialPowers.pushPrefEnv({ set: prefs });
}

/**
 * Wait until `url` is in the parent's top sites row, asking TopSitesFeed to
 * rebuild and broadcast the row on every try. The retry is for more than the
 * refresh's own latency: refresh() rebuilds from a module-level list that only
 * the feed's default.sites observer fills, so an early try can compute the row
 * the test just replaced. The caches are expired because clearPinnedTopSites
 * unpins through NewTabUtils rather than through the feed.
 */
async function refreshTopSites(url) {
  // onBrowserReady() assigns activityStream asynchronously.
  await AboutNewTab.activityStreamPromise;
  await TestUtils.waitForCondition(async () => {
    const feed = AboutNewTab.activityStream.store.feeds.get(
      "feeds.system.topsites"
    );
    feed.frecentCache.expire();
    feed.pinnedCache.expire();
    await feed.refresh({ broadcast: true });
    return AboutNewTab.getTopSites().some(row => row?.url === url);
  }, `Wait for ${url} in the top sites row`);
}

// The sites setDefaultTopSites configures, in the order they fill the grid.
const DEFAULT_TOP_SITES = [
  "https://www.youtube.com/",
  "https://www.facebook.com/",
  "https://www.baidu.com/",
  "https://www.reddit.com/",
  "https://www.wikipedia.org/",
  "https://twitter.com/",
];

// Using a topsite with example.com allows us to open the topsite without a
// network request.
const TEST_TOP_SITE = "https://example.com/";

async function setDefaultTopSites() {
  // The pref for TopSites is empty by default.
  await pushPrefs([
    "browser.newtabpage.activity-stream.default.sites",
    DEFAULT_TOP_SITES.join(","),
  ]);
  await pushPrefs([
    "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts",
    true,
  ]);
  // The shortcuts to pin are region-derived, and Baidu is only listed for CN,
  // so ask for it explicitly rather than depending on the test's region.
  await pushPrefs([
    "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts.searchEngines",
    "baidu",
  ]);
  await refreshTopSites(DEFAULT_TOP_SITES[0]);
  return DEFAULT_TOP_SITES;
}

/**
 * Unpins every top site. Pinning writes browser.newtabpage.pinned, a real pref
 * that no pref environment pops, so a site a test pins stays pinned for the
 * rest of the browser session.
 */
function clearPinnedTopSites() {
  for (const link of [...NewTabUtils.pinnedLinks.links]) {
    if (link) {
      NewTabUtils.pinnedLinks.unpin(link);
    }
  }
  // Lets setDefaultTopSites pin its search shortcut again.
  Services.prefs.clearUserPref(
    "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts.havePinned"
  );
}

// Whatever a test pins is still pinned when the next test file starts, so every
// file in this folder starts from an unpinned row.
add_setup(clearPinnedTopSites);

async function setTestTopSites() {
  await pushPrefs([
    "browser.newtabpage.activity-stream.improvesearch.topSiteSearchShortcuts",
    false,
  ]);
  // The pref for TopSites is empty by default.
  await pushPrefs([
    "browser.newtabpage.activity-stream.default.sites",
    TEST_TOP_SITE,
  ]);
  await refreshTopSites(TEST_TOP_SITE);
  return TEST_TOP_SITE;
}

// `.top-sites-list` is the grid itself: the `.top-sites` section also holds
// the edit form's preview, which TopSiteForm renders with the same
// TopSiteLink. A search shortcut renders no href, so matching one excludes it.
function topSiteLinkSelector(url) {
  return `.top-sites-list a.top-site-button[href="${url}"]`;
}

/**
 * Wait for the link of a top site to render.
 *
 * @param tabbrowser {MozTabbrowser} The tabbrowser whose selected tab shows
 *                                   the newtab page. Not the browser element:
 *                                   a preloaded newtab is swapped in, which
 *                                   detaches the element the caller started
 *                                   with.
 * @param url {String} The top site's URL, as configured.
 */
async function waitForTopSiteLink(tabbrowser, url) {
  await SpecialPowers.spawn(
    tabbrowser.selectedBrowser,
    [topSiteLinkSelector(url)],
    async selector => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector(selector),
        `Wait for the top site link ${selector}`
      );
    }
  );
}

/**
 * Accel-click a top site's link, which opens the site in a background tab.
 *
 * @param tabbrowser {MozTabbrowser} The tabbrowser whose selected tab shows
 *                                   the newtab page.
 * @param url {String} The top site's URL, as configured.
 * @return {Promise<MozTabbrowserTab>} The tab the click opens, once loaded.
 */
async function openTopSiteInNewTab(tabbrowser, url) {
  const tabPromise = BrowserTestUtils.waitForNewTab(tabbrowser, url, true);
  await BrowserTestUtils.synthesizeMouse(
    topSiteLinkSelector(url),
    2,
    2,
    { accelKey: true },
    tabbrowser.selectedBrowser
  );
  return tabPromise;
}

async function clearHistoryAndBookmarks() {
  await PlacesUtils.bookmarks.eraseEverything();
  await PlacesUtils.history.clear();
  QueryCache.expireAll();
}

/**
 * Helper to wait for potentially preloaded browsers to "load" where a preloaded
 * page has already loaded and won't trigger "load", and a "load"ed page might
 * not necessarily have had all its javascript/render logic executed.
 */
async function waitForPreloaded(browser) {
  if (
    browser.webProgress.isLoadingDocument ||
    !browser.currentURI?.spec ||
    browser.currentURI.spec === "about:blank"
  ) {
    // Not browserLoaded: isLoadingDocument clears on the stop browserStopped
    // waits for, while the load event rides an earlier one. An aborted stop
    // clears the flag too, hence checkAborts.
    await BrowserTestUtils.browserStopped(
      browser,
      null,
      true /* checkAborts */
    );
  }
}

/**
 * Helper to force the HighlightsFeed to update.
 */
function refreshHighlightsFeed() {
  // Toggling the pref will clear the feed cache and force a places query.
  Services.prefs.setBoolPref(
    "browser.newtabpage.activity-stream.feeds.section.highlights",
    false
  );
  Services.prefs.setBoolPref(
    "browser.newtabpage.activity-stream.feeds.section.highlights",
    true
  );
}

function clearHighlightsBookmarks() {
  Services.prefs.setBoolPref(
    "browser.newtabpage.activity-stream.feeds.section.highlights",
    false
  );
}

/**
 * Helper to populate the Highlights section with bookmark cards.
 *
 * @param count Number of items to add.
 */
async function addHighlightsBookmarks(count) {
  const bookmarks = new Array(count).fill(null).map((entry, i) => ({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    title: "foo",
    url: `https://mozilla${i}.com/nowNew`,
  }));

  for (let placeInfo of bookmarks) {
    await PlacesUtils.bookmarks.insert(placeInfo);
    // Bookmarks need at least one visit to show up as highlights.
    await PlacesTestUtils.addVisits(placeInfo.url);
  }

  // Force HighlightsFeed to make a request for the new items.
  refreshHighlightsFeed();
}

/**
 * Helper to add various helpers to the content process by injecting variables
 * and functions to the `content` global.
 */
function addContentHelpers() {
  const { document } = content;
  Object.assign(content, {
    /**
     * Wait for the first tile of a real top site. The row also holds search
     * shortcuts, placeholders and the "Add shortcut" tile, which carry either a
     * different context menu or none at all.
     *
     * @return {Promise<Element>} The site's `.top-site-outer` tile.
     */
    async waitForAnyTopSite() {
      const selector =
        ".top-site-outer:not(.search-shortcut, .placeholder, .add-button-tile)";
      await ContentTaskUtils.waitForCondition(
        () => document.querySelector(selector),
        "Wait for a top site tile"
      );
      return document.querySelector(selector);
    },

    /**
     * Click the context menu button for an item and get its options list.
     *
     * @param itemOrSelector {Element|String} An item (e.g., top site, card),
     *   or a selector to get one.
     * @return {Array} The nodes for the options.
     */
    async openContextMenuAndGetOptions(itemOrSelector) {
      const item =
        typeof itemOrSelector === "string"
          ? document.querySelector(itemOrSelector)
          : itemOrSelector;
      const contextButton = item.querySelector(".context-menu-button");
      contextButton.click();
      // Gives fluent-dom the time to render strings
      await new Promise(r => content.requestAnimationFrame(r));

      const panelList = item.querySelector("panel-list");
      return [...panelList.children].filter(
        child => child.localName === "panel-item"
      );
    },

    /**
     * Wait for the tile of a given top site. Which site the grid puts first
     * depends on history and on what earlier tests left pinned, so a test that
     * needs a specific site has to name it.
     *
     * @param url {String} The top site's URL, as configured.
     * @return {Promise<Element>} The site's `.top-site-outer` tile.
     */
    async waitForTopSite(url) {
      const selector = `.top-site-outer:has(a.top-site-button[href="${url}"])`;
      await ContentTaskUtils.waitForCondition(
        () => document.querySelector(selector),
        `Wait for the ${url} top site tile`
      );
      return document.querySelector(selector);
    },

    /**
     * Wait for a menu item of one tile's context menu. Every tile renders its
     * `panel-list` and all of its items up front, and the lists differ in
     * length by tile type, so neither a document-wide `panel-item` query nor a
     * fixed index identifies an item.
     *
     * @param tile {Element} The tile whose menu to search.
     * @param l10nId {String} The item's Fluent id, e.g. "newtab-menu-pin".
     * @return {Promise<Element>} The `panel-item`.
     */
    async waitForPanelItem(tile, l10nId) {
      const item = () =>
        [...tile.querySelectorAll("panel-item")].find(
          candidate =>
            candidate.querySelector("[data-l10n-id]")?.dataset.l10nId === l10nId
        );
      await ContentTaskUtils.waitForCondition(
        item,
        `Wait for the ${l10nId} menu item`
      );
      return item();
    },
  });
}

/**
 * Helper to run Activity Stream about:newtab test tasks in content.
 *
 * @param testInfo {Function|Object}
 *   {Function} This parameter will be used as if the function were called with
 *              an Object with this parameter as "test" key's value.
 *   {Object} The following keys are expected:
 *     before {Function} Optional. Runs before and returns an arg for "test"
 *     test   {Function} The test to run in the about:newtab content task taking
 *                       an arg from "before" and returns a result to "after"
 *     after  {Function} Optional. Runs after and with the result of "test"
 * @param browserURL {optional String}
 *   {String} This parameter is used to explicitly specify URL opened in new tab
 */
function test_newtab(testInfo, browserURL = "about:newtab") {
  // Extract any test parts or default to just the single content task
  let { before, test: contentTask, after } = testInfo;
  if (!before) {
    before = () => ({});
  }
  if (!contentTask) {
    contentTask = testInfo;
  }
  if (!after) {
    after = () => {};
  }

  // Helper to push prefs for just this test and pop them when done
  let needPopPrefs = false;
  let scopedPushPrefs = async (...args) => {
    needPopPrefs = true;
    await pushPrefs(...args);
  };
  let scopedPopPrefs = async () => {
    if (needPopPrefs) {
      await popPrefs();
    }
  };

  // Make the test task with optional before/after and content task to run in a
  // new tab that opens and closes.
  let testTask = async () => {
    // Open about:newtab without using the default load listener
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      browserURL,
      false
    );

    // Specially wait for potentially preloaded browsers
    let browser = tab.linkedBrowser;
    await waitForPreloaded(browser);

    // Add shared helpers to the content process
    SpecialPowers.spawn(browser, [], addContentHelpers);

    // Chain together before -> contentTask -> after data passing
    try {
      // Wait for React to render something
      await TestUtils.waitForCondition(
        () =>
          SpecialPowers.spawn(
            browser,
            [],
            () => content.document.getElementById("root").children.length
          ),
        "Should render activity stream content"
      );

      let contentArg = await before({ pushPrefs: scopedPushPrefs, tab });
      let contentResult = await SpecialPowers.spawn(
        browser,
        [contentArg],
        contentTask
      );
      await after(contentResult);
    } finally {
      // Clean up for next tests
      BrowserTestUtils.removeTab(tab);
      await scopedPopPrefs();
    }
  };

  // Copy the name of the content task to identify the test
  Object.defineProperty(testTask, "name", { value: contentTask.name });
  add_task(testTask);
}
