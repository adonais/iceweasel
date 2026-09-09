/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

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
