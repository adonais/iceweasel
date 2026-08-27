/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/performance-new/test/browser/helpers.js",
  this
);

// Point the profiler frontend at the in-tree fake frontend, so that the test
// does not reach out to profiler.firefox.com. The origin has to be on the
// allowlist in validateProfilerWebChannelUrl for the WebChannel to work.
const FRONTEND_BASE_HOST = "https://example.com";
const FRONTEND_BASE_PATH =
  "/browser/devtools/client/performance-new/test/browser/fake-frontend.html";
const FRONTEND_BASE_URL = FRONTEND_BASE_HOST + FRONTEND_BASE_PATH;

// Check that a profile can be recorded on the server from the runtime page, and
// that it is handed over to the profiler frontend.
addCompatTask(async function (config) {
  await setProfilerFrontendUrl(FRONTEND_BASE_HOST, FRONTEND_BASE_PATH);

  const { document, tab } = await openAboutDebuggingWithCompatServer(config);
  await connectToRuntime(config.host, document);
  await waitForRuntimePage(config.runtime.brandName, document);

  info("Open the profiler dialog");
  const profilerDocument = await openProfilerDialog(document);

  // Use a preset without a dedicated view, so that the frontend URL is stable.
  info("Select the firefox-platform preset");
  const presetsSelect = await getNearestInputFromText(
    profilerDocument,
    "Settings"
  );
  setReactFriendlyInputValue(presetsSelect, "firefox-platform");

  info("Start recording on the server");
  const startRecording = await getActiveButtonFromText(
    profilerDocument,
    "Start recording"
  );
  startRecording.click();

  info("Capture the recording");
  const captureRecording = await getActiveButtonFromText(
    profilerDocument,
    "Capture recording"
  );
  captureRecording.click();

  info("Wait until the profiler is available to record again");
  await getActiveButtonFromText(profilerDocument, "Start recording");

  info("Check that the profiler frontend was opened in a new tab");
  await waitFor(
    () => gBrowser.currentURI.spec === FRONTEND_BASE_URL,
    `The profiler frontend was opened at ${FRONTEND_BASE_URL}`
  );

  info("Wait for the profile to be handed over to the profiler frontend");
  // Also removes the profiler frontend tab.
  await checkTabLoadedProfile({
    initialTitle: "Waiting on the profile",
    successTitle: "Profile received",
    errorTitle: "Error",
  });

  await removeTab(tab);
});

/**
 * Open the performance profiler dialog from the runtime page and return the
 * document of the profiler iframe.
 */
async function openProfilerDialog(doc) {
  info("Click on the Profile Runtime button");
  doc.querySelector(".qa-profile-runtime-button").click();

  info("Wait for the rendering of the profiler UI");
  const profilerIframe = doc.querySelector(".profiler-dialog__frame");
  await waitFor(
    () => profilerIframe.contentDocument?.querySelector(".perf-presets"),
    "Wait until the profiler presets are ready in the profiler UI"
  );

  return profilerIframe.contentDocument;
}
