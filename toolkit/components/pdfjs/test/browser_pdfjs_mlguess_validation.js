/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const IMAGE_TO_TEXT_TASK = "moz-image-to-text";

// A valid 2x2 RGBA payload.
function validRequest() {
  return {
    data: new Uint8ClampedArray(2 * 2 * 4),
    width: 2,
    height: 2,
    channels: 4,
  };
}

// Send directly through the all-frame PdfJs actor, as a compromised content
// process could.
function mlGuess(browser, data) {
  return SpecialPowers.spawn(browser, [data], payload =>
    content.windowGlobalChild
      .getActor("PdfJs")
      .sendQuery("PDFJS:Parent:mlGuess", payload)
  );
}

// Only pixel data with matching geometry may reach the ML pipeline.
add_task(async function test_mlGuess_only_accepts_raw_pixels() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TESTROOT + "file_pdf_download_link.html" },
    async function (browser) {
      // Accepted requests return the automation stub response; rejected
      // requests return null.
      Assert.deepEqual(
        await mlGuess(browser, {
          service: IMAGE_TO_TEXT_TASK,
          request: validRequest(),
        }),
        { output: "In Automation" },
        "the payload the viewer sends is forwarded to the engine"
      );

      const withUrl = validRequest();
      withUrl.url = "file:///etc/passwd";
      const insteadOfChannels = validRequest();
      delete insteadOfChannels.channels;
      insteadOfChannels.url = "file:///etc/passwd";

      for (const [description, data] of [
        ["no payload at all", undefined],
        ["a null payload", null],
        ["no request", { service: IMAGE_TO_TEXT_TASK }],
        ["a null request", { service: IMAGE_TO_TEXT_TASK, request: null }],
        [
          "an unknown service",
          { service: "moz-echo", request: validRequest() },
        ],
        [
          "a url to fetch",
          {
            service: IMAGE_TO_TEXT_TASK,
            request: { url: "file:///etc/passwd" },
          },
        ],
        [
          "a url next to valid pixels",
          { service: IMAGE_TO_TEXT_TASK, request: withUrl },
        ],
        [
          "a url in place of channels",
          { service: IMAGE_TO_TEXT_TASK, request: insteadOfChannels },
        ],
        [
          "a url as the whole payload",
          { service: IMAGE_TO_TEXT_TASK, request: "file:///etc/passwd" },
        ],
        [
          "dimensions that don't match the data",
          {
            service: IMAGE_TO_TEXT_TASK,
            request: { ...validRequest(), width: 4096 },
          },
        ],
        [
          "data that isn't bytes",
          {
            service: IMAGE_TO_TEXT_TASK,
            request: { ...validRequest(), data: "AAAAAAAAAAAAAAAA" },
          },
        ],
      ]) {
        Assert.equal(
          await mlGuess(browser, data),
          null,
          `mlGuess with ${description} is rejected`
        );
      }
    }
  );
});
