/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { DOMFullscreenTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/DOMFullscreenTestUtils.sys.mjs"
);

DOMFullscreenTestUtils.init(this, window);

add_task(async function opening_pip_exits_fullscreen() {
  await SpecialPowers.pushPrefEnv({
    set: [["full-screen-api.exit-on.windowOpen", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "https://example.com",
    waitForLoad: true,
  });
  const browser = tab.linkedBrowser;

  await DOMFullscreenTestUtils.changeFullscreen(browser, true);
  ok(document.fullscreen, "Browser should be in fullscreen");

  // Opening a document PiP window should exit fullscreen.
  let fullscreenExited = DOMFullscreenTestUtils.waitForFullScreenState(
    browser,
    false
  );
  const chromePiPPromise = BrowserTestUtils.waitForNewWindow();
  await SpecialPowers.spawn(browser, [], async () => {
    content.document.notifyUserGestureActivation();
    // Must use wrappedJSObject for LegacyIsCallerChromeOrNativeCode to be false
    await content.wrappedJSObject.documentPictureInPicture.requestWindow();
  });
  const chromePiP = await chromePiPPromise;
  await fullscreenExited;

  ok(!document.fullscreen, "Browser should have exited fullscreen");

  // Cleanup.
  await BrowserTestUtils.closeWindow(chromePiP);
  BrowserTestUtils.removeTab(tab);
});
