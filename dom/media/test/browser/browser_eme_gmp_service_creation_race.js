/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// This test verifies that requestMediaKeySystemAccess and a pending
// decodingInfo query both settle in a content process that has no GMP service
// yet.

"use strict";

const PAGE_URL =
  "https://example.com/browser/dom/media/test/browser/file_empty_page.html";

add_task(async function testDecodingInfoThenRequestMediaKeySystemAccess() {
  // forceNewProcess gives a content process that has not created the GMP
  // service yet.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL, forceNewProcess: true },
    async browser => {
      const result = await SpecialPowers.spawn(browser, [], async () => {
        const decoding = content.navigator.mediaCapabilities.decodingInfo({
          type: "media-source",
          video: {
            contentType: 'video/mp4; codecs="avc1.4D4016"',
            width: 160,
            height: 90,
            bitrate: 100000,
            framerate: 24,
          },
        });
        const start = content.performance.now();
        while (content.performance.now() - start < 1000) {
          // Spin instead of awaiting a timer: the main thread must not run
          // events, so that the background support query runs before the key
          // system request.
        }
        const access = content.navigator.requestMediaKeySystemAccess(
          "org.w3.clearkey",
          [
            {
              initDataTypes: ["webm"],
              videoCapabilities: [{ contentType: 'video/webm; codecs="vp9"' }],
            },
          ]
        );
        const [decodingResult, accessResult] = await Promise.allSettled([
          decoding,
          access,
        ]);
        return {
          decodingStatus: decodingResult.status,
          accessStatus: accessResult.status,
          keySystem: accessResult.value?.keySystem,
        };
      });
      is(result.decodingStatus, "fulfilled", "decodingInfo resolved");
      is(
        result.accessStatus,
        "fulfilled",
        "requestMediaKeySystemAccess found ClearKey in the GMP capabilities"
      );
      is(result.keySystem, "org.w3.clearkey", "Got access to ClearKey");
    }
  );
});
