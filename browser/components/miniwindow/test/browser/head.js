/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MiniWindowManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/miniwindow/MiniWindowManager.sys.mjs"
);

const TEST_FILE_BASE =
  "https://example.com/browser/browser/components/miniwindow/test/browser/";
const CROP_TARGET_URL = TEST_FILE_BASE + "mini-window-crop-target.html";
const REDIRECT_URL = TEST_FILE_BASE + "mini-window-redirect.html";

/**
 * Full-viewport cropInfo for a browser (whole-tab / identity transform).
 *
 * @param {XULBrowserElement} browser
 */
function fullViewportCropInfo(browser) {
  return {
    left: 0,
    top: 0,
    width: browser.clientWidth,
    height: browser.clientHeight,
    viewportLeft: 0,
    viewportTop: 0,
    viewportWidth: browser.clientWidth,
    viewportHeight: browser.clientHeight,
    fullZoom: browser.fullZoom,
  };
}

/**
 * Open a popup for `tab` and resolve to the popup window once framed.
 *
 * @param {MozTabbrowserTab} tab
 * @param {object} cropInfo
 */
async function popTabForTest(tab, cropInfo) {
  let browser = tab.linkedBrowser;
  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  let winPromise = MiniWindowManager.popRegion(
    tab,
    cropInfo ?? fullViewportCropInfo(browser)
  );
  let miniWin = await opened;
  await winPromise;
  return miniWin;
}

/**
 * Move the pointer to a point in `win`'s client coordinates, resolving once
 * MousePosTracker has seen the move.
 *
 * @param {Window} win
 * @param {number} x
 * @param {number} y
 */
async function moveMouseTo(win, x, y) {
  let moved = BrowserTestUtils.waitForEvent(win, "mousemove");
  EventUtils.synthesizeMouseAtPoint(x, y, { type: "mousemove" }, win);
  await moved;
}

/**
 * No leaked always-on-top popups remain. Checks the open windows themselves as
 * well as the manager's registry, so a bookkeeping slip in MiniWindowManager
 * can't hide a window that is still on screen.
 */
function assertNoMiniWindowsOpen() {
  Assert.equal(
    MiniWindowManager._miniwindows.size,
    0,
    "No mini window popups left registered"
  );

  let stragglers = [];
  for (let win of Services.wm.getEnumerator("navigator:browser")) {
    if (win.document.documentElement.hasAttribute("mini-window")) {
      stragglers.push(win.gBrowser?.selectedBrowser?.currentURI?.spec ?? "?");
    }
  }
  Assert.deepEqual(stragglers, [], "No mini window documents left open");
}

/**
 * Remove leftover test tabs (tabs get moved between windows, so tests track
 * them by URL rather than by reference).
 *
 * @param {string} [urlPrefix]
 */
function removeTestTabs(urlPrefix = "https://example.com/") {
  for (let t of [...gBrowser.tabs]) {
    if (t.linkedBrowser?.currentURI?.spec.startsWith(urlPrefix)) {
      BrowserTestUtils.removeTab(t);
    }
  }
}

/**
 * Parse the x/y out of a CSS "translate(Xpx, Ypx)" transform. CSS serializes
 * translate(0px, 0px) down to translate(0px), so the second value is optional
 * and defaults to 0.
 *
 * @param {string} transform
 */
function parseTranslate(transform) {
  let m = /translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(transform);
  return m
    ? { x: parseFloat(m[1]), y: m[2] !== undefined ? parseFloat(m[2]) : 0 }
    : null;
}

/**
 * Pop the whole `tab` into a full-tab mini window and resolve to the mini
 * window once framed.
 *
 * @param {MozTabbrowserTab} tab
 */
async function popWholeTabForTest(tab) {
  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  let winPromise = MiniWindowManager.popTab(tab);
  let miniWin = await opened;
  await winPromise;
  return miniWin;
}
