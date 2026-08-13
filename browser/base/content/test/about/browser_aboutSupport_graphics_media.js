/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_graphics_media_sections_not_blank() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:support" },
    async function (browser) {
      let graphicsHasRows = await SpecialPowers.spawn(
        browser,
        [],
        async function () {
          let table = content.document.getElementById(
            "graphics-diagnostics-tbody"
          );
          await ContentTaskUtils.waitForCondition(
            () => table && !!table.children.length,
            "Graphics diagnostics table has rows"
          );
          return !!table.children.length;
        }
      );
      ok(graphicsHasRows, "Graphics section is not blank");

      let mediaHasRows = await SpecialPowers.spawn(
        browser,
        [],
        async function () {
          let table = content.document.getElementById("media-info-tbody");
          await ContentTaskUtils.waitForCondition(
            () => table && !!table.children.length,
            "Media info table has rows"
          );
          return !!table.children.length;
        }
      );
      ok(mediaHasRows, "Media section is not blank");
    }
  );
});
