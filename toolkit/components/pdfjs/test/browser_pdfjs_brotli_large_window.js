/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TEST_ROOT = "https://example.com/browser/" + RELATIVE_DIR;

add_task(async function test_brotli_large_window() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await SpecialPowers.pushPrefEnv({
        set: [["dom.compression_streams.brotli.large_window.enabled", false]],
      });

      await waitForPdfJS(
        browser,
        `${TEST_ROOT}file_pdfjs_brotli_large_window.pdf`
      );

      await getSpanBox(browser, "Brotli large-window stream, lgwin=25");

      await SpecialPowers.popPrefEnv();

      await waitForPdfJSClose(browser);
    }
  );
});
