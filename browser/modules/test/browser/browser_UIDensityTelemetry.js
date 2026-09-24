/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Tests the ui_density.mode event: the startup event, the events recorded when
// the user changes the "Window density" setting, and the events recorded when
// the automatic setting resolves to a different density on its own
// (Bug 2023635).

const PREF_UI_DENSITY = "browser.uidensity";
const PREF_AUTO_TOUCH_MODE = "browser.touchmode.auto";
const PREF_NOVA = "browser.nova.enabled";
const PREF_COMPACT_THRESHOLD = "browser.compactmode.auto.threshold";

// A threshold high enough that AUTO_COMPACT_REFERENCE_* / window size never
// exceeds it, and one low enough that it always does.
const THRESHOLD_NEVER_COMPACT = "10";
const THRESHOLD_ALWAYS_COMPACT = "0.0001";

const EXPECTED_TOUCH_CAPABLE = (() => {
  switch (AppConstants.platform) {
    case "macosx":
      return "no";
    case "win":
      return Cc["@mozilla.org/windows-ui-utils;1"].getService(
        Ci.nsIWindowsUIUtils
      ).isTabletCapable
        ? "yes"
        : "no";
    default:
      return "unknown";
  }
})();

function takeEvents() {
  let events = Glean.uiDensity.mode.testGetValue() ?? [];
  Services.fog.testResetFOG();
  return events.map(event => event.extra);
}

// Restarts the telemetry as if a new session had begun, and returns the
// startup event it recorded.
async function restartTelemetry() {
  UIDensityTelemetry.uninit();
  Services.fog.testResetFOG();
  await UIDensityTelemetry.init(window);
  let events = takeEvents();
  Assert.equal(events.length, 1, "Restarting records exactly one event.");
  return events[0];
}

// Runs `change`, which is expected to record exactly one event, and returns it.
function recordOne(change, message) {
  change();
  let events = takeEvents();
  Assert.equal(events.length, 1, `Exactly one event was recorded: ${message}`);
  return events[0];
}

// A stand-in for a second browser window resolving to `resolvedMode`, which
// the caller can change. UIDensityTelemetry only reads the resolved density and
// the geometry off the window it is handed.
function secondWindowStandingIn(resolvedMode) {
  let win = {
    resolvedMode,
    gUIDensity: {
      MODE_NORMAL: window.gUIDensity.MODE_NORMAL,
      MODE_COMPACT: window.gUIDensity.MODE_COMPACT,
      MODE_TOUCH: window.gUIDensity.MODE_TOUCH,
      getCurrentDensity: () => ({ mode: win.resolvedMode }),
    },
    toolbar: { visible: true },
    outerWidth: window.outerWidth + 100,
    outerHeight: window.outerHeight + 100,
    devicePixelRatio: window.devicePixelRatio,
  };
  return win;
}

function assertWindowInfo(extra, message) {
  Assert.equal(
    extra.touch_capable,
    EXPECTED_TOUCH_CAPABLE,
    `Touch capability is reported: ${message}`
  );
  Assert.equal(
    Number(extra.window_width),
    window.outerWidth,
    `Window width is reported: ${message}`
  );
  Assert.equal(
    Number(extra.window_height),
    window.outerHeight,
    `Window height is reported: ${message}`
  );
  Assert.equal(
    extra.device_pixel_ratio,
    String(window.devicePixelRatio),
    `The device pixel ratio is reported: ${message}`
  );
}

add_setup(async function () {
  let originalInTabletMode = window.gUIDensity._inTabletMode;
  // Tablet mode would override the resolved density on Windows, and CI can't
  // control it.
  window.gUIDensity._inTabletMode = () => false;

  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NOVA, true],
      [PREF_COMPACT_THRESHOLD, THRESHOLD_NEVER_COMPACT],
    ],
  });
  Services.prefs.setBoolPref(PREF_AUTO_TOUCH_MODE, false);
  Services.prefs.clearUserPref(PREF_UI_DENSITY);

  registerCleanupFunction(async () => {
    window.gUIDensity._inTabletMode = originalInTabletMode;
    Services.prefs.clearUserPref(PREF_UI_DENSITY);
    Services.prefs.clearUserPref(PREF_AUTO_TOUCH_MODE);
    await SpecialPowers.popPrefEnv();
    UIDensityTelemetry.uninit();
    await UIDensityTelemetry.init(window);
    Services.fog.testResetFOG();
  });
});

add_task(async function test_startup() {
  let extra = await restartTelemetry();

  Assert.equal(extra.current, "automatic", "The setting is automatic.");
  Assert.equal(extra.effective, "standard", "It resolved to standard.");
  Assert.equal(extra.on_startup, "true", "The event is flagged as startup.");
  Assert.ok(
    !("previous" in extra),
    "There is no previous value on the startup event."
  );
  Assert.equal(
    extra.auto_adjustments_prior,
    "0",
    "No automatic adjustments have happened yet."
  );
  assertWindowInfo(extra, "startup");
});

add_task(async function test_setting_changed() {
  await restartTelemetry();

  let extra = recordOne(
    () =>
      Services.prefs.setIntPref(
        PREF_UI_DENSITY,
        window.gUIDensity.MODE_COMPACT
      ),
    "compact was chosen"
  );
  Assert.equal(extra.current, "compact", "The setting is compact.");
  Assert.equal(extra.effective, "compact", "It resolved to compact.");
  Assert.equal(extra.previous, "automatic", "The previous setting is given.");
  Assert.equal(extra.on_startup, "false", "This isn't the startup event.");
  Assert.equal(extra.auto_adjustments_prior, "0", "Nothing adjusted itself.");
  assertWindowInfo(extra, "setting changed");

  extra = recordOne(
    () =>
      Services.prefs.setIntPref(PREF_UI_DENSITY, window.gUIDensity.MODE_TOUCH),
    "touch was chosen"
  );
  Assert.equal(extra.current, "touch", "The setting is touch.");
  Assert.equal(extra.effective, "touch", "It resolved to touch.");
  Assert.equal(extra.previous, "compact", "The previous setting is given.");

  extra = recordOne(
    () => Services.prefs.clearUserPref(PREF_UI_DENSITY),
    "automatic was chosen again"
  );
  Assert.equal(extra.current, "automatic", "The setting is automatic again.");
  Assert.equal(extra.effective, "standard", "It resolved to standard.");
  Assert.equal(extra.previous, "touch", "The previous setting is given.");
});

add_task(async function test_auto_touch_mode_is_part_of_the_setting() {
  Services.prefs.setIntPref(PREF_UI_DENSITY, window.gUIDensity.MODE_NORMAL);
  let extra = await restartTelemetry();
  Assert.equal(extra.current, "standard", "The setting is standard.");

  extra = recordOne(
    () => Services.prefs.setBoolPref(PREF_AUTO_TOUCH_MODE, true),
    "touch spacing for tablet mode was enabled"
  );
  Assert.equal(
    extra.current,
    "standard_and_touch_for_tablet_mode",
    "Enabling touch spacing for tablet mode is a distinct setting."
  );
  Assert.equal(
    extra.effective,
    "standard",
    "The resolved density is unchanged outside of tablet mode."
  );
  Assert.equal(extra.previous, "standard", "The previous setting is given.");

  extra = recordOne(
    () => Services.prefs.setBoolPref(PREF_AUTO_TOUCH_MODE, false),
    "touch spacing for tablet mode was disabled"
  );
  Assert.equal(extra.current, "standard", "The setting is standard again.");
  Assert.equal(
    extra.previous,
    "standard_and_touch_for_tablet_mode",
    "The previous setting is given."
  );

  Services.prefs.clearUserPref(PREF_UI_DENSITY);
});

add_task(async function test_automatic_adjustments() {
  Services.prefs.clearUserPref(PREF_UI_DENSITY);
  Services.prefs.setCharPref(PREF_COMPACT_THRESHOLD, THRESHOLD_NEVER_COMPACT);
  await restartTelemetry();

  let extra = recordOne(
    () =>
      Services.prefs.setCharPref(
        PREF_COMPACT_THRESHOLD,
        THRESHOLD_ALWAYS_COMPACT
      ),
    "the window became small enough for compact"
  );
  Assert.equal(extra.current, "automatic", "The setting didn't change.");
  Assert.equal(extra.effective, "compact", "It now resolves to compact.");
  Assert.ok(
    !("previous" in extra),
    "There is no previous value when only the resolved density changed."
  );
  Assert.equal(
    extra.auto_adjustments_prior,
    "0",
    "This is the first automatic adjustment of the session."
  );

  extra = recordOne(
    () =>
      Services.prefs.setCharPref(
        PREF_COMPACT_THRESHOLD,
        THRESHOLD_NEVER_COMPACT
      ),
    "the window is no longer small enough for compact"
  );
  Assert.equal(extra.effective, "standard", "It resolves to standard again.");
  Assert.equal(
    extra.auto_adjustments_prior,
    "1",
    "One automatic adjustment happened before this one."
  );

  extra = recordOne(
    () =>
      Services.prefs.setIntPref(
        PREF_UI_DENSITY,
        window.gUIDensity.MODE_COMPACT
      ),
    "compact was chosen after two automatic adjustments"
  );
  Assert.equal(
    extra.auto_adjustments_prior,
    "2",
    "The user saw two automatic adjustments before changing the setting."
  );

  extra = recordOne(
    () =>
      Services.prefs.setIntPref(PREF_UI_DENSITY, window.gUIDensity.MODE_TOUCH),
    "touch was chosen"
  );
  Assert.equal(
    extra.auto_adjustments_prior,
    "0",
    "The counter reset when the setting changed."
  );

  Services.prefs.clearUserPref(PREF_UI_DENSITY);
});

// The resolved density belongs to a window, so a window that becomes the top
// window must be compared against its own history: another window having last
// reported the same density must not swallow its changes.
add_task(async function test_effective_density_is_tracked_per_window() {
  Services.prefs.clearUserPref(PREF_UI_DENSITY);
  Services.prefs.setCharPref(PREF_COMPACT_THRESHOLD, THRESHOLD_ALWAYS_COMPACT);
  let extra = await restartTelemetry();
  Assert.equal(extra.effective, "compact", "This window resolved to compact.");

  // A second window, large enough that "Automatic" resolves to standard for
  // it. A real one can't be used here: this file sets browser.nova.enabled,
  // and LightweightThemeConsumer keeps a pref observer on it that throws once
  // the window it belongs to has been closed.
  let secondWindow = secondWindowStandingIn(window.gUIDensity.MODE_NORMAL);
  await UIDensityTelemetry.init(secondWindow);
  Assert.deepEqual(
    takeEvents(),
    [],
    "Nothing is recorded for a window that only starts being tracked."
  );

  let originalGetTopWindow = BrowserWindowTracker.getTopWindow;
  BrowserWindowTracker.getTopWindow = () => secondWindow;
  try {
    secondWindow.resolvedMode = window.gUIDensity.MODE_COMPACT;
    extra = recordOne(
      () => UIDensityTelemetry.onDensityChanged(secondWindow),
      "the second window resolved to compact too"
    );

    UIDensityTelemetry.onDensityChanged(secondWindow);
    Assert.deepEqual(
      takeEvents(),
      [],
      "Nothing is recorded while the second window's density is unchanged."
    );
  } finally {
    BrowserWindowTracker.getTopWindow = originalGetTopWindow;
  }

  Assert.equal(extra.current, "automatic", "The setting didn't change.");
  Assert.equal(extra.effective, "compact", "It resolves to compact.");
  Assert.equal(
    Number(extra.window_width),
    secondWindow.outerWidth,
    "The event describes the second window."
  );
  Assert.equal(
    extra.auto_adjustments_prior,
    "0",
    "This is the first automatic adjustment of the session."
  );

  Services.prefs.setCharPref(PREF_COMPACT_THRESHOLD, THRESHOLD_NEVER_COMPACT);
});

// The reported ratio must follow the UI scale, not the physical density of the
// display, which nsIDOMWindowUtils.displayDPI would have reported on macOS and
// Linux.
add_task(async function test_device_pixel_ratio_tracks_ui_scale() {
  Services.prefs.clearUserPref(PREF_UI_DENSITY);
  await SpecialPowers.pushPrefEnv({
    set: [["layout.css.devPixelsPerPx", "2.0"]],
  });
  Assert.equal(window.devicePixelRatio, 2, "The window is scaled 2x.");

  let extra = await restartTelemetry();
  Assert.equal(extra.device_pixel_ratio, "2", "2x scaling is reported as 2.");

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_no_event_without_a_change() {
  Services.prefs.clearUserPref(PREF_UI_DENSITY);
  await restartTelemetry();

  Services.prefs.setCharPref(PREF_COMPACT_THRESHOLD, THRESHOLD_NEVER_COMPACT);
  window.gUIDensity.update();
  Assert.deepEqual(
    takeEvents(),
    [],
    "Nothing is recorded while neither the setting nor the resolved density changes."
  );
});
