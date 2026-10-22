/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

requestLongerTimeout(2);

// Import helpers
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/dom/base/test/fullscreen/fullscreen_helpers.js",
  this
);

add_setup(async function () {
  await pushPrefs(
    ["full-screen-api.transition-duration.enter", "0 0"],
    ["full-screen-api.transition-duration.leave", "0 0"],
    ["full-screen-api.allow-trusted-requests-only", false]
  );
});

async function enterFullscreenAndLock(browser) {
  let innerFrame = browser.browsingContext.children[0].children[0];
  let promiseFsState = waitRemoteFullscreenEnterEvents([
    [innerFrame, "innerFrame"],
  ]);
  SpecialPowers.spawn(innerFrame, [], function () {
    content.setTimeout(() => {
      content.document.getElementById("div").click();
    }, 0);
  });
  await promiseFsState;

  await SpecialPowers.spawn(innerFrame, [], async function () {
    content.screen.orientation.lock("landscape").catch(() => {});
    await new Promise(resolve => content.setTimeout(resolve, 0));
  });
  return innerFrame;
}

function checkNotFullscreen() {
  ok(!window.fullScreen, "The chrome window should not be in fullscreen");
  ok(
    !document.documentElement.hasAttribute("inDOMFullscreen"),
    "The chrome document should not be in fullscreen"
  );
}

function getOrientationLock(browser) {
  return SpecialPowers.spawn(
    browser,
    [],
    () => SpecialPowers.getDOMWindowUtils(content).orientationLock
  );
}

async function checkLockedFrameGone(url, goAway) {
  info(`url: ${url}`);
  await BrowserTestUtils.withNewTab({ gBrowser, url }, async browser => {
    let innerFrame = await enterFullscreenAndLock(browser);
    // Linux and macOS reject lock() before the top browsing context records it.
    if (AppConstants.platform == "win") {
      isnot(
        await getOrientationLock(browser),
        0,
        "lock() should set the top browsing context's lock"
      );
    }
    let promiseFsExit = waitForFullscreenExit(document);
    await goAway(browser, innerFrame);
    await promiseFsExit;
    checkNotFullscreen();
    is(
      await getOrientationLock(browser),
      0,
      "The lock should be released when the locked frame goes away"
    );
  });
}

TEST_URLS.forEach(url => {
  add_task(async function removeLockedFrame() {
    await checkLockedFrameGone(url, browser =>
      SpecialPowers.spawn(browser, [], () => {
        content.document.querySelector("iframe").remove();
      })
    );
  });

  add_task(async function navigateLockedFrame() {
    await checkLockedFrameGone(url, (browser, innerFrame) =>
      SpecialPowers.spawn(innerFrame, [], () => {
        content.location.href = "about:blank";
      })
    );
  });

  add_task(async function closeTabWithLockedFrame() {
    info(`url: ${url}`);
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url);
    await enterFullscreenAndLock(tab.linkedBrowser);
    let promiseFsExit = waitForFullscreenExit(document);
    BrowserTestUtils.removeTab(tab);
    await promiseFsExit;
    checkNotFullscreen();
  });
});
