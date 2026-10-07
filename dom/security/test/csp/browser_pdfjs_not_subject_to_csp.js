"use strict";

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);

add_task(async function () {
  await BrowserTestUtils.withNewTab(
    TEST_PATH + "file_pdfjs_not_subject_to_csp.html",
    async function (browser) {
      let pdfPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "documentloaded",
        false,
        null,
        true
      );

      await SpecialPowers.spawn(browser, [], async function () {
        let pdfButton = content.document.getElementById("pdfButton");
        pdfButton.click();
      });

      await pdfPromise;

      await SpecialPowers.spawn(browser, [], async function () {
        let pdfFrame = content.document.getElementById("pdfFrame");
        // 1) Sanity that we have loaded the PDF using a blob
        ok(pdfFrame.src.startsWith("blob:"), "it's a blob URL");

        // 2) Ensure that the PDF has actually loaded
        ok(
          pdfFrame.contentDocument.querySelector("div#viewer"),
          "document content has viewer UI"
        );

        // 3) Ensure we have the correct CSP attached
        let cspJSON = pdfFrame.contentDocument.cspJSON;
        ok(cspJSON.includes("script-src"), "found script-src directive");
        ok(cspJSON.includes("allowPDF"), "found script-src nonce value");

        // 4) Ensure the inherited CSP does not block a chrome: module.
        const chromeScriptLoaded = await new Promise(resolve => {
          const script = pdfFrame.contentDocument.createElement("script");
          script.type = "module";
          script.src = "chrome://global/content/elements/moz-message-bar.mjs";
          script.addEventListener("load", () => resolve(true), { once: true });
          script.addEventListener("error", () => resolve(false), {
            once: true,
          });
          pdfFrame.contentDocument.head.append(script);
        });
        ok(
          chromeScriptLoaded,
          "chrome: module script loaded despite the page CSP"
        );
      });

      await SpecialPowers.spawn(browser, [], async () => {
        const pdfFrame = content.document.getElementById("pdfFrame");
        const viewer =
          pdfFrame.contentWindow.wrappedJSObject.PDFViewerApplication;
        await viewer.testingClose();
      });
    }
  );
});
