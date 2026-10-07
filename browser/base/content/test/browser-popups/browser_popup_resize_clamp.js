/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// window.resizeTo() and window.resizeBy() from content should not be able to
// make a window much larger than the screen it is on. Without that bound a page
// can ask for a window whose painting buffers do not fit in graphics memory.
// The bound is twice the screen size, since the size reported for a screen is
// not always accurate.
add_task(async function test_resize_clamped_to_screen() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    window.gBrowser,
    "https://example.net"
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    info("Opening popup.");
    let win = this.content.open(
      "https://example.net",
      "",
      "width=200,height=200"
    );

    await ContentTaskUtils.waitForEvent(win, "load");

    // Let a resize round-trip to the parent process and back.
    let settle = async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => win.requestAnimationFrame(r));
      }
    };

    let maxWidth = 2 * win.screen.width;
    let maxHeight = 2 * win.screen.height;
    info(
      `Screen is ${win.screen.width}x${win.screen.height}, so the bound is ` +
        `${maxWidth}x${maxHeight}.`
    );

    // A size that fits on the screen is honored as-is.
    win.resizeTo(400, 400);
    await settle();
    is(win.outerWidth, 400, "Width within the screen is honored.");
    is(win.outerHeight, 400, "Height within the screen is honored.");

    // A size far beyond the screen is clamped to the bound, rather than to some
    // much larger graphics limit such as the maximum texture size.
    win.resizeTo(99999999, 99999999);
    await settle();
    Assert.lessOrEqual(
      win.outerWidth,
      maxWidth,
      "resizeTo() far beyond the screen is clamped in width."
    );
    Assert.lessOrEqual(
      win.outerHeight,
      maxHeight,
      "resizeTo() far beyond the screen is clamped in height."
    );

    // The same bound applies to resizeBy(), whose deltas are added to the
    // current size and could otherwise overflow.
    win.resizeTo(400, 400);
    await settle();
    win.resizeBy(99999999, 99999999);
    await settle();
    Assert.lessOrEqual(
      win.outerWidth,
      maxWidth,
      "resizeBy() far beyond the screen is clamped in width."
    );
    Assert.lessOrEqual(
      win.outerHeight,
      maxHeight,
      "resizeBy() far beyond the screen is clamped in height."
    );

    info("Closing popup.");
    win.close();
  });

  await BrowserTestUtils.removeTab(tab);
});
