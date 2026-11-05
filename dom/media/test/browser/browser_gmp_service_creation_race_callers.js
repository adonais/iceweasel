/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// This test verifies that main thread GMP queries and a pending decodingInfo
// query, from the page or from a worker, all settle in a content process that
// has no GMP service yet.

"use strict";

// Main thread calls that ask for GMP support, with a check of their result.
const MAIN_CALLS = {
  RTCPeerConnection: state =>
    is(state, "stable", "RTCPeerConnection was created"),
  "RTCRtpSender.getCapabilities": codecs =>
    Assert.greater(codecs, 0, "getCapabilities returned codecs"),
  "webrtc decodingInfo": supported =>
    ok(supported, "webrtc decodingInfo resolved as supported"),
  requestMediaKeySystemAccess: keySystem =>
    is(keySystem, "org.w3.clearkey", "requestMediaKeySystemAccess resolved"),
  canPlayType: canPlay =>
    ok(
      ["", "maybe", "probably"].includes(canPlay),
      `canPlayType returned a valid value "${canPlay}"`
    ),
};

// Starts a decodingInfo query in a fresh content process, blocks the main
// thread, then runs a main thread call that asks for GMP support. Asserts that
// the query resolved and returns the result of the main thread call.
// - `inWorker`: if true, the query runs in a dedicated worker with a WebRTC
//   config. Otherwise it runs on the page with a media-source config.
// - `mainCall`: the main thread call, a key of MAIN_CALLS.
async function raceInFreshProcess({ inWorker, mainCall }) {
  const PAGE_URL =
    "https://example.com/browser/dom/media/test/browser/file_empty_page.html";
  const WEBRTC_CONFIG = {
    type: "webrtc",
    video: {
      contentType: "video/VP8",
      width: 640,
      height: 480,
      bitrate: 1000000,
      framerate: 30,
    },
  };
  let result;
  // forceNewProcess gives a content process that has not created the GMP
  // service yet.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL, forceNewProcess: true },
    async browser => {
      result = await SpecialPowers.spawn(
        browser,
        [inWorker, mainCall, WEBRTC_CONFIG],
        async (inWorker, mainCall, webrtcConfig) => {
          let worker;
          let pending;
          if (inWorker) {
            const workerSource = `
              onmessage = async ({ data: config }) => {
                try {
                  const info = await navigator.mediaCapabilities.decodingInfo(config);
                  postMessage({ status: "fulfilled", supported: info.supported });
                } catch (e) {
                  postMessage({ status: "rejected", error: String(e) });
                }
              };
              postMessage("ready");
            `;
            worker = new content.Worker(
              content.URL.createObjectURL(
                new content.Blob([workerSource], { type: "text/javascript" })
              )
            );
            const nextMessage = () =>
              new Promise((resolve, reject) => {
                worker.onmessage = e => resolve(e.data);
                worker.onerror = e => reject(new Error(e.message));
              });
            await nextMessage();
            pending = nextMessage().then(data =>
              data.status == "fulfilled"
                ? data.supported
                : Promise.reject(new Error(data.error))
            );
            worker.postMessage(webrtcConfig);
          } else {
            pending = content.navigator.mediaCapabilities
              .decodingInfo({
                type: "media-source",
                video: {
                  contentType: 'video/mp4; codecs="avc1.4D4016"',
                  width: 160,
                  height: 90,
                  bitrate: 100000,
                  framerate: 24,
                },
              })
              .then(info => info.supported);
          }
          const start = content.performance.now();
          while (content.performance.now() - start < 1000) {
            // Spin instead of awaiting a timer: the main thread must not run
            // events, so that the background query runs before the main thread
            // call.
          }
          try {
            let mainResult;
            switch (mainCall) {
              case "RTCPeerConnection": {
                const pc = new content.RTCPeerConnection();
                mainResult = pc.signalingState;
                pc.close();
                break;
              }
              case "RTCRtpSender.getCapabilities":
                mainResult =
                  content.RTCRtpSender.getCapabilities("video").codecs.length;
                break;
              case "webrtc decodingInfo":
                mainResult = (
                  await content.navigator.mediaCapabilities.decodingInfo(
                    webrtcConfig
                  )
                ).supported;
                break;
              case "requestMediaKeySystemAccess":
                mainResult = (
                  await content.navigator.requestMediaKeySystemAccess(
                    "org.w3.clearkey",
                    [
                      {
                        initDataTypes: ["webm"],
                        videoCapabilities: [
                          { contentType: 'video/webm; codecs="vp9"' },
                        ],
                      },
                    ]
                  )
                ).keySystem;
                break;
              case "canPlayType":
                mainResult = content.document
                  .createElement("video")
                  .canPlayType('video/mp4; codecs="avc1.42E01E"');
                break;
              default:
                throw new Error(`Unknown main thread call ${mainCall}`);
            }
            const [queryResult] = await Promise.allSettled([pending]);
            return {
              queryStatus: queryResult.status,
              queryError: String(queryResult.reason ?? ""),
              mainResult,
            };
          } finally {
            worker?.terminate();
          }
        }
      );
    }
  );
  is(
    result.queryStatus,
    "fulfilled",
    `decodingInfo resolved ${inWorker ? "in the worker" : "on the page"} ${result.queryError}`
  );
  return result.mainResult;
}

for (const inWorker of [false, true]) {
  for (const [mainCall, check] of Object.entries(MAIN_CALLS)) {
    // On the page, the pref that canPlayType needs makes decodingInfo create
    // the GMP service on the main thread first, so there is no race.
    if (!inWorker && mainCall == "canPlayType") {
      continue;
    }
    add_task(async function testDecodingInfoThenMainThreadCall() {
      info(
        `decodingInfo ${inWorker ? "in a worker" : "on the page"}, then ${mainCall}`
      );
      if (mainCall == "canPlayType") {
        // Make canPlayType ask the GMP decoder module first.
        await SpecialPowers.pushPrefEnv({
          set: [["media.gmp.decoder.preferred", true]],
        });
      }
      check(await raceInFreshProcess({ inWorker, mainCall }));
    });
  }
}
