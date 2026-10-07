/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

requestLongerTimeout(2);

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "http://example.com/browser/" + RELATIVE_DIR;

const TESTS = [
  {
    action: {
      selector: "#zoomInButton",
      event: "click",
    },
    expectedZoom: 1, // 1 - zoom in
    message: "Zoomed in using the '+' (zoom in) button",
  },

  {
    action: {
      selector: "#zoomOutButton",
      event: "click",
    },
    expectedZoom: -1, // -1 - zoom out
    message: "Zoomed out using the '-' (zoom out) button",
  },

  {
    action: {
      keyboard: true,
      keyCode: 61,
      event: "+",
    },
    expectedZoom: 1, // 1 - zoom in
    message: "Zoomed in using the CTRL++ keys",
  },

  {
    action: {
      keyboard: true,
      keyCode: 109,
      event: "-",
    },
    expectedZoom: -1, // -1 - zoom out
    message: "Zoomed out using the CTRL+- keys",
  },

  {
    action: {
      selector: "select#scaleSelect",
      index: 5,
      event: "change",
    },
    expectedZoom: -1, // -1 - zoom out
    message: "Zoomed using the zoom picker",
  },
];

add_task(async function test() {
  let mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  let handlerInfo = mimeService.getFromTypeAndExtension(
    "application/pdf",
    "pdf"
  );

  // Make sure pdf.js is the default handler.
  is(
    handlerInfo.alwaysAskBeforeHandling,
    false,
    "pdf handler defaults to always-ask is false"
  );
  is(
    handlerInfo.preferredAction,
    Ci.nsIHandlerInfo.handleInternally,
    "pdf handler defaults to internal"
  );

  info("Pref action: " + handlerInfo.preferredAction);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (newTabBrowser) {
      await waitForPdfJS(
        newTabBrowser,
        TESTROOT + "file_pdfjs_test.pdf#zoom=100"
      );

      await SpecialPowers.spawn(
        newTabBrowser,
        [TESTS],
        async function (contentTESTS) {
          const { document } = content;

          // check that PDF is opened with internal viewer
          Assert.ok(
            document.querySelector("div#viewer"),
            "document content has viewer UI"
          );

          const pageZoomScale = document.querySelector("select#scaleSelect");
          const pageContainer = document.querySelector(
            "div.page[data-page-number='1']"
          );
          const getPageWidth = () =>
            parseInt(content.getComputedStyle(pageContainer).width);

          const initialWidth = getPageWidth();
          let previousWidth = initialWidth;

          for (const subTest of contentTESTS) {
            // We zoom using an UI element
            let el, ev;
            if (subTest.action.selector) {
              // Get the element and trigger the action for changing the zoom
              el = document.querySelector(subTest.action.selector);
              Assert.ok(
                el,
                "Element '" + subTest.action.selector + "' has been found"
              );

              if (subTest.action.index) {
                el.selectedIndex = subTest.action.index;
              }

              // Dispatch the event for changing the zoom
              ev = new content.Event(subTest.action.event);
            } else {
              // We zoom using keyboard
              // Simulate key press
              ev = new content.KeyboardEvent("keydown", {
                key: subTest.action.event,
                keyCode: subTest.action.keyCode,
                ctrlKey: true,
              });
              el = content;
            }

            // Fluent translates the updated zoom label asynchronously.
            el.dispatchEvent(ev);
            const selectedOption =
              pageZoomScale.options[pageZoomScale.selectedIndex];
            await document.l10n.translateElements([selectedOption]);

            // The zoom value displayed in the zoom select
            const zoomValue = selectedOption.textContent;
            const actualWidth = getPageWidth();

            // the actual zoom of the PDF document
            const computedZoomValue =
              parseInt((actualWidth / initialWidth).toFixed(2) * 100) + "%";
            Assert.equal(
              computedZoomValue,
              zoomValue,
              "Content has correct zoom"
            );

            // Check that document zooms in the expected way (in/out)
            const zoom = (actualWidth - previousWidth) * subTest.expectedZoom;
            Assert.greater(zoom, 0, subTest.message);

            previousWidth = actualWidth;
          }
        }
      );
      await waitForPdfJSClose(newTabBrowser);
    }
  );
});

function getPageWidth(browser) {
  return SpecialPowers.spawn(browser, [], () =>
    parseInt(
      content.getComputedStyle(
        content.document.querySelector("div.page[data-page-number='1']")
      ).width
    )
  );
}

/**
 * Wait for the browser zoom to be applied to the first page.
 *
 * A zoom change can cancel a page render, and then no render event is
 * dispatched for it, so poll the DOM instead of waiting for one.
 *
 * @param {MozBrowser} browser Browser containing the viewer.
 * @param {number} width The width, in pixels, the page has to move away from.
 * @param {string} direction Either "bigger", "smaller" or "same".
 * @returns {Promise<number>} The new width of the page.
 */
function waitForPageWidth(browser, width, direction) {
  return SpecialPowers.spawn(
    browser,
    [width, direction],
    async function (expectedWidth, expectedDirection) {
      const { ContentTaskUtils } = ChromeUtils.importESModule(
        "resource://testing-common/ContentTaskUtils.sys.mjs"
      );
      const getWidth = () =>
        parseInt(
          content.getComputedStyle(
            content.document.querySelector("div.page[data-page-number='1']")
          ).width
        );
      await ContentTaskUtils.waitForCondition(() => {
        const currentWidth = getWidth();
        switch (expectedDirection) {
          case "bigger":
            return currentWidth > expectedWidth;
          case "smaller":
            return currentWidth < expectedWidth;
          default:
            return currentWidth === expectedWidth;
        }
      }, `Page must become ${expectedDirection} than ${expectedWidth}px`);

      return getWidth();
    }
  );
}

add_task(async function test_browser_zoom() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (newTabBrowser) {
      await waitForPdfJS(newTabBrowser, TESTROOT + "file_pdfjs_test.pdf");

      const initialWidth = await getPageWidth(newTabBrowser);

      // Zoom in
      FullZoom.enlarge();
      Assert.greater(
        await waitForPageWidth(newTabBrowser, initialWidth, "bigger"),
        initialWidth,
        "Zoom in makes the page bigger."
      );

      // Reset
      FullZoom.reset();
      is(
        await waitForPageWidth(newTabBrowser, initialWidth, "same"),
        initialWidth,
        "Zoom reset restores page."
      );

      // Zoom out
      FullZoom.reduce();
      Assert.less(
        await waitForPageWidth(newTabBrowser, initialWidth, "smaller"),
        initialWidth,
        "Zoom out makes the page smaller."
      );

      // Clean-up after the PDF viewer.
      await waitForPdfJSClose(newTabBrowser);
    }
  );
});
