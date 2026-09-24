/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "PushService",
  "@mozilla.org/push/Service;1",
  Ci.nsIPushService
);

ChromeUtils.defineLazyGetter(lazy, "Timer", () =>
  ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs")
);

/**
 * Command-line handler for the --receive-push-messages argument.
 */
export class CommandLineHandler {
  static classID = Components.ID("{10fc3d88-c2b2-4e3f-85e2-13dc355d0257}");
  static contractID = "@mozilla.org/push/receive-push-messages-clh;1";

  QueryInterface = ChromeUtils.generateQI([Ci.nsICommandLineHandler]);

  /**
   * Handle the --receive-push-messages argument, which opens Firefox without a
   * window, receives any pending push messages, and then exits.
   *
   * @param {nsICommandLine} cmdLine The command line to handle.
   */
  handle(cmdLine) {
    if (!cmdLine.handleFlag("receive-push-messages", false)) {
      return;
    }

    // Don't display a window
    cmdLine.preventDefault = true;

    // Firefox is already running and receiving push messages
    if (cmdLine.state != Ci.nsICommandLine.STATE_INITIAL_LAUNCH) {
      return;
    }

    // Keep Firefox alive while receiving push messages
    Services.startup.enterLastWindowClosingSurvivalArea();

    this.receivePushMessages()
      .catch(e => {
        console.error("Error receiving push messages:", e);
      })
      .finally(() => {
        Services.startup.exitLastWindowClosingSurvivalArea();
      });
  }

  /**
   * Ensure the Push Service is ready.
   *
   * @returns {Promise<boolean>} Resolves to true if the Push Service is ready.
   */
  async ensurePushServiceReady() {
    try {
      await lazy.PushService.wrappedJSObject.ensureReady();
    } catch (e) {
      if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
        throw e;
      }
      return false;
    }

    return true;
  }

  /**
   * Receive push messages.
   *
   * Nothing tells us how many push messages are pending, so we cannot wait for
   * the last one. Instead we listen and stop once they stop arriving.
   *
   * The per message timeout restarts on every push message, so a steady
   * stream keeps receiving. The total timeout never restarts, so a stream that
   * never ends cannot keep Firefox alive forever. Both come from prefs under
   * app.backgroundNotifications.receivePushMessages.
   *
   * Does nothing if push is disabled.
   *
   * TODO: A push message arriving isn't the same as its service worker having
   * finished processing it. Ideally, we'd wait until the service worker is
   * triggered and its event resolves. We can't do that yet (Bug 2068913), so
   * this can still shut down before a service worker has responded properly.
   *
   * @returns {Promise<void>} Resolves when receiving stops.
   */
  async receivePushMessages() {
    if (!(await this.ensurePushServiceReady())) {
      return;
    }

    await new Promise(resolve => {
      let receiving = true;
      let pushTopicObserver = null;
      const pushTopic = lazy.PushService.pushTopic;
      let perMessageTimer = null;
      let totalTimer = null;

      const stopReceiving = () => {
        if (!receiving) {
          return;
        }
        receiving = false;
        Services.obs.removeObserver(pushTopicObserver, pushTopic);
        lazy.Timer.clearTimeout(perMessageTimer);
        lazy.Timer.clearTimeout(totalTimer);
        resolve();
      };

      const perMessageTimeoutMs = Services.prefs.getIntPref(
        "app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs",
        5000
      );

      const startPerMessageTimer = () => {
        lazy.Timer.clearTimeout(perMessageTimer);
        perMessageTimer = lazy.Timer.setTimeout(
          stopReceiving,
          perMessageTimeoutMs
        );
      };

      const totalTimeoutMs = Services.prefs.getIntPref(
        "app.backgroundNotifications.receivePushMessages.totalTimeoutMs",
        60000
      );

      const startTotalTimer = () => {
        totalTimer = lazy.Timer.setTimeout(stopReceiving, totalTimeoutMs);
      };

      pushTopicObserver = () => startPerMessageTimer();

      Services.obs.addObserver(pushTopicObserver, pushTopic);
      startPerMessageTimer();
      startTotalTimer();
    });
  }
}
