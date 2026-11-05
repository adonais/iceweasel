/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Document.setViewportSizeOverrideForMiniWindow lays a top-level document out at a fixed
// layout viewport size, while its visual viewport keeps following the browser.

const TEST_URL =
  "https://example.com/document-builder.sjs?html=" +
  encodeURIComponent(
    `<!doctype html><meta charset="utf-8">
     <style>html, body { margin: 0 } #box { width: 100vw; height: 100vh }</style>
     <div id="box"></div>`
  );

add_task(async function test_override_fixes_the_layout_viewport() {
  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      let doc = content.document;
      let box = doc.getElementById("box");
      let layoutSize = () => {
        let rect = box.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      };
      let original = layoutSize();
      let visualWidth = content.visualViewport.width;

      let target = {
        width: Math.round(original.width) + 200,
        height: Math.round(original.height) + 100,
      };
      doc.setViewportSizeOverrideForMiniWindow(target.width, target.height);
      await ContentTaskUtils.waitForCondition(() => {
        let size = layoutSize();
        return (
          Math.abs(size.width - target.width) < 1 &&
          Math.abs(size.height - target.height) < 1
        );
      }, "viewport units resolve against the overridden size");

      // The visual viewport can now scroll inside the larger layout viewport,
      // so classic scrollbars take their width off it.
      let scrollbarWidth = {};
      content.windowUtils.getScrollbarSizes(
        doc.documentElement,
        scrollbarWidth,
        {}
      );
      Assert.less(
        Math.abs(
          content.visualViewport.width - (visualWidth - scrollbarWidth.value)
        ),
        1,
        "the visual viewport still follows the browser"
      );

      // Clearing doesn't reflow on its own; the layout viewport goes back to the
      // browser's size on the browser's next resize.
      let utils = content.windowUtils;
      utils.setResolutionAndScaleTo(2);
      doc.clearViewportSizeOverrideForMiniWindow();
      Assert.equal(utils.getResolution(), 1, "clearing resets the zoom");
    });
  });
});
