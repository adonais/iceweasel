/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bug 1871478: PDF viewers must match the response's cross-origin isolation.

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.download.open_pdf_attachments_inline", true],
      ["browser.download.always_ask_before_handling_new_types", false],
    ],
  });
});

async function openPdf(linkId, { inNewTab, crossOriginIsolated }) {
  await BrowserTestUtils.withNewTab(
    TESTROOT + "file_pdfjs_coi_opener.html",
    async function (browser) {
      ok(
        await SpecialPowers.spawn(
          browser,
          [],
          () => content.crossOriginIsolated
        ),
        "The opener is cross-origin isolated"
      );

      const crashed = BrowserTestUtils.waitForEvent(
        window,
        "oop-browser-crashed",
        true
      ).then(() => null);
      const isPdf = url => url.includes("file_pdfjs_coi_attachment.sjs");
      const loaded = inNewTab
        ? BrowserTestUtils.waitForNewTab(gBrowser, isPdf, true).then(
            tab => tab.linkedBrowser
          )
        : BrowserTestUtils.browserLoaded(browser, false, isPdf).then(
            () => browser
          );

      const tabCount = gBrowser.tabs.length;
      BrowserTestUtils.synthesizeMouseAtCenter(`#${linkId}`, {}, browser);

      const pdfBrowser = await Promise.race([crashed, loaded]);
      ok(pdfBrowser, "The PDF loaded without crashing the content process");
      if (!pdfBrowser) {
        while (gBrowser.tabs.length > tabCount) {
          BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
        }
        return;
      }

      is(
        await SpecialPowers.spawn(
          pdfBrowser,
          [],
          () => content.crossOriginIsolated
        ),
        crossOriginIsolated,
        "The PDF viewer has the response's cross-origin isolation"
      );

      if (inNewTab) {
        BrowserTestUtils.removeTab(gBrowser.getTabForBrowser(pdfBrowser));
      }
    }
  );
}

add_task(async function test_isolated_attachment() {
  await openPdf("coi", { inNewTab: true, crossOriginIsolated: true });
});

add_task(async function test_non_isolated_attachment() {
  await openPdf("nocoi", { inNewTab: true, crossOriginIsolated: false });
});

add_task(async function test_isolated_inline() {
  await openPdf("coi_inline", { inNewTab: false, crossOriginIsolated: true });
});
