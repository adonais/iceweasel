/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function test_external_recording_left_running() {
  info(
    "Test that closing DevTools leaves a profiler recording it did not start running."
  );

  const { startProfiler, stopProfiler } = ChromeUtils.importESModule(
    "resource://devtools/client/performance-new/shared/background.sys.mjs"
  );

  info("Start the profiler outside of DevTools.");
  startProfiler("aboutprofiling");
  ok(
    Services.profiler.IsActive(),
    "The profiler is running before opening DevTools."
  );

  await withDevToolsPanel(async document => {
    info("Wait until the panel reflects the externally started recording.");
    await getActiveButtonFromText(document, "Cancel recording");
  });

  ok(
    Services.profiler.IsActive(),
    "The externally started profiler is still running after closing DevTools."
  );

  info("Stop the externally started profiler.");
  stopProfiler();
});

add_task(async function test_devtools_recording_stopped_on_close() {
  info("Test that closing DevTools stops a recording it started itself.");

  ok(
    !Services.profiler.IsActive(),
    "The profiler is not running before the test."
  );

  await withDevToolsPanel(async document => {
    const button = await getActiveButtonFromText(document, "Start recording");
    info("Click the button to start recording from the panel.");
    button.click();

    await getActiveButtonFromText(document, "Capture recording");
    ok(Services.profiler.IsActive(), "The profiler was started by the panel.");
  });

  await TestUtils.waitForCondition(
    () => !Services.profiler.IsActive(),
    "Waiting for the panel-started profiler to stop after closing DevTools."
  );
  ok(
    !Services.profiler.IsActive(),
    "The panel-started profiler is stopped after closing DevTools."
  );
});
