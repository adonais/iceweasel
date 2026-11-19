/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that a non-rich icon picked as rich icon because of its declared size
// doesn't replace the tab icon.

const ROOT =
  "https://example.com/browser/browser/base/content/test/browser-favicons/";
const PAGE_URL = ROOT + "file_sized_ico_and_svg.html";
const ICO_URL = ROOT + "file_multiple.ico";
const SVG_URL = ROOT + "file_favicon.svg";

add_setup(async function () {
  await PlacesTestUtils.clearFavicons();
  await PlacesUtils.history.clear();
  registerCleanupFunction(async () => {
    Services.cache2.clear();
    await PlacesTestUtils.clearFavicons();
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_sized_icon_does_not_replace_tab_icon() {
  let tabIconURLs = [];
  let listener = {
    onLinkIconAvailable(browser, dataURI, iconURI) {
      if (browser == gBrowser.selectedBrowser && iconURI) {
        tabIconURLs.push(iconURI);
      }
    },
  };
  gBrowser.addTabsProgressListener(listener);
  registerCleanupFunction(() => gBrowser.removeTabsProgressListener(listener));

  // The tab icon is set right after storing the icon, so once both icons are
  // stored any tab icon change caused by them already happened.
  let storedIcons = new Set();
  let iconsStoredPromise = PlacesTestUtils.waitForNotification(
    "favicon-changed",
    events => {
      for (let e of events) {
        if (e.url == PAGE_URL) {
          storedIcons.add(e.faviconUrl);
        }
      }
      return storedIcons.has(ICO_URL) && storedIcons.has(SVG_URL);
    }
  );

  await BrowserTestUtils.withNewTab(PAGE_URL, async browser => {
    await iconsStoredPromise;

    Assert.deepEqual(
      tabIconURLs,
      [SVG_URL],
      "Only the SVG icon should have been set as tab icon"
    );
    ok(
      gBrowser
        .getIcon(gBrowser.getTabForBrowser(browser))
        .startsWith("data:image/svg+xml;"),
      "The tab icon should be the SVG"
    );
  });
});
