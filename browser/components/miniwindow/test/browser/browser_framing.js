/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Framing is chrome-side: MiniWindow lays the browser element out at full
// page size and applies a CSS scale()/translate() transform to frame the
// crop. This file covers the transform actually landing on popup.browser; the
// pure math is in xpcshell/test_MiniWindowUtils.js.

add_task(async function test_whole_tab_transform_is_near_identity() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let miniWin = await popTabForTest(tab); // full viewport crop
  let popup = [...MiniWindowManager._miniwindows][0];
  let t = popup.browser.style.transform;

  Assert.ok(/scale\(/.test(t), `transform has a scale(), got "${t}"`);
  Assert.ok(/translate\(/.test(t), `transform has a translate(), got "${t}"`);

  let translate = parseTranslate(t);
  Assert.ok(translate, "translate values are parseable");
  Assert.less(Math.abs(translate.x), 1, "whole-tab translateX is ~0");
  Assert.less(Math.abs(translate.y), 1, "whole-tab translateY is ~0");

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});

add_task(async function test_small_region_scales_up() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  let browser = tab.linkedBrowser;
  // Below MiniWindowUtils.MIN_WIDTH/MIN_HEIGHT, so computeWindowRect must
  // clamp the popup window up, forcing computeTransform's scale above 1
  // regardless of the test machine's screen size.
  let cropInfo = {
    left: 10,
    top: 5,
    width: 100,
    height: 75,
    viewportWidth: browser.clientWidth,
    viewportHeight: browser.clientHeight,
    fullZoom: 1,
  };

  let miniWin = await popTabForTest(tab, cropInfo);
  let popup = [...MiniWindowManager._miniwindows][0];
  let t = popup.browser.style.transform;

  Assert.ok(
    /scale\((?:1\.[1-9]|[2-9])/.test(t),
    `small crop scales up, got "${t}"`
  );

  let translate = parseTranslate(t);
  Assert.ok(translate, "translate values are parseable");
  Assert.equal(translate.x, -10, "translateX is -crop.left");
  Assert.equal(translate.y, -5, "translateY is -crop.top");

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});

add_task(async function test_crop_target_box_framed_exactly() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    CROP_TARGET_URL
  );
  let browser = tab.linkedBrowser;
  // #crop-target in mini-window-crop-target.html: a box at a known position.
  let cropInfo = {
    left: 100,
    top: 60,
    width: 300,
    height: 200,
    viewportWidth: browser.clientWidth,
    viewportHeight: browser.clientHeight,
    fullZoom: 1,
  };

  let miniWin = await popTabForTest(tab, cropInfo);
  let popup = [...MiniWindowManager._miniwindows][0];

  let translate = parseTranslate(popup.browser.style.transform);
  Assert.ok(translate, "translate values are parseable");
  Assert.equal(translate.x, -100, "translateX frames the box's left edge");
  Assert.equal(translate.y, -60, "translateY frames the box's top edge");

  let scale = parseFloat(
    /scale\(([\d.]+)\)/.exec(popup.browser.style.transform)?.[1]
  );
  Assert.less(
    Math.abs(scale - miniWin.innerWidth / 300),
    0.01,
    "scale fills the window width with the box"
  );

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});

add_task(async function test_full_tab_opens_at_default_size() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let expectedWidth = 640;
  let expectedHeight = 400;

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  let popPromise = MiniWindowManager.popTab(tab);
  let miniWin = await opened;
  let popup = await popPromise;

  Assert.ok(!popup.isCropped, "popTab makes a full-tab mini window");
  Assert.equal(miniWin.outerWidth, expectedWidth, "width is the 640px default");
  if (AppConstants.platform == "linux") {
    // The window manager adds titlebar decorations that inflate outerHeight
    Assert.greaterOrEqual(
      miniWin.outerHeight,
      expectedHeight,
      "height is at least the 400px default"
    );
  } else {
    Assert.equal(
      miniWin.outerHeight,
      expectedHeight,
      "height is the 400px default"
    );
  }

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});
