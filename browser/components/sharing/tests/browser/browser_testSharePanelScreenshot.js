/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function waitForScreenshotsOpen(win) {
  let panel = win.document.querySelector(".screenshotsPagePanel");
  await TestUtils.waitForCondition(() => {
    return (panel = win.document.querySelector(".screenshotsPagePanel"));
  });
  Assert.ok(BrowserTestUtils.isVisible(panel), "Screenshots panel is visible");

  await SpecialPowers.spawn(win.gBrowser.selectedBrowser, [], async () => {
    let screenshotsChild = content.windowGlobalChild.getActor(
      "ScreenshotsComponent"
    );

    await ContentTaskUtils.waitForCondition(() => {
      if (!screenshotsChild) {
        screenshotsChild = content.windowGlobalChild.getActor(
          "ScreenshotsComponent"
        );
      }
      return screenshotsChild?.overlay?.initialized;
    });

    Assert.ok(screenshotsChild.overlay.initialized);
  });

  await new Promise(r => win.requestAnimationFrame(r));
  info("Overlay is visible");
}

add_task(async function test_takeScreenshot() {
  const panel = await openSharePanel(window);
  const screenshotButton = panel.querySelector("#share-panel-screenshot");

  ok(
    BrowserTestUtils.isVisible(screenshotButton),
    "Screenshot button is visible"
  );

  EventUtils.synthesizeMouseAtCenter(screenshotButton, {});

  await waitForScreenshotsOpen(window);
});
