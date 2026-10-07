/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end performance coverage for Link Preview key points: generation is
// triggered through the real hover flow, so the ML engine is configured by
// production code, and the reported series are user-perceived spans.
// Production tears the engine down after each generation, so the "-cold"
// series is the shipping state.
//
// Parsed by the mozperftest static parser (vendored esprima, ES2017): no
// optional chaining, nullish coalescing, or object spread.

const { LinkPreview } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/LinkPreview.sys.mjs"
);
const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);

MLPerfTestUtils.init(this);

// The model workload is what production resolves for this page: input capped
// by browser.ml.linkPreview.inputSentences (~6 sentences of the article
// regardless of its length), output by outputSentences.
const ARTICLE_URL =
  "https://example.com/browser/browser/components/genai/tests/browser/data/readableEn.html";

const METRIC_PREFIX = "LINKPREVIEW";
const FIRST_KEYPOINT_LATENCY = "first-keypoint-latency";
const KEYPOINTS_COMPLETE_LATENCY = "keypoints-complete-latency";

const GENERATION_POLL_INTERVAL_MS = 250;
const GENERATION_MAX_POLLS = 2400;

const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_link_preview_perf.js",
  description:
    "User-perceived latency and inference memory for Link Preview key points, driven through the production UI flow",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        {
          name: "LINKPREVIEW-first-keypoint-latency-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-first-keypoint-latency-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-keypoints-complete-latency-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-keypoints-complete-latency-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-time-to-first-token-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-time-to-first-token-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-decoding-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "LINKPREVIEW-decoding-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "LINKPREVIEW-tokens-per-second-first-use",
          unit: "tokens/s",
          shouldAlert: false,
          lowerIsBetter: false,
        },
        {
          name: "LINKPREVIEW-tokens-per-second-cold",
          unit: "tokens/s",
          shouldAlert: true,
          lowerIsBetter: false,
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

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("browser.ml.linkPreview.onboardingTimes");
});

async function setupLinkPreview() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.linkPreview.enabled", true],
      // LinkPreviewModel.runSmokeTest adds a hidden canary generation once
      // per build; mark it done so no iteration pays it.
      [
        "browser.ml.linkPreview.smokeTest.lastBuildID",
        Services.appinfo.appBuildID,
      ],
    ],
  });
}

// One full user interaction, resolving with spans measured from the moment
// the hover is signaled.
async function generateKeyPointsOnce() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      altKey: true,
      shiftKey: true,
    })
  );

  const start = performance.now();
  XULBrowserWindow.setOverLink(ARTICLE_URL);

  const panel = await TestUtils.waitForCondition(
    () => document.getElementById("link-preview-panel"),
    "Waiting for the link preview panel"
  );
  const card = await TestUtils.waitForCondition(
    () => panel.querySelector("link-preview-card"),
    "Waiting for the link preview card"
  );

  // Engine creation delays the first key point well past card creation, so
  // wrapping here cannot miss one.
  const keyPointTimes = [];
  const originalAddKeyPoint = card.addKeyPoint;
  card.addKeyPoint = function (text) {
    keyPointTimes.push(performance.now());
    return originalAddKeyPoint.call(this, text);
  };

  try {
    await TestUtils.waitForCondition(
      () => card.generationError || (keyPointTimes.length && !card.generating),
      "Waiting for key points generation to complete",
      GENERATION_POLL_INTERVAL_MS,
      GENERATION_MAX_POLLS
    );
  } finally {
    card.addKeyPoint = originalAddKeyPoint;
  }

  Assert.ok(
    !card.generationError,
    "Key points generation completed without error"
  );
  Assert.greater(
    card.keyPoints.length,
    0,
    "The production flow produced key points"
  );

  const measurements = {};
  measurements[FIRST_KEYPOINT_LATENCY] = keyPointTimes[0] - start;
  measurements[KEYPOINTS_COMPLETE_LATENCY] =
    keyPointTimes[keyPointTimes.length - 1] - start;

  panel.remove();
  LinkPreview.keyboardComboActive = false;

  return measurements;
}

add_task(async function test_link_preview_keypoints_perf() {
  await setupLinkPreview();

  Assert.ok(
    LinkPreview.canShowKeyPoints,
    "Link Preview key points are available on this machine"
  );

  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: METRIC_PREFIX,
    scenario: generateKeyPointsOnce,
    engines: [{ featureId: "link-preview" }],
  });
});
