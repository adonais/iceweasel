/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// MiniWindowUtils.computeTransform and computeWindowRectForScreen are pure math
// over a crop rect, so they are tested here rather than in a browser test.
// computeWindowRect itself needs a real window and a real screen, and stays
// covered by browser/browser_framing.js and browser/browser_placement.js.

const { MiniWindowUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/miniwindow/MiniWindowUtils.sys.mjs"
);

add_task(async function test_compute_transform() {
  let { scale, tx, ty } = MiniWindowUtils.computeTransform(1000, {
    left: 50,
    top: 20,
    width: 500,
    height: 300,
  });
  Assert.equal(scale, 2, "computeTransform scales to fill the window width");
  Assert.equal(tx, -50, "computeTransform translates by -crop.left");
  Assert.equal(ty, -20, "computeTransform translates by -crop.top");

  let identity = MiniWindowUtils.computeTransform(800, {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  });
  Assert.equal(identity.scale, 1, "identity scale for a whole-viewport crop");
  Assert.equal(identity.tx, 0, "identity tx");
  Assert.equal(identity.ty, 0, "identity ty");

  // fullZoom folds into scale + translate: crop CSS px map to zoom chrome px.
  let zoomed = MiniWindowUtils.computeTransform(
    1000,
    { left: 50, top: 20, width: 500, height: 300 },
    2
  );
  Assert.equal(
    zoomed.scale,
    1,
    "zoom halves the fill scale (1000 / (500 * 2))"
  );
  Assert.equal(zoomed.tx, -100, "zoom scales translateX by fullZoom");
  Assert.equal(zoomed.ty, -40, "zoom scales translateY by fullZoom");
});

// A 1512x945 Retina Mac avail rect, below the menu bar. defaultCSSScaleFactor
// and contentsScaleFactor are both 2 there, so desktop px and CSS px coincide.
const RETINA = {
  availRect: { left: 0, top: 37, width: 1512, height: 945 },
  screenCssToDesktopScale: 1,
  originCssToDesktopScale: 1,
  isRTL: false,
};

add_task(async function test_window_rect_corners_bottom_right() {
  let rect = MiniWindowUtils.computeWindowRectForScreen(
    { width: 320, height: 240 },
    RETINA
  );

  Assert.equal(rect.width, 320, "a crop that fits keeps its width");
  Assert.equal(rect.height, 240, "a crop that fits keeps its height");
  Assert.equal(rect.left, 1192, "right edge on the avail rect's right edge");
  Assert.equal(rect.top, 742, "bottom edge on the avail rect's bottom edge");
});

add_task(async function test_window_rect_uses_whole_avail_rect() {
  // Dividing the avail rect by defaultCSSScaleFactor rather than by
  // defaultCSSScaleFactor / contentsScaleFactor would leave 756x472 here and
  // clamp this crop down to fit it.
  let rect = MiniWindowUtils.computeWindowRectForScreen(
    { width: 1400, height: 800 },
    RETINA
  );

  Assert.equal(rect.width, 1400, "a crop under the avail width is not clamped");
  Assert.equal(
    rect.height,
    800,
    "a crop under the avail height is not clamped"
  );
  Assert.equal(
    rect.left,
    112,
    "cornered against the avail rect, not its middle"
  );
  Assert.equal(
    rect.top,
    182,
    "cornered against the avail rect, not its middle"
  );
});

add_task(async function test_window_rect_clamps_preserving_aspect() {
  // Twice the avail rect and the same shape as it.
  let rect = MiniWindowUtils.computeWindowRectForScreen(
    { width: 3024, height: 1890 },
    RETINA
  );

  Assert.equal(rect.width, 1512, "clamped to the avail rect's width");
  Assert.equal(rect.height, 945, "clamped to the avail rect's height");
  Assert.equal(rect.left, 0, "a fully clamped window starts at the avail left");
  Assert.equal(rect.top, 37, "a fully clamped window starts at the avail top");
});

add_task(async function test_window_rect_scaled_screen() {
  // Windows at 150%: contentsScaleFactor is 1, so a CSS px is 1.5 desktop px.
  let rect = MiniWindowUtils.computeWindowRectForScreen(
    { width: 400, height: 300 },
    {
      availRect: { left: 0, top: 0, width: 2560, height: 1400 },
      screenCssToDesktopScale: 1.5,
      originCssToDesktopScale: 1.5,
      isRTL: false,
    }
  );

  Assert.equal(rect.width, 400, "size stays in the screen's CSS px");
  Assert.equal(rect.height, 300, "size stays in the screen's CSS px");
  Assert.equal(rect.left, 1307, "(2560 - 400 * 1.5) / 1.5, rounded");
  Assert.equal(rect.top, 633, "(1400 - 300 * 1.5) / 1.5, rounded");
});

add_task(async function test_window_rect_mixed_dpi_monitors() {
  // The mini window lands on a 100% monitor to the right of the 200% monitor
  // the tab was popped from, so the two scales differ.
  let rect = MiniWindowUtils.computeWindowRectForScreen(
    { width: 320, height: 240 },
    {
      availRect: { left: 2560, top: 0, width: 1920, height: 1080 },
      screenCssToDesktopScale: 1,
      originCssToDesktopScale: 2,
      isRTL: false,
    }
  );

  Assert.equal(rect.width, 320, "size uses the target screen's scale");
  Assert.equal(rect.left, 2080, "(2560 + 1920 - 320) / 2, in originWin CSS px");
  Assert.equal(rect.top, 420, "(1080 - 240) / 2, in originWin CSS px");
});

add_task(async function test_window_rect_rtl_corners_bottom_left() {
  let rect = MiniWindowUtils.computeWindowRectForScreen(
    { width: 320, height: 240 },
    { ...RETINA, availRect: { ...RETINA.availRect, left: 1512 }, isRTL: true }
  );

  Assert.equal(rect.left, 1512, "RTL pins to the avail rect's left edge");
  Assert.equal(rect.top, 742, "RTL still corners against the bottom");
});

add_task(async function test_full_tab_default_size() {
  Assert.deepEqual(
    MiniWindowUtils.fullTabSize(),
    { width: 640, height: 400 },
    "a full-tab mini window opens at 640x400"
  );
});
