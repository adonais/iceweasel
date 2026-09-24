/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Sustained video playback benchmark for measuring power. The workload lives in
// the served page; this script brackets the measured interval.
//
// Power is accumulated between commands.measure.start() and stop(), so the page
// warms up and parks at 'ready' with playback running, and is only told to begin
// its measured interval once the window is open. Start-up therefore falls outside
// it and what remains inside is steady-state playback.

const { logTest } = require("./utils/profiling");

// Each must stay under raptor's 120s no-output timeout for a pageload test, or
// the process is killed for silence before the script can report anything.
const STAGE_TIMEOUT_MS = 60000;
const WARMUP_TIMEOUT_MS = 60000;
const MEASURE_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 100;

// executeAsyncScript appends its completion callback as the last argument, which
// is the only channel back from the page, so every path out of these loops calls
// it. Polling rather than listening also catches a state reached before injection.
//
// Fullscreen needs user activation, which a WebDriver click supplies, so this
// waits for the page to build its stage and then clicks. It matters because a
// video in the content area is scaled by the height of the browser chrome, which
// would land in the power numbers being compared between browsers.
const WAIT_STAGED_SCRIPT = `
  const notifyDone = arguments[arguments.length - 1];
  const deadline = Date.now() + ${STAGE_TIMEOUT_MS};
  (function poll() {
    const button = document.getElementById("gesture");
    const state = window.mediaPlaybackState;
    if (state === "error") {
      return notifyDone({ error: window.mediaPlaybackError });
    }
    // Positive conditions only, because navigate() returns before the document
    // exists, and browsertime fails the run on a click it cannot perform.
    if (button && (state === "warmup" || state === "ready")) {
      const box = button.getBoundingClientRect();
      return notifyDone({
        staged: true,
        needsGesture:
          document.fullscreenElement === null && box.width > 0 && box.height > 0,
      });
    }
    if (Date.now() > deadline) {
      return notifyDone({
        error: "timed out before the page was ready to click, state=" + state,
      });
    }
    setTimeout(poll, ${POLL_INTERVAL_MS});
  })();
`;

// Waits for the page to finish its warmup. Playback is already running when this
// resolves, so the window can be opened without a gap.
const WAIT_READY_SCRIPT = `
  const notifyDone = arguments[arguments.length - 1];
  const deadline = Date.now() + ${WARMUP_TIMEOUT_MS};
  (function poll() {
    if (window.mediaPlaybackState === "ready") {
      if (
        typeof window.mediaPlaybackBeginMeasure !== "function" ||
        typeof window.mediaPlaybackMeasurementCount !== "number"
      ) {
        return notifyDone({
          error:
            "the benchmark page does not offer the interface this script drives;" +
            " it and the pinned revision are out of sync",
        });
      }
      return notifyDone({ ready: true });
    }
    if (window.mediaPlaybackState === "error") {
      return notifyDone({ error: window.mediaPlaybackError });
    }
    if (Date.now() > deadline) {
      return notifyDone({
        error: "timed out waiting for warmup, state=" + window.mediaPlaybackState,
      });
    }
    setTimeout(poll, ${POLL_INTERVAL_MS});
  })();
`;

// Opens the page's measured interval and waits for its results.
const MEASURE_SCRIPT = `
  const notifyDone = arguments[arguments.length - 1];
  const deadline = Date.now() + ${MEASURE_TIMEOUT_MS};
  const before = window.mediaPlaybackMeasurementCount;
  try {
    window.mediaPlaybackBeginMeasure();
  } catch (e) {
    return notifyDone({ error: "failed to begin measurement: " + String(e) });
  }
  (function poll() {
    if (window.mediaPlaybackMeasurementCount > before) {
      return notifyDone(window.mediaPlaybackResult);
    }
    if (window.mediaPlaybackState === "error") {
      return notifyDone({ error: window.mediaPlaybackError });
    }
    if (Date.now() > deadline) {
      return notifyDone({
        error: "timed out measuring, state=" + window.mediaPlaybackState,
      });
    }
    setTimeout(poll, ${POLL_INTERVAL_MS});
  })();
`;

module.exports = logTest(
  "media playback test",
  async function (context, commands) {
    context.log.info("Starting media playback test");

    const url = context.options.browsertime.url;
    const post_startup_delay = context.options.browsertime.post_startup_delay;
    const page_cycles = context.options.browsertime.page_cycles;
    const page_cycle_delay = context.options.browsertime.page_cycle_delay;

    await commands.navigate("about:blank");
    await commands.wait.byTime(post_startup_delay);

    // Load the page once and bring it to steady-state playback.
    await commands.navigate(url);

    const staged =
      await context.selenium.driver.executeAsyncScript(WAIT_STAGED_SCRIPT);
    if (!staged || staged.error) {
      context.log.error(
        `media playback setup failed: ${staged && staged.error}`
      );
      return false;
    }
    if (staged.needsGesture) {
      await commands.mouse.singleClick.bySelector("#gesture");
    }

    const ready =
      await context.selenium.driver.executeAsyncScript(WAIT_READY_SCRIPT);
    if (!ready || ready.error) {
      context.log.error(
        `media playback warmup failed: ${ready && ready.error}`
      );
      return false;
    }

    // Measure: one power interval per cycle, over the same playing video.
    for (let cycle = 0; cycle < page_cycles; cycle++) {
      context.log.info(`Starting cycle ${cycle + 1}/${page_cycles}`);

      // stop() closes the power interval, so it has to run even if the script
      // throws.
      let result;
      await commands.measure.start();
      try {
        result =
          await context.selenium.driver.executeAsyncScript(MEASURE_SCRIPT);
      } finally {
        await commands.measure.stop();
      }

      if (!result || result.error) {
        context.log.error(
          `media playback test failed: ${result && result.error}`
        );
        return false;
      }
      context.log.info(`media playback result: ${JSON.stringify(result)}`);

      await commands.measure.addObject({ custom_data: result });

      if (page_cycle_delay) {
        await commands.wait.byTime(page_cycle_delay);
      }
    }

    context.log.info("Media playback test ended");
    return true;
  }
);
