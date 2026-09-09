/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ShellService: "moz-src:///browser/components/shell/ShellService.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  StartupTelemetry: "moz-src:///browser/components/StartupTelemetry.sys.mjs",
});

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

add_task(async function check_desktop_entry_telemetry() {
  if (AppConstants.platform != "linux") {
    Assert.strictEqual(
      Glean.osEnvironment.desktopEntryExists.testGetValue(),
      null,
      "desktop_entry_exists is unset on non-Linux platforms"
    );
    return;
  }

  // Check that it was set to something before. (This is meant to check that it
  // was set at startup, although if the tests repeat then it might bleed
  // through.)
  Assert.ok(
    Glean.osEnvironment.desktopEntryExists.testGetValue(),
    "desktop_entry_exists was set before"
  );

  let enumValues = {
    [Ci.nsIGNOMEShellService.DESKTOP_ENTRY_ABSENT]: "absent",
    [Ci.nsIGNOMEShellService.DESKTOP_ENTRY_INVISIBLE]: "invisible",
    [Ci.nsIGNOMEShellService.DESKTOP_ENTRY_VISIBLE]: "visible",
    [12345]: "other",
  };
  for (let key of Object.getOwnPropertyNames(enumValues)) {
    let sandbox = sinon.createSandbox();
    let requested = [];
    sandbox.stub(ShellService, "shellService").value({
      getDesktopEntryStatus(name) {
        requested.push(name);
        return key;
      },
      getGlibPrgname() {
        return "glibprgnamehere";
      },
    });
    StartupTelemetry.desktopEntryStatus();
    Assert.deepEqual(
      requested,
      [ShellService.getGlibPrgname() + ".desktop"],
      "The g_get_prgname value is passed as the desired desktop entry"
    );
    Assert.equal(
      Glean.osEnvironment.desktopEntryExists.testGetValue(),
      enumValues[key],
      "The telemetry was set to the expected value"
    );
    sandbox.restore();
  }

  let sandbox = sinon.createSandbox();
  sandbox.stub(ShellService, "shellService").value({
    getDesktopEntryStatus(_name) {
      Assert.ok(false, "should not be reached");
      throw new Error("should not be reached");
    },
  });

  StartupTelemetry.desktopEntryStatus({ isRunningUnderFlatpak: true });
  Assert.equal(
    Glean.osEnvironment.desktopEntryExists.testGetValue(),
    "sandboxed",
    "Telemetry indicates the browser is sandboxed when running under Flatpak"
  );

  StartupTelemetry.desktopEntryStatus({ isRunningUnderSnap: true });
  Assert.equal(
    Glean.osEnvironment.desktopEntryExists.testGetValue(),
    "sandboxed",
    "Telemetry indicates the browser is sandboxed when running under Snap"
  );

  sandbox.restore();
});
