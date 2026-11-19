/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const pdfUrl = TESTROOT + "file_pdfjs_test.pdf";

/**
 * @returns {Promise<{maxCanvasDim: number, accelerated: boolean}>} The
 *   viewer's maximum canvas dimension with these prefs, and whether canvases
 *   are actually accelerated with them.
 */
async function getMaxCanvasDim(prefs) {
  await SpecialPowers.pushPrefEnv({ set: prefs });
  const accelerated = Cc["@mozilla.org/gfx/info;1"].getService(
    Ci.nsIGfxInfo
  ).usingAcceleratedCanvas;
  let maxCanvasDim;
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);
      maxCanvasDim = await SpecialPowers.spawn(
        browser,
        [],
        () =>
          content.wrappedJSObject.PDFViewerApplication.pdfViewer.maxCanvasDim
      );
      await waitForPdfJSClose(browser);
    }
  );
  await SpecialPowers.popPrefEnv();
  return { maxCanvasDim, accelerated };
}

add_task(async function test_max_canvas_dim() {
  const maxSize = Services.prefs.getIntPref("gfx.canvas.max-size");
  const acceleratedMaxSize = 4096;

  // Acceleration also depends on the GPU, so it may be off on some machines.
  let { maxCanvasDim, accelerated } = await getMaxCanvasDim([
    ["pdfjs.enableHWA", true],
    ["gfx.canvas.accelerated", true],
    ["gfx.canvas.accelerated.max-size", acceleratedMaxSize],
  ]);
  info(`Accelerated canvases: ${accelerated}`);
  is(
    maxCanvasDim,
    accelerated ? Math.min(maxSize, acceleratedMaxSize) : maxSize,
    "The accelerated maximum size is used when canvases are accelerated"
  );

  ({ maxCanvasDim } = await getMaxCanvasDim([
    ["pdfjs.enableHWA", false],
    ["gfx.canvas.accelerated", true],
    ["gfx.canvas.accelerated.max-size", acceleratedMaxSize],
  ]));
  is(
    maxCanvasDim,
    maxSize,
    "The maximum size is used when pdf.js doesn't use acceleration"
  );

  ({ maxCanvasDim, accelerated } = await getMaxCanvasDim([
    ["pdfjs.enableHWA", true],
    ["gfx.canvas.accelerated", false],
    ["gfx.canvas.accelerated.force-enabled", false],
    ["gfx.canvas.accelerated.max-size", acceleratedMaxSize],
  ]));
  ok(!accelerated, "Canvases aren't accelerated");
  is(
    maxCanvasDim,
    maxSize,
    "The maximum size is used when canvases aren't accelerated"
  );

  ({ maxCanvasDim } = await getMaxCanvasDim([
    ["pdfjs.enableHWA", true],
    ["gfx.canvas.accelerated", true],
    ["gfx.canvas.accelerated.max-size", 0],
  ]));
  is(
    maxCanvasDim,
    maxSize,
    "The maximum size is used when the accelerated size is unlimited"
  );
});
