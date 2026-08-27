"use strict";

/* globals AppConstants, Services */

ChromeUtils.defineESModuleGetters(this, {
  TalosParentProfiler: "resource://talos-powers/TalosParentProfiler.sys.mjs",
});

var OPENER_DELAY = 1000; // ms delay between tests

async function openDelay(win) {
  return new Promise(resolve => {
    win.setTimeout(resolve, OPENER_DELAY);
  });
}

function waitForBrowserPaint() {
  return new Promise(resolve => {
    let observer = {
      observe(doc) {
        if (
          !doc.location ||
          doc.location.href != AppConstants.BROWSER_CHROME_URL
        ) {
          return;
        }
        Services.obs.removeObserver(observer, "document-element-inserted");
        doc.documentGlobal.addEventListener(
          "MozAfterPaint",
          evt => {
            resolve(
              doc.documentGlobal.performance.timing.fetchStart +
                evt.paintTimeStamp
            );
          },
          { once: true }
        );
      },
    };
    Services.obs.addObserver(observer, "document-element-inserted");
  });
}

async function startTest(context) {
  let gcStart = ChromeUtils.now();
  Cu.forceGC();
  Cu.forceCC();
  Cu.forceShrinkingGC();
  ChromeUtils.addProfilerMarker(
    "twinopen setup",
    { startTime: gcStart, category: "Test" },
    "forced GC/CC before opening the window"
  );

  let win = context.appWindow;
  let delayStart = ChromeUtils.now();
  await openDelay(win);
  ChromeUtils.addProfilerMarker(
    "twinopen setup",
    { startTime: delayStart, category: "Test" },
    "openDelay"
  );

  let mozAfterPaint = waitForBrowserPaint();

  // Only start the subtest marker here: everything above is setup, and
  // including it makes the marker several times longer than the value we
  // report.
  TalosParentProfiler.subtestStart("twinopen");

  // We have to compare time measurements across two windows so we must use
  // the absolute time.
  let start = win.performance.timing.fetchStart + win.performance.now();
  let newWin = win.OpenBrowserWindow();
  let end = await mozAfterPaint;
  let duration = end - start;
  TalosParentProfiler.subtestEnd(`twinopen: ${duration.toFixed(1)}ms`);
  newWin.close();
  return duration;
}

/* globals ExtensionAPI */
this.twinopen = class extends ExtensionAPI {
  getAPI(context) {
    return {
      twinopen: {
        startTest: () => startTest(context),
      },
    };
  }
};
