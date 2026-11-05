/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Resizing a cropped mini window scales its zoom with the window, so the crop
// stays framed rather than drifting as the window grows or shrinks. This must
// hold even when the window is narrower than the page would be at the usual
// minimum zoom, where the MobileViewportManager would otherwise treat the zoom
// as pinned and stop scaling it.

// #crop-target in mini-window-crop-target.html: a 300x200 box at (100, 60).
const CROP = { left: 100, top: 60, width: 300, height: 200 };

/**
 * Wait until `browser`'s visual viewport sits on `crop` and contains it, with
 * the crop filling it on at least one axis. Classic root scrollbars, which
 * aren't scaled by the zoom, may take their size off the visual viewport.
 *
 * @param {XULBrowserElement} browser
 * @param {object} crop
 */
function waitForFramed(browser, crop) {
  return SpecialPowers.spawn(browser, [crop], async c => {
    let vv = content.visualViewport;
    await ContentTaskUtils.waitForCondition(() => {
      let scrollbarWidth = {};
      let scrollbarHeight = {};
      content.windowUtils.getScrollbarSizes(
        content.document.documentElement,
        scrollbarWidth,
        scrollbarHeight
      );
      return (
        Math.abs(vv.pageLeft - c.left) < 2 &&
        Math.abs(vv.pageTop - c.top) < 2 &&
        vv.width >= c.width - 2 - scrollbarWidth.value / vv.scale &&
        vv.height >= c.height - 2 - scrollbarHeight.value / vv.scale &&
        Math.min(vv.width - c.width, vv.height - c.height) < 2
      );
    }, "the visual viewport frames the crop");
  });
}

/**
 * @param {XULBrowserElement} browser
 * @returns {Promise<number>} The resolution of `browser`'s content.
 */
function getResolution(browser) {
  return SpecialPowers.spawn(browser, [], () =>
    content.windowUtils.getResolution()
  );
}

// The minimum zoom the MobileViewportManager uses for normal documents, e.g. on
// mobile.
const MIN_ZOOM = 0.25;

add_task(async function test_resize_keeps_crop_framed() {
  await SpecialPowers.pushPrefEnv({ set: [["apz.min_zoom", MIN_ZOOM]] });
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    CROP_TARGET_URL
  );

  // Several times what's needed for a crop-sized window to be narrower than
  // the page at minimum zoom, whatever the test machine's window size.
  let layoutWidth = Math.ceil((4 * CROP.width) / MIN_ZOOM);

  let miniWin = await popTabForTest(tab, {
    ...CROP,
    viewportWidth: layoutWidth,
    viewportHeight: tab.linkedBrowser.clientHeight,
    fullZoom: 1,
  });
  let popup = [...MiniWindowManager._miniwindows][0];
  await waitForFramed(popup.browser, CROP);

  let widthBefore = popup.browser.clientWidth;
  let resolutionBefore = await getResolution(popup.browser);
  info(
    `Before resizing: width ${widthBefore}, resolution ${resolutionBefore}, ` +
      `layout width ${layoutWidth}`
  );
  Assert.less(
    widthBefore,
    layoutWidth * MIN_ZOOM,
    "the window starts narrower than the page at the minimum zoom"
  );

  let vvResized = SpecialPowers.spawn(popup.browser, [], async () => {
    await ContentTaskUtils.waitForEvent(content.visualViewport, "resize");
  });
  let resized = BrowserTestUtils.waitForEvent(miniWin, "resize");
  miniWin.resizeTo(miniWin.outerWidth * 2, miniWin.outerHeight * 2);
  await resized;
  await vvResized;

  // The zoom should scale with exactly the window's width change. The screen
  // might not allow the full resize, so use the width the window ended up at.
  let widthAfter = popup.browser.clientWidth;
  let expected = resolutionBefore * (widthAfter / widthBefore);
  let resolution = await getResolution(popup.browser);
  info(
    `After resizing: width ${widthAfter}, resolution ${resolution}, ` +
      `expected ${expected}`
  );
  Assert.greater(widthAfter, widthBefore, "the window got wider");
  Assert.less(
    Math.abs(resolution - expected) / expected,
    0.01,
    "the zoom scales with the window's width"
  );
  await waitForFramed(popup.browser, CROP);

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});
