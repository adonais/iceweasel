/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_sizeToContent_in_parent_process_tab() {
  let width = window.outerWidth;
  let height = window.outerHeight;
  await BrowserTestUtils.withNewTab(
    "chrome://mochitests/content/browser/dom/base/test/empty.html",
    async browser => {
      ok(!browser.isRemoteBrowser, "chrome:// document loads in the parent");
      browser.contentWindow.sizeToContent();
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      is(window.outerWidth, width, "outerWidth unchanged");
      is(window.outerHeight, height, "outerHeight unchanged");
    }
  );
});
