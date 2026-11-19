/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { DOMFullscreenTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/DOMFullscreenTestUtils.sys.mjs"
);
DOMFullscreenTestUtils.init(this, window);

const supportsCustomTransition = AppConstants.platform == "win";

add_task(async function test_fullscreen_reduced_motion() {
  await pushPrefs(["full-screen-api.allow-trusted-requests-only", false]);

  let transitionStartCount = 0;
  let previousStartCount = 0;
  let startObserver = () => transitionStartCount++;
  Services.obs.addObserver(startObserver, "fullscreen-transition-start");
  registerCleanupFunction(() => {
    Services.obs.removeObserver(startObserver, "fullscreen-transition-start");
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "https://example.com" },
    async browser => {
      for (let reducedMotion of [0, 1, 0]) {
        await pushPrefs(["ui.prefersReducedMotion", reducedMotion]);
        await SpecialPowers.spawn(browser, [reducedMotion], async value => {
          await ContentTaskUtils.waitForCondition(
            () =>
              content.matchMedia("(prefers-reduced-motion: reduce)").matches ==
              !!value,
            "The reduced-motion preference has taken effect"
          );
        });

        for (let enter of [true, false]) {
          is(
            transitionStartCount,
            previousStartCount,
            "No fullscreen transitions started between test steps"
          );
          let expectTransition = supportsCustomTransition && !reducedMotion;
          let transitionEnd = expectTransition
            ? TestUtils.topicObserved("fullscreen-transition-end")
            : Promise.resolve();
          let fullscreenChanged = DOMFullscreenTestUtils.changeFullscreen(
            browser,
            enter
          );
          await Promise.all([fullscreenChanged, transitionEnd]);

          is(window.fullScreen, enter, "The window's fullscreen state changed");
          is(
            transitionStartCount - previousStartCount,
            expectTransition ? 1 : 0,
            `${enter ? "Entering" : "Leaving"} fullscreen starts the expected transitions`
          );
          previousStartCount = transitionStartCount;
        }
      }
    }
  );
  is(
    transitionStartCount,
    previousStartCount,
    "No fullscreen transitions started after the last test step"
  );
});
