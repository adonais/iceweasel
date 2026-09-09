/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Marionette: "chrome://remote/content/components/Marionette.sys.mjs",
  RemoteAgent: "chrome://remote/content/components/RemoteAgent.sys.mjs",
});

/**
 * Helpers shared by the UI which starts and stops the Marionette and Remote
 * Agent servers dynamically, ie. not for browser automation.
 */
export const RemoteControlServers = {
  /**
   * True if either server is enabled, which happens as soon as the command line
   * flags are handled, and before the servers are actually listening.
   */
  get enabled() {
    return (
      AppConstants.ENABLE_WEBDRIVER &&
      (lazy.RemoteAgent.enabled || lazy.Marionette.enabled)
    );
  },

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
  },

  /**
   * Start both servers dynamically.
   *
   * @param {object=} options
   * @param {string=} options.portFilePath
   *     Path of a file where the Marionette port should be written once the
   *     server is listening. Defaults to null, in which case no file is
   *     written.
   */
  async start({ portFilePath = null } = {}) {
    if (!AppConstants.ENABLE_WEBDRIVER) {
      return;
    }

    await lazy.RemoteAgent.startAtRuntime({ isBrowserAutomation: false });
    await lazy.Marionette.startAtRuntime({
      isBrowserAutomation: false,
      portFilePath,
    });
  },

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
  },
};
