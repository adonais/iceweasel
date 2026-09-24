/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const pdfUrl = TESTROOT + "file_pdfjs_test.pdf";

// Each task generates and reparses PDFs.
requestLongerTimeout(2);

// pdf.js operators used to distinguish vector paths from raster images.
const VECTOR_PATH_OPS = new Set([
  "constructPath",
  "moveTo",
  "lineTo",
  "curveTo",
  "curveTo2",
  "curveTo3",
  "rectangle",
  "closePath",
  "stroke",
  "closeStroke",
  "fill",
  "eoFill",
  "fillStroke",
  "eoFillStroke",
  "rawFillPath",
]);
const IMAGE_OPS = new Set([
  "paintImageXObject",
  "paintInlineImageXObject",
  "paintImageMaskXObject",
  "paintImageMaskXObjectGroup",
  "paintInlineImageXObjectGroup",
  "paintImageXObjectRepeat",
  "paintImageMaskXObjectRepeat",
  "paintSolidColorImageMask",
]);

/**
 * Snapshot user-set print prefs and the last-used printer pref.
 *
 * @returns {Map<string, boolean|number|string>} pref name to value.
 */
function snapshotPrintPrefs() {
  const snapshot = new Map();
  const names = Services.prefs.getChildList("print.");
  names.push("print_printer");
  for (const name of names) {
    if (!Services.prefs.prefHasUserValue(name)) {
      continue;
    }
    switch (Services.prefs.getPrefType(name)) {
      case Services.prefs.PREF_BOOL:
        snapshot.set(name, Services.prefs.getBoolPref(name));
        break;
      case Services.prefs.PREF_INT:
        snapshot.set(name, Services.prefs.getIntPref(name));
        break;
      case Services.prefs.PREF_STRING:
        snapshot.set(name, Services.prefs.getStringPref(name));
        break;
    }
  }
  return snapshot;
}

/**
 * Dispatch `printToPDF` and return its PDF bytes or null response.
 *
 * @param {object} browser
 * @param {Array} printData - the payload for the printToPDF action.
 * @returns {Promise<ArrayBuffer|null>}
 */
async function dispatchPrintToPDF(browser, printData) {
  return SpecialPowers.spawn(browser, [printData], async data => {
    return new Promise(resolve => {
      const request = content.document.createTextNode("");
      request.addEventListener(
        "pdf.js.response",
        event => {
          request.remove();
          resolve(event.detail.response);
        },
        { once: true }
      );
      content.document.documentElement.append(request);
      const detail = Cu.cloneInto(
        { action: "printToPDF", data, responseExpected: true },
        content
      );
      request.dispatchEvent(
        new content.CustomEvent("pdf.js.message", {
          bubbles: true,
          cancelable: false,
          detail,
        })
      );
    });
  });
}

/**
 * Dispatch `printToPDF` and parse the generated PDF.
 *
 * @param {object} browser
 * @param {Array} printData - the payload for the printToPDF action.
 * @returns {Promise<Array<{text: string, items: Array, ops: string[],
 *   args: Array}>>} one entry per page. `args[i]` holds the arguments of the
 *   operator `ops[i]`, and `items` the position of each extracted text item.
 */
async function printToPDFAndParse(browser, printData) {
  return SpecialPowers.spawn(browser, [printData], async data => {
    const buffer = await new Promise(resolve => {
      const request = content.document.createTextNode("");
      request.addEventListener(
        "pdf.js.response",
        event => {
          request.remove();
          resolve(event.detail.response);
        },
        { once: true }
      );
      content.document.documentElement.append(request);
      const detail = Cu.cloneInto(
        { action: "printToPDF", data, responseExpected: true },
        content
      );
      request.dispatchEvent(
        new content.CustomEvent("pdf.js.message", {
          bubbles: true,
          cancelable: false,
          detail,
        })
      );
    });

    Assert.ok(!!buffer, "printToPDF should return a non-null PDF buffer");

    const win = Cu.waiveXrays(content);
    const { pdfjsLib } = win;
    const { OPS } = pdfjsLib;
    const opName = new Map(Object.keys(OPS).map(name => [OPS[name], name]));

    const params = new win.Object();
    params.data = new win.Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument(params);
    const pdf = Cu.waiveXrays(await loadingTask.promise);

    // Read the page's operator-list stream through PDF.js's worker transport.
    async function getPageOps(page) {
      const transport = page._transport;
      const intentArgs = Cu.waiveXrays(
        transport.getRenderingIntent("display", undefined, null, false, true)
      );
      const msgArgs = new win.Object();
      msgArgs.pageId = msgArgs.pageIndex = page._pageIndex;
      msgArgs.intent = intentArgs.renderingIntent;

      const stream = Cu.waiveXrays(
        transport.messageHandler.sendWithStream("GetOperatorList", msgArgs)
      );
      const reader = Cu.waiveXrays(stream.getReader());
      const ops = [];
      const args = [];
      for (;;) {
        const chunk = Cu.waiveXrays(await reader.read());
        if (chunk.done) {
          break;
        }
        const { fnArray, argsArray } = chunk.value;
        for (let j = 0; j < fnArray.length; j++) {
          ops.push(opName.get(fnArray[j]));
          args.push(argsArray[j]);
        }
      }
      return { ops, args };
    }

    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = Cu.waiveXrays(await pdf.getPage(i));
      const textContent = Cu.waiveXrays(await page.getTextContent());

      let text = "";
      const items = [];
      for (let j = 0; j < textContent.items.length; j++) {
        const item = Cu.waiveXrays(textContent.items[j]);
        text += item.str;
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
        });
      }

      pages.push({ text, items, ...(await getPageOps(page)) });
    }

    await loadingTask.destroy();
    return pages;
  });
}

// Exercise both PDF-backend preference values.
const PRINT_BACKENDS = [
  { skpdf: true, name: "Skia" },
  { skpdf: false, name: "Cairo" },
];

// Expected text after compatibility and whitespace normalization.
const TEXT_ENTRIES = [
  { text: "Hello", expected: ["Hello"] },
  { text: "World", expected: ["World"] },
  // "Hello World" in Arabic (right-to-left script).
  { text: "مرحبا بالعالم", expected: ["مرحبا", "بالعالم"] },
  { text: "First line\nSecond line", expected: ["First line", "Second line"] },
];

// Verify text extraction from one generated page per entry.
add_task(async function test_printToPDF_text() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);

      for (const { skpdf, name } of PRINT_BACKENDS) {
        await SpecialPowers.pushPrefEnv({
          set: [["print.experimental.skpdf", skpdf]],
        });

        const pages = await printToPDFAndParse(
          browser,
          TEXT_ENTRIES.map(({ text }) => ({
            data: {
              width: 200,
              height: 80,
              text,
              color: "#000000",
              fontSize: 24,
            },
          }))
        );

        Assert.equal(
          pages.length,
          TEXT_ENTRIES.length,
          `[${name}] The generated PDF should have one page per entry`
        );

        // Avoid masking a page-count failure with an undefined access.
        const count = Math.min(pages.length, TEXT_ENTRIES.length);
        for (let i = 0; i < count; i++) {
          // Normalize compatibility forms and ignore extracted whitespace.
          const extracted = pages[i].text.normalize("NFKC").replace(/\s+/g, "");
          for (const expected of TEXT_ENTRIES[i].expected) {
            Assert.stringContains(
              extracted,
              expected.normalize("NFKC").replace(/\s+/g, ""),
              `[${name}] Page ${i + 1} should contain the expected text`
            );
          }
        }

        await SpecialPowers.popPrefEnv();
      }

      await waitForPdfJSClose(browser);
    }
  );
});

// The vertical alignment must move the text in the appearance box.
add_task(async function test_printToPDF_vertical_alignment() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);

      // A box much taller than the text, so that both alignments are distinct.
      const entry = overrides => ({
        data: {
          width: 300,
          height: 200,
          text: "Hello",
          color: "#000000",
          fontSize: 12,
          ...overrides,
        },
      });

      for (const { skpdf, name } of PRINT_BACKENDS) {
        await SpecialPowers.pushPrefEnv({
          set: [["print.experimental.skpdf", skpdf]],
        });

        const pages = await printToPDFAndParse(browser, [
          entry({}),
          entry({ verticalAlign: "top" }),
        ]);

        Assert.equal(
          pages.length,
          2,
          `[${name}] The generated PDF should have one page per entry`
        );

        // The first non-blank item gives where the line starts.
        const [center, top] = pages.map(
          ({ items }) => items.find(item => item.str.trim() !== "") ?? {}
        );
        info(`[${name}] Positions: ` + JSON.stringify({ center, top }));

        Assert.less(
          center.y,
          top.y,
          `[${name}] Top-aligned text should sit above centered text`
        );

        await SpecialPowers.popPrefEnv();
      }

      await waitForPdfJSClose(browser);
    }
  );
});

// Verify that a simple SVG remains vector data in the generated PDF.
add_task(async function test_printToPDF_svg() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);

      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" ' +
        'viewBox="0 0 100 100">' +
        '<line x1="10" y1="10" x2="90" y2="90" stroke="#123456" ' +
        'stroke-width="4"/></svg>';
      const svgUrl = "data:image/svg+xml," + encodeURIComponent(svg);

      for (const { skpdf, name } of PRINT_BACKENDS) {
        await SpecialPowers.pushPrefEnv({
          set: [["print.experimental.skpdf", skpdf]],
        });

        const pages = await printToPDFAndParse(browser, [
          { data: { width: 100, height: 100, svgUrl } },
        ]);

        Assert.equal(
          pages.length,
          1,
          `[${name}] The generated PDF should have one page`
        );

        const { ops, args } = pages[0];
        info(`[${name}] Operators: ` + ops.join(", "));

        Assert.ok(
          ops.some(op => VECTOR_PATH_OPS.has(op)),
          `[${name}] The SVG line should be drawn with vector path operators`
        );
        Assert.ok(
          !ops.some(op => IMAGE_OPS.has(op)),
          `[${name}] The SVG line should not be rasterized into an image`
        );

        const strokeIndex = ops.indexOf("setStrokeRGBColor");
        Assert.greater(
          strokeIndex,
          -1,
          `[${name}] The SVG line should set an explicit stroke color`
        );
        if (strokeIndex !== -1) {
          Assert.equal(
            args[strokeIndex][0],
            "#123456",
            `[${name}] The stroke color should match the one from the SVG`
          );
        }

        await SpecialPowers.popPrefEnv();
      }

      await waitForPdfJSClose(browser);
    }
  );
});

// Build malformed cases by overriding a valid text entry.
function textEntry(overrides) {
  return {
    data: {
      width: 100,
      height: 50,
      text: "Hello",
      color: "#000000",
      fontSize: 12,
      ...overrides,
    },
  };
}

// Payloads that #validatePrintToPDFData must reject.
const INVALID_CASES = [
  { name: "not an array", printData: {} },
  { name: "empty array", printData: [] },
  { name: "entry without data", printData: [{}] },
  { name: "size missing", printData: [textEntry({ width: undefined })] },
  { name: "size not a number", printData: [textEntry({ height: "50" })] },
  { name: "size non-finite", printData: [textEntry({ width: Infinity })] },
  { name: "size zero", printData: [textEntry({ height: 0 })] },
  { name: "size negative", printData: [textEntry({ width: -100 })] },
  {
    name: "size too large",
    printData: [textEntry({ width: 200 * 72 + 1 })],
  },
  {
    name: "neither text nor svg",
    printData: [{ data: { width: 50, height: 50 } }],
  },
  {
    name: "both text and svg",
    printData: [
      {
        data: {
          width: 50,
          height: 50,
          text: "x",
          color: "#000000",
          fontSize: 12,
          svgUrl:
            "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
        },
      },
    ],
  },
  { name: "color not #rrggbb", printData: [textEntry({ color: "red" })] },
  { name: "color without hash", printData: [textEntry({ color: "000000" })] },
  { name: "fontSize non-positive", printData: [textEntry({ fontSize: 0 })] },
  { name: "fontSize too large", printData: [textEntry({ fontSize: 1001 })] },
  {
    name: "fontFamily not a string",
    printData: [textEntry({ fontFamily: 42 })],
  },
  {
    name: "verticalAlign not supported",
    printData: [textEntry({ verticalAlign: "bottom" })],
  },
  {
    name: "svg url not a data: url",
    printData: [
      {
        data: { width: 50, height: 50, svgUrl: "https://example.com/x.svg" },
      },
    ],
  },
  {
    name: "data url not image/svg+xml",
    printData: [
      {
        data: { width: 50, height: 50, svgUrl: "data:image/png;base64,AAAA" },
      },
    ],
  },
];

// Each listed payload must receive a null response.
add_task(async function test_printToPDF_invalid_input() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);

      for (const { name, printData } of INVALID_CASES) {
        const response = await dispatchPrintToPDF(browser, printData);
        Assert.strictEqual(
          response,
          null,
          `Invalid input (${name}) should yield a null response`
        );
      }

      await waitForPdfJSClose(browser);
    }
  );
});

// A non-string `text` property must not route an SVG through the text path.
add_task(async function test_printToPDF_svg_ignores_nonstring_text() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);

      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" ' +
        'viewBox="0 0 100 100">' +
        '<line x1="10" y1="10" x2="90" y2="90" stroke="#123456" ' +
        'stroke-width="4"/></svg>';
      const svgUrl = "data:image/svg+xml," + encodeURIComponent(svg);

      const response = await dispatchPrintToPDF(browser, [
        { data: { width: 100, height: 100, svgUrl, text: 1 } },
      ]);

      Assert.ok(
        !!response && response.byteLength > 0,
        "An SVG entry carrying a non-string text field should still print"
      );

      await waitForPdfJSClose(browser);
    }
  );
});

// Per-job settings must not become defaults for later print jobs.
add_task(async function test_printToPDF_does_not_persist_print_settings() {
  const PRINTER_BRANCH = "print.printer_Mozilla_Save_to_PDF.";
  const SHRINK_TO_FIT = `${PRINTER_BRANCH}print_shrink_to_fit`;
  Services.prefs.deleteBranch(PRINTER_BRANCH);
  registerCleanupFunction(() => Services.prefs.deleteBranch(PRINTER_BRANCH));

  // Seed an overridden pref so the before/after comparison cannot be vacuous.
  Services.prefs.setBoolPref(SHRINK_TO_FIT, true);

  const before = snapshotPrintPrefs();
  Assert.strictEqual(
    before.get(SHRINK_TO_FIT),
    true,
    "The snapshot should observe the seeded print pref"
  );

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJS(browser, pdfUrl);

      const response = await dispatchPrintToPDF(browser, [
        {
          data: {
            width: 200,
            height: 80,
            text: "Hello",
            color: "#000000",
            fontSize: 24,
          },
        },
      ]);
      Assert.ok(!!response, "printToPDF should have produced a PDF");

      await waitForPdfJSClose(browser);
    }
  );

  const after = snapshotPrintPrefs();

  Assert.deepEqual(
    [...after.keys()].filter(name => !before.has(name)).sort(),
    [],
    "Printing to PDF should not have persisted any new print pref"
  );
  for (const [name, value] of before) {
    Assert.strictEqual(
      after.get(name),
      value,
      `Printing to PDF should have left ${name} unchanged`
    );
  }
});
