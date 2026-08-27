/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_screenshotsFace() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_PAGE,
    },
    async browser => {
      let helper = new ScreenshotsHelper(browser);
      helper.triggerUIFromToolbar();
      await helper.waitForOverlay();

      await SpecialPowers.spawn(browser, [], async () => {
        let screenshotsChild = content.windowGlobalChild.getActor(
          "ScreenshotsComponent"
        );

        content.focus();
        screenshotsChild.overlay.previewFace.focus({ focusVisible: true });
      });

      key.down(" ");

      await helper.waitForStateChange(["selected"]);

      await SpecialPowers.spawn(browser, [], () => {
        let screenshotsChild = content.windowGlobalChild.getActor(
          "ScreenshotsComponent"
        );

        is(
          Services.focus.focusedElement,
          screenshotsChild.overlay.bottomRightMover,
          "The bottom right mover should be focused"
        );
      });

      helper.triggerUIFromToolbar();
      await helper.waitForOverlayClosed();

      helper.triggerUIFromToolbar();
      await helper.waitForOverlay();

      const rect = await SpecialPowers.spawn(browser, [], async () => {
        let screenshotsChild = content.windowGlobalChild.getActor(
          "ScreenshotsComponent"
        );

        content.focus();
        screenshotsChild.overlay.previewFace.focus({ focusVisible: true });
        return screenshotsChild.overlay.previewFace.getBoundingClientRect();
      });

      key.down("Enter");

      await helper.waitForStateChange(["selected"]);

      await SpecialPowers.spawn(browser, [], () => {
        let screenshotsChild = content.windowGlobalChild.getActor(
          "ScreenshotsComponent"
        );

        is(
          Services.focus.focusedElement,
          screenshotsChild.overlay.bottomRightMover,
          "The bottom right mover should be focused"
        );
      });

      let region = await helper.getSelectionRegionDimensions();
      let contentDims = await helper.getContentDimensions();

      is(
        region.left,
        rect.left - contentDims.scrollMinX,
        "The selected region left is the same as the element left"
      );
      is(
        region.right,
        rect.right - contentDims.scrollMinX,
        "The selected region right is the same as the element right"
      );
      is(
        region.top,
        rect.top,
        "The selected region top is the same as the element top"
      );
      is(
        region.bottom,
        rect.bottom,
        "The selected region bottom is the same as the element bottom"
      );
      is(
        region.width,
        rect.width,
        "The selected region width is the same as the element width"
      );
      is(
        region.height,
        rect.height,
        "The selected region height is the same as the element height"
      );
    }
  );
});

add_task(async function test_screenshotsFaceSelectsCorrectRegion() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: RTL_TEST_PAGE,
    },
    async browser => {
      let helper = new ScreenshotsHelper(browser);
      helper.triggerUIFromToolbar();
      await helper.waitForOverlay();

      const rect = await SpecialPowers.spawn(browser, [], async () => {
        let screenshotsChild = content.windowGlobalChild.getActor(
          "ScreenshotsComponent"
        );

        content.focus();
        screenshotsChild.overlay.previewFace.focus({ focusVisible: true });

        return screenshotsChild.overlay.previewFace.getBoundingClientRect();
      });

      key.down(" ");

      await helper.waitForStateChange(["selected"]);

      let region = await helper.getSelectionRegionDimensions();
      let contentDims = await helper.getContentDimensions();

      is(
        region.left,
        rect.left - contentDims.scrollMinX,
        "The selected region left is the same as the element left"
      );
      is(
        region.right,
        rect.right - contentDims.scrollMinX,
        "The selected region right is the same as the element right"
      );
      is(
        region.top,
        rect.top,
        "The selected region top is the same as the element top"
      );
      is(
        region.bottom,
        rect.bottom,
        "The selected region bottom is the same as the element bottom"
      );
      is(
        region.width,
        rect.width,
        "The selected region width is the same as the element width"
      );
      is(
        region.height,
        rect.height,
        "The selected region height is the same as the element height"
      );
    }
  );
});
