/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  hasActiveWebDriverSession:
    "chrome://remote/content/shared/webdriver/Session.sys.mjs",
  Marionette: "chrome://remote/content/components/Marionette.sys.mjs",
  RemoteAgent: "chrome://remote/content/components/RemoteAgent.sys.mjs",
});

const FIREFOX_DEVTOOLS_MCP_ROOT = ".firefox-devtools-mcp";

const OBSERVER_TOPICS = [
  "marionette-listening",
  "remote-listening",
  "webdriver-session-changed",
];

/**
 * Wrapper around the Marionette and Remote Agent components for the UI which
 * starts and stops them dynamically, ie. not for browser automation.
 *
 * All the code interacting with those components lives here, so that the whole
 * dependency can be replaced at runtime, see setRemoteControlServers.
 */
class RemoteControlServersImpl {
  #listeners;

  constructor() {
    this.#listeners = new Set();
  }

  /**
   * True if either server is enabled, which happens as soon as the command line
   * flags are handled, and before the servers are actually listening.
   */
  get enabled() {
    return (
      AppConstants.ENABLE_WEBDRIVER &&
      (lazy.RemoteAgent.enabled || lazy.Marionette.enabled)
    );
  }

  /**
   * True if a remote application is currently connected to this browser
   * instance.
   */
  get hasActiveSession() {
    return AppConstants.ENABLE_WEBDRIVER && lazy.hasActiveWebDriverSession();
  }

  /**
   * True if either server is running after a dynamic start, ie. not for browser
   * automation.
   */
  get runningDynamically() {
    return (
      AppConstants.ENABLE_WEBDRIVER &&
      (lazy.RemoteAgent.isDynamicStartRunning ||
        lazy.Marionette.isDynamicStartRunning)
    );
  }

  /**
   * Register a listener called whenever the state of the servers or of the
   * WebDriver sessions changed.
   *
   * @param {Function} listener
   *     Function called without any argument after each state change.
   */
  addListener(listener) {
    if (!this.#listeners.size) {
      for (const topic of OBSERVER_TOPICS) {
        Services.obs.addObserver(this, topic);
      }
    }

    this.#listeners.add(listener);
  }

  /**
   * Unregister a listener previously added via addListener.
   *
   * @param {Function} listener
   *     The listener to remove.
   */
  removeListener(listener) {
    if (!this.#listeners.delete(listener)) {
      return;
    }

    if (!this.#listeners.size) {
      for (const topic of OBSERVER_TOPICS) {
        Services.obs.removeObserver(this, topic);
      }
    }
  }

  observe() {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /**
   * Specifically for firefox-devtools-mcp usage, prepare the folder where
   * Marionette is expected to write the port.
   * Typically should live at ~/.firefox-devtools-mcp/instances
   *
   * @returns {string|null}
   *     The path of the port file, or null if the folder could not be created.
   */
  async #createPortFilePath() {
    const folder = PathUtils.join(
      Services.dirsvc.get("Home", Ci.nsIFile).path,
      FIREFOX_DEVTOOLS_MCP_ROOT,
      "instances"
    );

    try {
      await IOUtils.makeDirectory(folder, {
        createAncestors: true,
        permissions: 0o700,
      });
    } catch (e) {
      console.error(`Failed to create ${folder}:`, e);
      return null;
    }

    return PathUtils.join(folder, `${Services.appinfo.processID}.port`);
  }

  /**
   * Start both servers dynamically.
   */
  async start() {
    if (!AppConstants.ENABLE_WEBDRIVER) {
      return;
    }

    await lazy.RemoteAgent.startAtRuntime({ isBrowserAutomation: false });
    await lazy.Marionette.startAtRuntime({
      isBrowserAutomation: false,
      portFilePath: await this.#createPortFilePath(),
    });
  }

  /**
   * Stop the servers which were started dynamically, which also terminates any
   * WebDriver session currently connected to them.
   */
  async stop() {
    if (!AppConstants.ENABLE_WEBDRIVER) {
      return;
    }

    if (lazy.Marionette.isDynamicStartRunning) {
      await lazy.Marionette.stopAtRuntime();
    }
    if (lazy.RemoteAgent.isDynamicStartRunning) {
      await lazy.RemoteAgent.stopAtRuntime();
    }
  }

  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);
}

let servers = new RemoteControlServersImpl();

/**
 * Replace the implementation backing RemoteControlServers. Test only.
 *
 * @param {object=} impl
 *     The implementation to use, or null to restore the one backed by the
 *     Marionette and Remote Agent components.
 */
export function setRemoteControlServers(impl) {
  if (!Cu.isInAutomation) {
    throw new Error("setRemoteControlServers is only available in tests");
  }

  servers = impl ?? new RemoteControlServersImpl();
}

export const RemoteControlServers = {
  get enabled() {
    return servers.enabled;
  },

  get hasActiveSession() {
    return servers.hasActiveSession;
  },

  get runningDynamically() {
    return servers.runningDynamically;
  },

  addListener: listener => servers.addListener(listener),
  removeListener: listener => servers.removeListener(listener),
  start: () => servers.start(),
  stop: () => servers.stop(),
};
