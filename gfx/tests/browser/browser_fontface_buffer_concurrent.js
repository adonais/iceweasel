/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL =
  "https://example.com/browser/gfx/tests/browser/file_fontface_buffer_concurrent.html";
const WORKER_COUNT = 4;
// Repeat in fresh processes to exercise loader initialization.
const ATTEMPTS = 10;

add_task(async function test_concurrent_first_buffer_fontfaces() {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    await BrowserTestUtils.withNewTab(
      { gBrowser, url: TEST_URL, forceNewProcess: true },
      async browser => {
        info(
          `Attempt ${attempt} in process ${browser.browsingContext.currentWindowGlobal.osPid}`
        );
        const results = await SpecialPowers.spawn(
          browser,
          [WORKER_COUNT],
          async count => {
            const faces =
              await content.wrappedJSObject.createFontFacesConcurrently(count);
            return Array.from(faces, ({ statusAfterConstructor, error }) => ({
              statusAfterConstructor,
              error,
            }));
          }
        );
        Assert.equal(results.length, WORKER_COUNT, "Got all the results");
        const failures = results
          .map((result, worker) => ({ worker, ...result }))
          .filter(
            ({ statusAfterConstructor, error }) =>
              statusAfterConstructor == "error" || error
          );
        Assert.deepEqual(
          failures,
          [],
          `All the FontFaces loaded in attempt ${attempt}`
        );
      }
    );
  }
});
