/*
 * Bug 1330882 - A test case for opening new windows as rounded size when
 *   fingerprinting resistance is enabled.
 */

const CC = Components.Constructor;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.resistFingerprinting", true]],
  });
});

add_task(async function test_new_window() {
  // Open a new window.
  let win = await BrowserTestUtils.openNewBrowserWindow();

  // Load a page and verify its window size.
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    TEST_PATH + "file_dummy.html"
  );

  // When resisting fingerprinting, the content window can't observe the real
  // screen: screen and screen.avail are collapsed onto the content viewport, so
  // screen.width/height, screen.availWidth/Height and innerWidth/Height all
  // report the same value. We assert that invariant instead of an exact pixel
  // size, because the actual size depends on how much space the chrome leaves
  // for the content area, which varies by platform and by chrome configuration
  // (e.g. browser.nova.enabled), see bug 2054792.
  await SpecialPowers.spawn(tab.linkedBrowser, [], async function () {
    let { screen } = content;

    is(
      screen.width,
      content.innerWidth,
      "screen.width is spoofed to the content viewport width"
    );
    is(
      screen.height,
      content.innerHeight,
      "screen.height is spoofed to the content viewport height"
    );
    is(
      screen.availWidth,
      screen.width,
      "screen.availWidth is spoofed to screen.width"
    );
    is(
      screen.availHeight,
      screen.height,
      "screen.availHeight is spoofed to screen.height"
    );

    Assert.greater(screen.width, 0, "The spoofed width is positive");
    Assert.greater(screen.height, 0, "The spoofed height is positive");
  });

  BrowserTestUtils.removeTab(tab);
  await BrowserTestUtils.closeWindow(win);
});
