/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Rect } = ChromeUtils.importESModule(
  "resource://gre/modules/Geometry.sys.mjs"
);

/**
 * A window's on-screen outer rect, in CSS px.
 *
 * @param {Window} win
 * @returns {Rect}
 */
function outerRect(win) {
  return new Rect(win.screenX, win.screenY, win.outerWidth, win.outerHeight);
}

/**
 * A small fixed cropInfo (320x240) for popping several mini windows whose
 * placement is easy to reason about.
 *
 * @param {XULBrowserElement} browser
 * @returns {object} cropInfo for popTabForTest.
 */
function smallCropInfo(browser) {
  return {
    left: 0,
    top: 0,
    width: 320,
    height: 240,
    viewportLeft: 0,
    viewportTop: 0,
    viewportWidth: browser.clientWidth,
    viewportHeight: browser.clientHeight,
    fullZoom: browser.fullZoom,
  };
}

add_task(async function test_second_mini_window_avoids_the_first() {
  let tabs = [];
  for (let i = 0; i < 2; i++) {
    tabs.push(
      await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        `https://example.com/?mini=${i}`
      )
    );
  }

  let first = await popTabForTest(
    tabs[0],
    smallCropInfo(tabs[0].linkedBrowser)
  );
  let second = await popTabForTest(
    tabs[1],
    smallCropInfo(tabs[1].linkedBrowser)
  );

  let firstRect = outerRect(first);
  let secondRect = outerRect(second);
  info(`first ${JSON.stringify(firstRect)}`);
  info(`second ${JSON.stringify(secondRect)}`);

  Assert.ok(
    !firstRect.intersects(secondRect),
    "the second mini window opened clear of the first"
  );

  for (let mini of [...MiniWindowManager._miniwindows]) {
    mini.close();
  }

  await waitForNoMiniWindowsOpen();
  removeTestTabs();
});

/**
 * The available rect of `win`'s screen, in the same CSS px as outerRect.
 *
 * @param {Window} win
 * @returns {Rect}
 */
function availRect(win) {
  let s = win.screen;
  return new Rect(s.availLeft, s.availTop, s.availWidth, s.availHeight);
}

/**
 * Which screen quadrant a rect's centre sits in. A window parked in a corner
 * lands in that corner's quadrant; comparing centres to the screen midpoint
 * tolerates the chrome overflow and DPI scaling that exact edge maths wouldn't.
 *
 * @param {Rect} rect - a window's outer rect.
 * @param {Rect} avail - the screen's available rect.
 * @returns {string} one of "top-left", "top-right", "bottom-left", "bottom-right".
 */
function quadrant(rect, avail) {
  let cx = rect.left + rect.width / 2;
  let cy = rect.top + rect.height / 2;
  let midX = avail.left + avail.width / 2;
  let midY = avail.top + avail.height / 2;
  return `${cy < midY ? "top" : "bottom"}-${cx < midX ? "left" : "right"}`;
}

add_task(async function test_many_windows_fill_corners_without_overlapping() {
  const COUNT = 8;
  let wins = [];
  for (let i = 0; i < COUNT; i++) {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `https://example.com/?fill=${i}`
    );
    wins.push(await popTabForTest(tab, smallCropInfo(tab.linkedBrowser)));
  }

  let rects = wins.map(outerRect);
  rects.forEach((r, i) => info(`window ${i}: ${JSON.stringify(r)}`));

  // No two mini windows overlap.
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      Assert.ok(
        !rects[i].intersects(rects[j]),
        `window ${i} and window ${j} do not overlap`
      );
    }
  }

  // The first four each take a different screen corner before any of the later
  // windows fall back to sitting flush against another.
  let avail = availRect(wins[0]);
  let firstFourCorners = new Set(
    rects.slice(0, 4).map(r => quadrant(r, avail))
  );
  Assert.equal(
    firstFourCorners.size,
    4,
    "the first four windows fill the four screen corners"
  );

  for (let mini of [...MiniWindowManager._miniwindows]) {
    mini.close();
  }
  await waitForNoMiniWindowsOpen();
  removeTestTabs();
});
