/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end performance coverage for PDF.js alt-text generation: an image is
// added through the real stamp editor, so the engine is created by the viewer
// when the PDF opens and run by the alt-text dialog, and the reported span is
// user-perceived: from the Add image click until the guessed alt text is shown.
//
// PDF.js requests best-onnx and the job does not pin a backend, so it measures
// the backend best-onnx resolves to.
//
// Parsed by the mozperftest static parser (vendored esprima, ES2017): no
// optional chaining, nullish coalescing, or object spread.

const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);

MLPerfTestUtils.init(this);

const PDF_URL =
  "https://example.com/browser/toolkit/components/pdfjs/test/file_empty_test.pdf";

const ALT_TEXT_LATENCY = "alt-text-latency";
const ALT_TEXT_TIMEOUT_MS = 30000;

const MockFilePicker = SpecialPowers.MockFilePicker;

const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_pdfjs_alttext_perf.js",
  description:
    "User-perceived latency and inference memory for PDF.js alt-text generation, driven through the production image-adding flow",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        {
          name: "PDFJS-ALT-TEXT-alt-text-latency-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "PDFJS-ALT-TEXT-alt-text-latency-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-alt-text-latency-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "PDFJS-ALT-TEXT-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "PDFJS-ALT-TEXT-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-memory-before-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "PDFJS-ALT-TEXT-memory-before-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-memory-before-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "PDFJS-ALT-TEXT-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "PDFJS-ALT-TEXT-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
      ],
      verbose: true,
      ml_services: true,
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      try_platform: ["linux", "mac", "win"],
    },
  },
};

requestLongerTimeout(30);

/**
 * Opens the PDF, adds an image through the stamp editor and waits for the
 * alt-text dialog to show the guessed description.
 *
 * @returns {Promise<Record<string, number>>} The feature measurements.
 */
async function guessAltTextOnce() {
  return BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      await waitForPdfJSAllLayers(browser, PDF_URL, [
        [
          "annotationEditorLayer",
          "annotationLayer",
          "textLayer",
          "canvasWrapper",
        ],
      ]);
      await enableEditor(browser, "Stamp", 0);

      const guessed = SpecialPowers.spawn(
        browser,
        [ALT_TEXT_TIMEOUT_MS],
        async timeoutMs => {
          const { document } = content;
          const button = document.querySelector("#editorStampAddImage");
          const clicked = new Promise(resolve => {
            button.addEventListener(
              "click",
              () => resolve(content.performance.now()),
              { once: true }
            );
          });
          // Setting the textarea's value is not a DOM mutation, but the dialog
          // leaving its loading state in the same task is. A failed guess
          // leaves the textarea empty and marks the dialog with "error".
          let observer;
          const shown = new Promise((resolve, reject) => {
            observer = new content.MutationObserver(() => {
              if (document.querySelector("#newAltTextDialog.error")) {
                reject(new Error("The alt-text dialog reported an error"));
                return;
              }
              const textarea = document.querySelector(
                "#newAltTextDescriptionTextarea"
              );
              if (textarea && textarea.value) {
                resolve({
                  end: content.performance.now(),
                  altText: textarea.value,
                });
              }
            });
            observer.observe(document.documentElement, {
              attributes: true,
              childList: true,
              subtree: true,
            });
          });
          // Fail fast if no guess arrives, instead of hanging until the
          // file-level timeout.
          const guess = (async () => {
            const start = await clicked;
            const { end, altText } = await shown;
            return { latency: end - start, altText };
          })();
          let timer;
          try {
            return await Promise.race([
              guess,
              new Promise((resolve, reject) => {
                timer = content.setTimeout(
                  () => reject(new Error("Timed out waiting for the alt text")),
                  timeoutMs
                );
              }),
            ]);
          } finally {
            content.clearTimeout(timer);
            observer.disconnect();
          }
        }
      );

      // Close the viewer through its testing hook even on failure: removing
      // the tab while the stamp is unsaved otherwise hangs.
      try {
        await clickOn(browser, "#editorStampAddImage");
        const { latency, altText } = await guessed;

        Assert.ok(altText, `The model guessed an alt text: "${altText}"`);

        const measurements = {};
        measurements[ALT_TEXT_LATENCY] = latency;
        return measurements;
      } finally {
        await waitForPdfJSClose(browser);
      }
    }
  );
}

add_setup(async function () {
  makePDFJSHandler();

  MockFilePicker.init();
  MockFilePicker.setFiles([new FileUtils.File(getTestFilePath("moz.png"))]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  registerCleanupFunction(() => {
    MockFilePicker.cleanup();
  });
});

add_task(async function test_pdfjs_alttext_perf() {
  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: "PDFJS-ALT-TEXT",
    scenario: guessAltTextOnce,
    engines: [{ featureId: "pdfjs-alt-text" }],
    coldIterations: 5,
    warmIterations: 5,
    memoryIterations: 3,
  });
});
