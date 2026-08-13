/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Single place for test harnesses to save a profile as a CI artifact, shared
// between the mochitest (browser-test.js) and xpcshell (head.js) harnesses.
//
// installProfilerDumpAndQuit() registers an observer for the
// "profiler-dump-and-quit" topic, which Gecko notifies (see
// MOZ_DUMP_PROFILE_OR_CRASH_UNSAFE) when a fatal, test-only condition is hit
// during a profiled run. Rather than crashing and losing the profile, the
// observer reports a failure for the current test, saves the profile, and ends
// the process.

const DUMP_AND_QUIT_TOPIC = "profiler-dump-and-quit";

/**
 * Gather a profile, write it as a CI artifact in MOZ_UPLOAD_DIR, and report an
 * unmissable failure naming the artifact (in the "profile uploaded in <file>"
 * form the dashboards recognize) so the profile can be associated with the
 * failure.
 *
 * Requires MOZ_UPLOAD_DIR to be set and the profiler to be active; callers are
 * expected to check those conditions.
 *
 * @param {string} testName Test named in the reported failure.
 * @param {object} logger StructuredLogger used to report the failure.
 * @param {string} profileName Names the profile artifact file (only its
 *   basename is used); defaults to testName.
 * @param {boolean} testRunning Whether a test is running. When true the failure
 *   is reported as that test's status; when false (e.g. at shutdown) it is
 *   reported as a top-level error instead, since a per-test status would be tied
 *   to a test that has already ended and wouldn't reach the failure summary.
 */
export async function uploadProfileArtifact(
  testName,
  logger,
  profileName = testName,
  testRunning = true
) {
  let basename = profileName.replace(/.*\//, "");
  let uploadDir = Services.env.get("MOZ_UPLOAD_DIR");
  let message;
  try {
    // The same test can fail more than once in a run (it was retried, or it is
    // referenced from several manifests), reusing the same upload directory.
    // Don't overwrite an earlier profile: each run's log message points at the
    // file it wrote, and the failures may differ, so every one is worth keeping.
    let filename = `profile_${basename}.json`;
    let path = PathUtils.join(uploadDir, filename);
    for (let i = 2; await IOUtils.exists(path); ++i) {
      // Insert the counter before the file extension (so a ".js" test's profile
      // still ends in ".js.json", which Treeherder requires) or append it when
      // there is no extension. The extension must be optional: an extension-less
      // name (e.g. a shutdown profile) would otherwise be left unchanged, so the
      // path would never differ and this loop would spin forever.
      filename = `profile_${basename.replace(/(\.\w+)?$/, (m, ext = "") => `-${i}${ext}`)}.json`;
      path = PathUtils.join(uploadDir, filename);
    }

    if (Services.startup.shuttingDown) {
      // A multi-process gather would hang waiting on the child processes that
      // are blocking shutdown; dump just this process synchronously instead.
      Services.profiler.dumpProfileToFile(path);
    } else {
      const { profile } =
        await Services.profiler.getProfileDataAsGzippedArrayBuffer();
      await IOUtils.write(path, new Uint8Array(profile));
    }
    message = `profile uploaded in ${filename}`;
  } catch (e) {
    // If the profile is large, we may encounter out of memory errors.
    message = `failed to upload profile: ${e}`;
  }
  if (testRunning) {
    logger.testStatus(testName, null, "FAIL", "PASS", message);
  } else {
    logger.error(`${testName} | ${message}`);
  }
}

async function saveProfileForFatalCondition(
  testName,
  logger,
  profileName,
  testRunning
) {
  if (Services.env.exists("MOZ_UPLOAD_DIR")) {
    await uploadProfileArtifact(testName, logger, profileName, testRunning);
    return;
  }
  // Local --profiler runs save the profile on shutdown to this file instead.
  let shutdownFile = Services.env.get("MOZ_PROFILER_SHUTDOWN");
  if (shutdownFile) {
    if (Services.startup.shuttingDown) {
      // As in uploadProfileArtifact, a multi-process gather would hang waiting
      // on the child processes blocking shutdown; dump this process only.
      Services.profiler.dumpProfileToFile(shutdownFile);
    } else {
      await Services.profiler.dumpProfileToFileAsync(shutdownFile);
    }
  }
}

let gDumpingAndQuitting = false;

// A profile-or-crash condition can fire during XPCOM shutdown, after xpcshell
// has set every top-level binding of the test global (Services, the harness
// logger, _TEST_NAME) to undefined (JS_SetAllNonReservedSlotsToUndefined in
// XPCShellImpl.cpp), so the harness's reportFatalCondition callback throws. This
// module's own scope is still live, so fall back to a logger created here to
// still report and save the profile. Created lazily because most runs never
// reach this path.
let gFallbackLogger;
// The current test's name, cached here (in nuke-proof module scope) by the
// xpcshell harness so the fallback path above can still name the profile
// artifact after the test global is gone.
let gCachedTestName;

/**
 * Cache the name of the running test so a profile-or-crash condition that fires
 * after the test global has been torn down can still name its artifact.
 *
 * @param {string} testName Name of the running test.
 */
export function setProfilerDumpTestName(testName) {
  gCachedTestName = testName;
}

function getFallbackLogger() {
  if (!gFallbackLogger) {
    const { StructuredLogger } = ChromeUtils.importESModule(
      "resource://testing-common/StructuredLog.sys.mjs"
    );
    // Only xpcshell reaches this path: its callback touches the nuked test
    // global, whereas mochitest's reads the still-live Tester. Hence the
    // xpcshell logger name.
    gFallbackLogger = new StructuredLogger("xpcshell/head.js", msg =>
      dump(JSON.stringify(msg) + "\n")
    );
  }
  return gFallbackLogger;
}

/**
 * Register the handler for Gecko's "profiler-dump-and-quit" notification. When
 * a fatal test-only condition is hit during a profiled run, the handler reports
 * a failure (tied to the current test) via the harness, saves the profile, and
 * ends the process.
 *
 * @param {function(string): object} reportFatalCondition Harness callback that
 *   logs an unmissable failure for the current test, given the failure reason
 *   (recording a profiler marker captured in the saved profile), and returns
 *   { testName, logger, endTest, profileName, testRunning }. testName names the
 *   test in the reported failure; logger reports where the profile was saved;
 *   endTest(), if provided, ends the test; profileName optionally names the
 *   artifact file; testRunning is false when no test is running (e.g. at
 *   shutdown), so the failure is reported as a top-level error.
 */
export function installProfilerDumpAndQuit(reportFatalCondition) {
  Services.obs.addObserver((subject, topic, data) => {
    // Spinning the event loop below can deliver another notification before we
    // exit; only handle the first one.
    if (gDumpingAndQuitting) {
      return;
    }
    gDumpingAndQuitting = true;

    let testName, logger, endTest, profileName, testRunning;
    try {
      ({
        testName,
        logger,
        endTest,
        profileName,
        testRunning = true,
      } = reportFatalCondition(data || "fatal test-only condition"));
    } catch (e) {
      // The test global was torn down (late shutdown); report a top-level error
      // and save the profile from this module's still-live scope, using the test
      // name cached before teardown and a logger created here. The harness
      // callback would normally log the failure reason; do it here in its place.
      testName = gCachedTestName || "shutdown";
      logger = getFallbackLogger();
      logger.error(`${testName} | ${data || "fatal test-only condition"}`);
      testRunning = false;
    }

    if (Services.profiler.IsActive()) {
      let done = false;
      saveProfileForFatalCondition(testName, logger, profileName, testRunning)
        .catch(e => {
          console.error(`Failed to save profile of the failure: ${e}`);
        })
        .finally(() => {
          done = true;
        });

      // The notification is delivered synchronously on the main thread, so spin
      // the event loop here to let the multi-process gather and the file write
      // complete before we end the process.
      Services.tm.spinEventLoopUntil(
        "TestProfilerArtifact:profiler-dump-and-quit",
        () => done
      );
    }

    // End the test only now: dashboards associate the profile with the test by
    // matching the upload message, which must be logged before the test_end
    // line that endTest() emits. There is no test to end when none is running.
    endTest?.();

    Cu.exitIfInAutomation();
  }, DUMP_AND_QUIT_TOPIC);
}
