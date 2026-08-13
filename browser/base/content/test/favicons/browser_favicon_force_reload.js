/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const BASE_URL =
  "https://example.com/browser/browser/base/content/test/favicons";
const ICON_URL = BASE_URL + "/moz.png";

// A small 1x1 PNG used as stand-in data when injecting stale icon associations
// directly into Places.
const STALE_FAVICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

registerCleanupFunction(async () => {
  Services.cache2.clear();
  await PlacesTestUtils.clearFavicons();
  await PlacesUtils.history.clear();
});

async function countAssociations(pageURL) {
  let db = await PlacesUtils.promiseDBConnection();
  let rows = await db.execute(
    `SELECT count(*) FROM moz_icons_to_pages itp
     JOIN moz_pages_w_icons p ON p.id = itp.page_id
     WHERE p.page_url = :url`,
    { url: pageURL }
  );
  return rows[0].getResultByIndex(0);
}

add_task(async function test_force_reload_clears_stale_icons() {
  Services.cache2.clear();

  const PAGE_URL = BASE_URL + "/file_force_reload_page.html?test=force";
  const STALE_ICON_URL = BASE_URL + "/stale-icon.png";

  let iconRequestCount = 0;
  let observer = {
    observe(subject) {
      try {
        if (subject.QueryInterface(Ci.nsIHttpChannel).URI.spec == ICON_URL) {
          iconRequestCount++;
        }
      } catch (e) {}
    },
  };
  Services.obs.addObserver(observer, "http-on-modify-request");

  let faviconStoredPromise = PlacesTestUtils.waitForNotification(
    "favicon-changed",
    events => events.some(e => e.url == PAGE_URL)
  );

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async browser => {
      await faviconStoredPromise;

      Assert.equal(iconRequestCount, 1, "Server should have been hit once");

      // Inject a stale icon association into Places, simulating accumulated state.
      await PlacesTestUtils.setFaviconForPage(
        PAGE_URL,
        STALE_ICON_URL,
        STALE_FAVICON_DATA_URL
      );

      Assert.equal(
        await countAssociations(PAGE_URL),
        2,
        "Should have 2 icon associations before force reload"
      );

      // Force reload: should clear stale icons and re-fetch from server.
      let faviconChangedPromise = PlacesTestUtils.waitForNotification(
        "favicon-changed",
        events => events.some(e => e.url == PAGE_URL)
      );
      await BrowserTestUtils.reloadTab(gBrowser.getTabForBrowser(browser), {
        bypassCache: true,
      });
      await faviconChangedPromise;

      Assert.equal(
        iconRequestCount,
        2,
        "Server should have been hit again on force reload (cache bypassed)"
      );

      Assert.equal(
        await countAssociations(PAGE_URL),
        1,
        "Should only have 1 icon association after force reload"
      );

      let favicon = await PlacesUtils.favicons.getFaviconForPage(
        Services.io.newURI(PAGE_URL)
      );
      Assert.equal(
        favicon.uri.spec,
        ICON_URL,
        "Favicon should be the real icon, not the stale one"
      );
    }
  ).finally(() => {
    Services.obs.removeObserver(observer, "http-on-modify-request");
  });
});

add_task(async function test_regular_reload_preserves_icons() {
  Services.cache2.clear();

  const PAGE_URL = BASE_URL + "/file_force_reload_page.html?test=regular";
  const EXTRA_ICON_URL = BASE_URL + "/extra-icon.png";

  let faviconStoredPromise = PlacesTestUtils.waitForNotification(
    "favicon-changed",
    events => events.some(e => e.url == PAGE_URL)
  );

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async browser => {
      await faviconStoredPromise;

      // Inject an extra icon association.
      await PlacesTestUtils.setFaviconForPage(
        PAGE_URL,
        EXTRA_ICON_URL,
        STALE_FAVICON_DATA_URL
      );

      Assert.equal(
        await countAssociations(PAGE_URL),
        2,
        "Should have 2 icon associations before regular reload"
      );

      // Regular reload: should not clear icon associations.
      let faviconChangedPromise = PlacesTestUtils.waitForNotification(
        "favicon-changed",
        events => events.some(e => e.url == PAGE_URL)
      );
      await BrowserTestUtils.reloadTab(gBrowser.getTabForBrowser(browser));
      await faviconChangedPromise;

      Assert.equal(
        await countAssociations(PAGE_URL),
        2,
        "Regular reload should not clear icon associations"
      );
    }
  );
});
