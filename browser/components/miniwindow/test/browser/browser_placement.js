/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// computeWindowRect is exercised against the real screen rather than through
// an opened popup: the window manager is free to clamp or nudge a real window,
// which would make assertions about its final position flaky.

const { MiniWindowUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/miniwindow/MiniWindowUtils.sys.mjs"
);

/**
 * The avail rect of the screen `win` is on, in desktop px, derived
 * independently of MiniWindowUtils so the two can be compared.
 *
 * @param {Window} win
 */
function availRectDesktopPx(win) {
  let sm = Cc["@mozilla.org/gfx/screenmanager;1"].getService(
    Ci.nsIScreenManager
  );
  let cssToDesktop = win.devicePixelRatio / win.desktopToDeviceScale;
  let screen = sm.screenForRect(
    win.screenX * cssToDesktop,
    win.screenY * cssToDesktop,
    win.outerWidth * cssToDesktop,
    win.outerHeight * cssToDesktop
  );
  let l = {},
    t = {},
    w = {},
    h = {};
  screen.GetAvailRectDisplayPix(l, t, w, h);
  return {
    left: l.value,
    top: t.value,
    width: w.value,
    height: h.value,
    cssToDesktop,
    screenCssToDesktop:
      screen.defaultCSSScaleFactor / screen.contentsScaleFactor,
  };
}

/**
 * A computeWindowRect result's far corner in desktop px. Position comes back in
 * originWin CSS px and size in the target screen's CSS px, so the two axes
 * convert with different ratios.
 *
 * @param {object} rect
 * @param {object} avail
 */
function farCornerDesktopPx(rect, avail) {
  return {
    right:
      rect.left * avail.cssToDesktop + rect.width * avail.screenCssToDesktop,
    bottom:
      rect.top * avail.cssToDesktop + rect.height * avail.screenCssToDesktop,
  };
}

add_task(async function test_crop_that_fits_corners_bottom_right() {
  let avail = availRectDesktopPx(window);
  let rect = MiniWindowUtils.computeWindowRect(window, {
    width: 320,
    height: 240,
  });

  Assert.equal(rect.width, 320, "a crop that fits keeps its width");
  Assert.equal(rect.height, 240, "a crop that fits keeps its height");

  let { right, bottom } = farCornerDesktopPx(rect, avail);
  // Rounding the position back into CSS px can move a corner by under one px.
  let slop = Math.max(1, avail.cssToDesktop);
  Assert.lessOrEqual(
    Math.abs(right - (avail.left + avail.width)),
    slop,
    "right edge lands on the avail rect's right edge"
  );
  Assert.lessOrEqual(
    Math.abs(bottom - (avail.top + avail.height)),
    slop,
    "bottom edge lands on the avail rect's bottom edge"
  );
});

add_task(async function test_oversized_crop_clamps_to_avail_rect() {
  let avail = availRectDesktopPx(window);
  let availCssWidth = avail.width / avail.screenCssToDesktop;
  let availCssHeight = avail.height / avail.screenCssToDesktop;

  // Twice the avail rect and the same shape as it, so the clamp has to bind on
  // both axes at once.
  let rect = MiniWindowUtils.computeWindowRect(window, {
    width: Math.round(availCssWidth * 2),
    height: Math.round(availCssHeight * 2),
  });

  Assert.lessOrEqual(
    rect.width,
    Math.ceil(availCssWidth),
    "clamped down to the avail rect's width"
  );
  Assert.lessOrEqual(
    rect.height,
    Math.ceil(availCssHeight),
    "clamped down to the avail rect's height"
  );
  // Treating desktop px as CSS px shrinks the avail rect by contentsScaleFactor
  // (2 on a HiDPI screen), which would clamp to half the screen or less.
  Assert.greater(
    rect.width,
    availCssWidth / 2,
    "avail rect was not scaled down before clamping"
  );
  Assert.greater(
    rect.height,
    availCssHeight / 2,
    "avail rect was not scaled down before clamping"
  );
});

add_task(async function test_rtl_corners_bottom_left() {
  await SpecialPowers.pushPrefEnv({ set: [["intl.l10n.pseudo", "bidi"]] });
  Assert.ok(Services.locale.isAppLocaleRTL, "app locale is RTL for this task");

  let avail = availRectDesktopPx(window);
  let rect = MiniWindowUtils.computeWindowRect(window, {
    width: 320,
    height: 240,
  });

  Assert.lessOrEqual(
    Math.abs(rect.left * avail.cssToDesktop - avail.left),
    Math.max(1, avail.cssToDesktop),
    "RTL pins the window to the avail rect's left edge"
  );

  await SpecialPowers.popPrefEnv();
});
