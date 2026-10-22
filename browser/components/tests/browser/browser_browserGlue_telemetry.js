/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Check that telemetry reports Firefox is not pinned on any OS at startup.
add_task(function check_startup_pinned_telemetry() {
  // Check the appropriate telemetry is set or not reported by platform.
  switch (AppConstants.platform) {
    case "win":
      Assert.strictEqual(
        Glean.osEnvironment.isTaskbarPinned.testGetValue(),
        false,
        "Pin set on win"
      );
      if (Services.sysinfo.getProperty("hasWinPackageId")) {
        // Bug 1911343: Pinning regular browsing on MSIX
        // causes false positives when checking for private
        // browsing. As a result no telemetry is logged regarding
        // private pin status.
        Assert.strictEqual(
          Glean.osEnvironment.isTaskbarPinnedPrivate.testGetValue(),
          null,
          "Pin private not set on win MSIX"
        );
      } else {
        Assert.strictEqual(
          Glean.osEnvironment.isTaskbarPinnedPrivate.testGetValue(),
          false,
          "Pin private set on win"
        );
      }
      Assert.strictEqual(
        Glean.osEnvironment.isKeptInDock.testGetValue(),
        null,
        "Dock not set on win"
      );
      break;
    case "macosx":
      Assert.strictEqual(
        Glean.osEnvironment.isTaskbarPinned.testGetValue(),
        null,
        "Pin not set on mac"
      );
      Assert.strictEqual(
        Glean.osEnvironment.isTaskbarPinnedPrivate.testGetValue(),
        null,
        "Pin private not set on mac"
      );
      Assert.strictEqual(
        Glean.osEnvironment.isKeptInDock.testGetValue(),
        false,
        "Dock set on mac"
      );
      break;
    default:
      Assert.strictEqual(
        Glean.osEnvironment.isTaskbarPinned.testGetValue(),
        null,
        "Pin not set"
      );
      Assert.strictEqual(
        Glean.osEnvironment.isTaskbarPinnedPrivate.testGetValue(),
        null,
        "Pin private not set"
      );
      Assert.strictEqual(
        Glean.osEnvironment.isKeptInDock.testGetValue(),
        null,
        "Dock not set"
      );
      break;
  }
});

// Check that telemetry reports whether Firefox is the default PDF handler.
// This is safe without any explicit coordination because idle tasks are
// guaranteed to have been invokedbefore the test harness invokes the test.  See
// https://searchfox.org/mozilla-central/rev/1674b86019a96f076e0f98f1d0f5f3ab9d4e9020/browser/components/BrowserGlue.jsm#2320-2324
// and
// https://searchfox.org/mozilla-central/rev/1674b86019a96f076e0f98f1d0f5f3ab9d4e9020/browser/base/content/browser.js#2364.
add_task(function check_is_default_handler_telemetry() {
  const handlers = [".pdf", "mailto"];

  // Check the appropriate telemetry is set or not reported by platform.
  switch (AppConstants.platform) {
    case "win": {
      for (const handler of handlers) {
        // We should always set whether we're the default handler.
        const isDefault =
          Glean.osEnvironment.isDefaultHandler[handler].testGetValue();
        Assert.notStrictEqual(
          isDefault,
          null,
          `${handler} handler present in telemetry`
        );

        if (Cu.isInAutomation) {
          // But only in automation can we assume we're not the default handler.
          Assert.strictEqual(
            isDefault,
            false,
            `Not default ${handler} handler on Windows`
          );
        }
      }
      break;
    }
    default:
      Assert.deepEqual(
        Glean.osEnvironment.isDefaultHandler.testGetValue() ?? {},
        {},
        "No handler present in telemetry"
      );
      break;
  }
});
