/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EveryWindow: "resource:///modules/EveryWindow.sys.mjs",
  hasActiveWebDriverSession:
    "chrome://remote/content/shared/webdriver/Session.sys.mjs",
  RemoteControlServers:
    "moz-src:///browser/components/remotecontrol/RemoteControlServers.sys.mjs",
});

const DYNAMIC_START_ID = "remote-control-dynamic-start";
const CONNECTED_ID = "remote-control-connected";
const STOPPED_ID = "remote-control-stopped";

// Overall feature preference for Marionette / Remote Agent dynamic servers.
const PREF_DYNAMIC_START_ENABLED = "remote.experimental.dynamicstart.enabled";

// Banner-specific preferences, each "banner" can be enabled independently.
const PREF_BANNER_ENABLED = "remote.experimental.dynamicstart.banner.enabled";
const PREF_CONNECTION_BANNER_ENABLED =
  "remote.experimental.dynamicstart.connectionbanner.enabled";

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "dynamicStartBannerEnabled",
  PREF_BANNER_ENABLED,
  true,
  () => RemoteControlBanner.onBannerPrefChanged()
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "connectionBannerEnabled",
  PREF_CONNECTION_BANNER_ENABLED,
  true,
  () => RemoteControlBanner.onBannerPrefChanged()
);

const BANNER_STATES = {
  // No banner should be displayed.
  NONE: "none",
  // The servers are running, but no application is connected yet.
  // If enabled, the dynamic start banner should be displayed.
  RUNNING: "running",
  // An application is connected and controlling the browser.
  // If enabled, the connection banner should be displayed.
  CONNECTED: "connected",
  // The servers were stopped from one of the banner buttons.
  STOPPED: "stopped",
};

const STOPPED_STATES = {
  // Servers turned off.
  STOPPED: "stopped",
  // Servers turned off and PREF_DYNAMIC_START_ENABLED is flipped to false.
  DISABLED: "disabled",
};

/**
 * Shows a banner that reflects the state of dynamically started Marionette and
 * Remote Agent servers. The banner will show different content depending on the
 * servers and sessions state, as well as depending on the profile preferences.
 */
class RemoteControlBannerClass {
  #initialized;
  #state;
  #stoppedState;
  #stopping;

  constructor() {
    this.#initialized = false;
    this.#state = BANNER_STATES.NONE;

    this.#stoppedState = null;
    // Temporary flag needed to avoid incorrectly resetting the stoppedState
    // during server shutdown.
    this.#stopping = false;
  }

  init() {
    if (this.#initialized) {
      return;
    }
    this.#initialized = true;

    Services.obs.addObserver(this, "remote-listening");
    Services.obs.addObserver(this, "webdriver-session-changed");
  }

  observe() {
    this.#update();
  }

  /**
   * Called when one of the preferences for the banners is flipped, so that
   * a banner can be displayed or removed without waiting for the state of the
   * servers to change.
   */
  onBannerPrefChanged() {
    if (!this.#initialized) {
      return;
    }
    this.#update();
  }

  uninit() {
    if (!this.#initialized) {
      return;
    }
    this.#initialized = false;

    Services.obs.removeObserver(this, "remote-listening");
    Services.obs.removeObserver(this, "webdriver-session-changed");

    this.#hide(DYNAMIC_START_ID);
    this.#hide(CONNECTED_ID);
    this.#state = BANNER_STATES.NONE;
  }

  #addNotification(win, id) {
    const notificationBox = win.gNotificationBox;
    const stopped = this.#state === BANNER_STATES.STOPPED;

    // Remove any existing banner before recreating it for the current state.
    this.#removeNotification(win, id);

    notificationBox.appendNotification(
      id,
      {
        label: { "l10n-id": this.#getMessageId() },
        priority: stopped
          ? notificationBox.PRIORITY_INFO_HIGH
          : notificationBox.PRIORITY_WARNING_HIGH,
        eventCallback: event => {
          if (event == "dismissed") {
            // Dismiss in all windows simultaneously.
            this.#hide(id);
          }
        },
      },
      stopped ? [] : this.#getButtons()
    );
  }

  #getButtons() {
    // Note: the callbacks for all buttons to turn off / disable the servers
    // return "true" because the banner should not be dismissed immediately.
    // The banner will now be in the stopped state and will be a confirmation
    // to the user that their action was performed.
    if (this.#state === BANNER_STATES.CONNECTED) {
      return [
        {
          "l10n-id": "remote-control-connected-banner-disconnect-button",
          callback: () => {
            this.#stopServers();
            return true;
          },
        },
      ];
    }

    return [
      {
        "l10n-id": "remote-control-dynamic-start-banner-stop-button",
        callback: () => {
          this.#stopServers();
          return true;
        },
      },
      {
        "l10n-id": "remote-control-dynamic-start-banner-disable-button",
        callback: () => {
          this.#stopServers({ permanently: true });
          return true;
        },
      },
    ];
  }

  #getMessageId() {
    switch (this.#state) {
      case BANNER_STATES.CONNECTED:
        return "remote-control-connected-banner-message";
      case BANNER_STATES.RUNNING:
        return "remote-control-dynamic-start-banner-message";
      case BANNER_STATES.STOPPED:
        return this.#stoppedState === STOPPED_STATES.DISABLED
          ? "remote-control-dynamic-start-banner-disabled-message"
          : "remote-control-dynamic-start-banner-stopped-message";
      default:
        throw new Error(`Unexpected state for getMessageId: "${this.#state}"`);
    }
  }

  #getNotification(win, id) {
    return win.gNotificationBox.getNotificationWithValue(id);
  }

  #getState() {
    // If we reached a stop state, the stop confirmation should be displayed
    // regardless of the server state and of any preference value.
    if (this.#stoppedState) {
      return BANNER_STATES.STOPPED;
    }

    // No dynamic server is running, no banner to display.
    if (!lazy.RemoteControlServers.runningDynamically) {
      return BANNER_STATES.NONE;
    }

    // When a connection is established, show the connection banner if enabled.
    if (lazy.connectionBannerEnabled && lazy.hasActiveWebDriverSession()) {
      return BANNER_STATES.CONNECTED;
    }

    // Otherwise, show the dynamic server banner if enabled.
    if (lazy.dynamicStartBannerEnabled) {
      return BANNER_STATES.RUNNING;
    }

    return BANNER_STATES.NONE;
  }

  #hide(id) {
    lazy.EveryWindow.unregisterCallback(id);

    // The confirmation message is displayed without registering a callback on
    // EveryWindow, so it also has to be removed explicitly.
    for (const win of lazy.EveryWindow.readyWindows) {
      this.#removeNotification(win, id);
    }
  }

  #removeNotification(win, id) {
    const notification = this.#getNotification(win, id);
    if (notification) {
      win.gNotificationBox.removeNotification(notification);
    }
  }

  #show(id) {
    lazy.EveryWindow.registerCallback(
      id,
      win => this.#addNotification(win, id),
      win => this.#removeNotification(win, id)
    );
  }

  /**
   * Replace the banners currently displayed with a confirmation message when
   * the servers are stopped.
   */
  #showStoppedConfirmation() {
    const windows = lazy.EveryWindow.readyWindows.filter(
      win =>
        this.#getNotification(win, DYNAMIC_START_ID) ||
        this.#getNotification(win, CONNECTED_ID)
    );

    this.#hide(DYNAMIC_START_ID);
    this.#hide(CONNECTED_ID);

    for (const win of windows) {
      this.#addNotification(win, STOPPED_ID);
    }
  }

  /**
   * Stop the servers which were started dynamically, which also terminates any
   * WebDriver session currently connected to them.
   *
   * @param {object=} options
   * @param {boolean=} options.permanently
   *     If true, flips the preference to dynamically start servers to false.
   *     Defaults to false.
   */
  async #stopServers({ permanently = false } = {}) {
    if (this.#stopping) {
      return;
    }
    this.#stopping = true;

    // Update the stoppedState before shutting down the servers, which will
    // synchronously update the banner.
    // A different message is displayed if the user permanently disabled the
    // feature or not.
    this.#stoppedState = permanently
      ? STOPPED_STATES.DISABLED
      : STOPPED_STATES.STOPPED;

    if (permanently) {
      // Flip the preference before stopping the servers, so that the state of
      // the feature always matches the message displayed to the user, even if
      // stopping the servers fails.
      Services.prefs.setBoolPref(PREF_DYNAMIC_START_ENABLED, false);
    }

    try {
      await lazy.RemoteControlServers.stop();
    } catch (e) {
      console.error("Failed to stop the remote debugging servers:", e);
      this.#stoppedState = null;
    }

    this.#stopping = false;
    this.#update();
  }

  #update() {
    if (lazy.RemoteControlServers.runningDynamically && !this.#stopping) {
      // While #stopServers is in progress servers may still be reported as
      // running, so skip the reset.
      this.#stoppedState = null;
    }

    const state = this.#getState();
    if (state === this.#state) {
      return;
    }
    this.#state = state;

    switch (state) {
      case BANNER_STATES.CONNECTED:
        this.#hide(DYNAMIC_START_ID);
        this.#hide(STOPPED_ID);
        this.#show(CONNECTED_ID);
        break;
      case BANNER_STATES.RUNNING:
        this.#hide(CONNECTED_ID);
        this.#hide(STOPPED_ID);
        this.#show(DYNAMIC_START_ID);
        break;
      case BANNER_STATES.STOPPED:
        this.#showStoppedConfirmation();
        break;
      case BANNER_STATES.NONE:
        this.#hide(DYNAMIC_START_ID);
        this.#hide(CONNECTED_ID);
        this.#hide(STOPPED_ID);
    }
  }

  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);
}

export const RemoteControlBanner = new RemoteControlBannerClass();
