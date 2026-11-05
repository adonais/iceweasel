/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end performance coverage for the Smart Window intent classifier: the
// prompt is typed into the real smartbar, so the classifier engine is created
// and run by the production urlbar provider, and the reported span is
// user-perceived: from the last keystroke until the smartbar shows the
// detected intent.
//
// Both models getIntentModelInfoForLocale() can pick are measured; the en-fr
// one serves users whose home region is FR.
//
// Parsed by the mozperftest static parser (vendored esprima, ES2017): no
// optional chaining, nullish coalescing, or object spread.

const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);
const { Region } = ChromeUtils.importESModule(
  "resource://gre/modules/Region.sys.mjs"
);

MLPerfTestUtils.init(this);

const INTENT_LATENCY = "intent-latency";
const INTENT_TIMEOUT_MS = 30000;

// Chat-leaning and not on the forced-chat allowlist, so the model decides. A
// failed classification falls back to "search", which the scenario rejects.
// UrlbarProviderAiChat reuses the last intent for a related query (see
// stringsAreUnrelated), so samples alternate between two unrelated prompts.
const PROMPTS = [
  "how do i convince my landlord to fix the boiler",
  "help me plan a surprise birthday party for my grandmother",
];
let promptIndex = 0;

const MODELS = [
  { name: "default", region: "US", featureId: "smart-intent" },
  { name: "en-fr", region: "FR", featureId: "smart-intent-en-fr" },
];

const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_smartwindow_intent_perf.js",
  description:
    "User-perceived latency and inference memory for the Smart Window intent classifier, driven through the production smartbar flow",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        {
          name: "SMART-INTENT-default-intent-latency-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-default-intent-latency-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-intent-latency-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-default-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-default-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-memory-before-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-default-memory-before-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-memory-before-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-default-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-default-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-intent-latency-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-en-fr-intent-latency-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-intent-latency-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-en-fr-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-en-fr-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-memory-before-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-en-fr-memory-before-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-memory-before-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "SMART-INTENT-en-fr-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SMART-INTENT-en-fr-peak-memory",
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
 * Types a prompt into the smartbar and waits for it to show the detected
 * intent.
 *
 * @param {MozBrowser} browser - The browser hosting ai-window.
 * @returns {Promise<Record<string, number>>} The feature measurements.
 */
async function classifyOnce(browser) {
  const prompt = PROMPTS[promptIndex++ % PROMPTS.length];
  const { latency, intent } = await SpecialPowers.spawn(
    browser,
    [prompt, INTENT_TIMEOUT_MS],
    async (text, timeoutMs) => {
      const aiWindow = content.document.querySelector("ai-window");
      const bar = await ContentTaskUtils.waitForCondition(() => {
        const el = aiWindow.shadowRoot.querySelector("#ai-window-smartbar");
        return el && el.inputField && el;
      }, "Wait for the smartbar");

      bar.clearSmartbarInput();
      bar.value = text.slice(0, -1);
      bar.inputField.focus();

      // lastQueryContextPromise is not yet this prompt's query when sendString
      // returns, so wait for its results. The smartbar updates the detected
      // intent once no heuristic provider is pending.
      let listener;
      const intentShown = new Promise(resolve => {
        listener = {
          onQueryResults(queryContext) {
            if (
              queryContext.searchString === text &&
              !queryContext.pendingHeuristicProviders.size
            ) {
              resolve();
            }
          },
        };
        bar.controller.addListener(listener);
      });

      const start = content.performance.now();
      EventUtils.sendString(text.slice(-1), content);
      // Fail fast if the results never arrive, instead of hanging until the
      // file-level timeout.
      let timer;
      try {
        await Promise.race([
          intentShown,
          new Promise((resolve, reject) => {
            timer = content.setTimeout(
              () => reject(new Error("Timed out waiting for the intent")),
              timeoutMs
            );
          }),
        ]);
      } finally {
        content.clearTimeout(timer);
        bar.controller.removeListener(listener);
      }
      const end = content.performance.now();

      const detected = bar.detectedIntent;
      bar.clearSmartbarInput();
      return { latency: end - start, intent: detected };
    }
  );

  Assert.equal(intent, "chat", "The intent classifier detected a chat prompt");

  const measurements = {};
  measurements[INTENT_LATENCY] = latency;
  return measurements;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.firstrun.modelChoice", "0"]],
  });

  const originalRegion = Region.home;
  registerCleanupFunction(() => {
    Region._setHomeRegion(originalRegion, false);
  });
});

add_task(async function test_smartwindow_intent_perf() {
  const win = await AIWindowTestUtils.openReadyAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;
    await AIWindowTestUtils.getAichatBrowser(browser);

    for (const model of MODELS) {
      Region._setHomeRegion(model.region, false);

      await MLPerfTestUtils.runPerfScenario({
        metricPrefix: `SMART-INTENT-${model.name}`,
        scenario: () => classifyOnce(browser),
        engines: [{ featureId: model.featureId }],
        coldIterations: 5,
        warmIterations: 5,
        memoryIterations: 3,
      });
    }
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});
