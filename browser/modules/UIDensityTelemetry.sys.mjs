/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "WindowsUIUtils", () =>
  Cc["@mozilla.org/windows-ui-utils;1"].getService(Ci.nsIWindowsUIUtils)
);

const PREF_UI_DENSITY = "browser.uidensity";
const PREF_AUTO_TOUCH_MODE = "browser.touchmode.auto";
const PREF_NOVA_ENABLED = "browser.nova.enabled";

/**
 * The "Window density" setting as it is presented in about:preferences and on
 * the Customize page.
 *
 * @param {Window} win
 *   The window to read the gUIDensity mode constants from.
 * @returns {string}
 */
function currentSetting(win) {
  if (
    Services.prefs.getBoolPref(PREF_NOVA_ENABLED, false) &&
    !Services.prefs.prefHasUserValue(PREF_UI_DENSITY)
  ) {
    return "automatic";
  }
  let { gUIDensity } = win;
  switch (Services.prefs.getIntPref(PREF_UI_DENSITY, gUIDensity.MODE_NORMAL)) {
    case gUIDensity.MODE_COMPACT:
      return "compact";
    case gUIDensity.MODE_TOUCH:
      return "touch";
    default:
      return Services.prefs.getBoolPref(PREF_AUTO_TOUCH_MODE, false)
        ? "standard_and_touch_for_tablet_mode"
        : "standard";
  }
}

/**
 * The density the window has resolved to, which differs from the setting
 * whenever the setting resolves automatically.
 *
 * @param {Window} win
 *   The window to resolve the density for.
 * @returns {string}
 */
function effectiveDensity(win) {
  let { gUIDensity } = win;
  switch (gUIDensity.getCurrentDensity().mode) {
    case gUIDensity.MODE_COMPACT:
      return "compact";
    case gUIDensity.MODE_TOUCH:
      return "touch";
    default:
      return "standard";
  }
}

/**
 * @returns {string} "yes", "no", or "unknown".
 */
function touchCapable() {
  switch (AppConstants.platform) {
    case "macosx":
      return "no";
    case "win":
      return lazy.WindowsUIUtils.isTabletCapable ? "yes" : "no";
    default:
      // Neither GTK nor anything else exposes a usable signal.
      return "unknown";
  }
}

/**
 * Records `ui_density.mode`, which describes both the window density the user
 * has configured and the one the browser actually resolved to.
 *
 * The setting and the automatic adjustment counter are tracked per session, so
 * this module owns the recording instead of gUIDensity, which is instantiated
 * once per browser window. The window-scoped parts of the event (the effective
 * density and the window dimensions) are read from the top browser window, so a
 * session with several windows open still records one event per change rather
 * than one per window.
 */
export const UIDensityTelemetry = {
  _initialized: false,
  /** @type {string|null} The `current` value of the last recorded event. */
  _current: null,
  /**
   * @type {WeakMap<Window, string>} The `effective` value last recorded for
   *   each window. Kept per window because the density a window resolves to
   *   depends on that window: the top window can change to one that resolved
   *   differently, and comparing a window against another window's last
   *   recorded value would swallow that window's own changes.
   */
  _lastEffective: new WeakMap(),
  /** @type {number} Automatic changes of `effective` so far this session. */
  _autoAdjustments: 0,

  /**
   * Seeds the per-window state for `win`, and, on the first call that gets a
   * window able to provide the window-scoped parts of the event, records the
   * startup event and starts watching for changes. Called from every browser
   * window's gUIDensity.init().
   *
   * @param {Window} win
   *   The browser window being initialized.
   */
  async init(win) {
    // A window has to be seeded before it can report a change, so that its
    // first gUIDensity notification isn't mistaken for one: customize mode
    // notifies for every density it previews, without the density the window
    // resolves to ever changing.
    this._lastEffective.set(win, effectiveDensity(win));

    // Popups and taskbar tabs have no density controls and are excluded from
    // BrowserWindowTracker.getTopWindow(), so they can't provide the
    // window-scoped parts of the event.
    if (this._initialized || !win.toolbar.visible) {
      return;
    }

    await lazy.SessionStore.promiseAllWindowsRestored;
    if (this._initialized || win != lazy.BrowserWindowTracker.getTopWindow()) {
      return;
    }
    this._initialized = true;

    Services.prefs.addObserver(PREF_UI_DENSITY, this);
    Services.prefs.addObserver(PREF_AUTO_TOUCH_MODE, this);

    this._record(win, true);
  },

  /**
   * Stops recording and clears the session state, so that a following init()
   * behaves like a fresh session. Only used by tests: in a real session the
   * observers live for as long as the application does.
   */
  uninit() {
    if (!this._initialized) {
      return;
    }
    this._initialized = false;
    this._current = null;
    this._lastEffective = new WeakMap();
    this._autoAdjustments = 0;
    Services.prefs.removeObserver(PREF_UI_DENSITY, this);
    Services.prefs.removeObserver(PREF_AUTO_TOUCH_MODE, this);
  },

  observe() {
    let win = lazy.BrowserWindowTracker.getTopWindow();
    if (win) {
      this._record(win, false);
    }
  },

  /**
   * Called by gUIDensity when a window starts applying a different density,
   * which under the automatic setting can happen without the user touching
   * anything (a resize, tablet mode, the sidebar launcher expanding, ...).
   *
   * @param {Window} win
   *   The window whose density changed.
   */
  onDensityChanged(win) {
    if (!this._initialized || win != lazy.BrowserWindowTracker.getTopWindow()) {
      return;
    }
    this._record(win, false);
  },

  /**
   * Records the event, unless nothing that the event describes has changed.
   *
   * @param {Window} win
   *   The window to read the window-scoped parts of the event from.
   * @param {boolean} onStartup
   *   Whether this is the once-per-session startup event.
   */
  _record(win, onStartup) {
    let current = currentSetting(win);
    let effective = effectiveDensity(win);

    if (
      !onStartup &&
      current == this._current &&
      effective == this._lastEffective.get(win)
    ) {
      return;
    }
    // A setting change is reported both by the pref observer and by
    // gUIDensity, so whichever arrives first records it and the other bails
    // out above.
    let settingChanged = !onStartup && current != this._current;

    let extra = {
      current,
      effective,
      auto_adjustments_prior: this._autoAdjustments,
      touch_capable: touchCapable(),
      window_width: win.outerWidth,
      window_height: win.outerHeight,
      // The UI scale, not nsIDOMWindowUtils.displayDPI: that reports the scale
      // factor on Windows but the display's physical DPI on macOS and Linux.
      device_pixel_ratio: String(win.devicePixelRatio),
      on_startup: onStartup,
    };
    if (settingChanged && this._current) {
      extra.previous = this._current;
    }

    if (settingChanged) {
      this._autoAdjustments = 0;
    } else if (!onStartup) {
      this._autoAdjustments++;
    }
    this._current = current;
    this._lastEffective.set(win, effective);

    Glean.uiDensity.mode.record(extra);
  },
};
