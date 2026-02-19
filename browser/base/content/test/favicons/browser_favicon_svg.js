/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { ImageTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ImageTestUtils.sys.mjs"
);

const TEST_ROOT =
  "http://mochi.test:8888/browser/browser/base/content/test/favicons/";

const PAGE_URL = TEST_ROOT + "file_favicon_svg.html";
const SVG_URL = TEST_ROOT + "file_favicon.svg";
const SVG_DATA_URL = `data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTAwIDEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iZ3JlZW4iIC8+Cjwvc3ZnPgo=`;

add_task(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.remoteSVGIconDecoding", true]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL, waitForLoad: false },
    async browser => {
      await waitForFavicon(browser, SVG_URL);
      is(browser.mIconURL, SVG_DATA_URL, "Got the SVG data URL");

      let tabIconImg = gBrowser
        .getTabForBrowser(browser)
        .querySelector(".tab-icon-image");

      let expectedParams = new URLSearchParams({
        url: SVG_DATA_URL,
        width: 16,
        height: 16,
      });

      is(
        tabIconImg.src,
        "moz-remote-image://?" + expectedParams,
        "Image was loaded with the moz-remote-image: protocol"
      );

      if (!tabIconImg.complete) {
        info("Awaiting tab-icon-image load");
        await new Promise(resolve =>
          tabIconImg.addEventListener("load", resolve, { once: true })
        );
      }

      let screenshotDataURL = TestUtils.screenshotArea(tabIconImg, window);
      await ImageTestUtils.assertEqualImage(
        window,
        screenshotDataURL,
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVQ4T2NkaGD4z0ABYBw1YNSAUQPAYBgYAACDTRgBSE6IpwAAAABJRU5ErkJggg==",
        "Got green favicon"
      );
    }
  );
});
