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
    // Don't receive push messages in a child process
    if (Services.appinfo.processType != Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT) {
      return;
    }

    if (!cmdLine.handleFlag("receive-push-messages", false)) {
      return;
    }

    // Don't display a window
    cmdLine.preventDefault = true;

    // Firefox is already running and receiving push messages
    if (cmdLine.state != Ci.nsICommandLine.STATE_INITIAL_LAUNCH) {
      return;
    }

    Glean.backgroundNotificationHelper.wake.add(1);

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
   * A push message arriving isn't the same as it being handled. Its service
   * worker still has to run its push event, and for a notification, call
   * showNotification(). Each message is counted as pending until its
   * push-message-handled notification arrives, and receiving doesn't stop
   * while any message is pending. The total timeout stops new messages from
   * being handled and waits for the pending ones. Their workers' own timers
   * bound how long that takes.
   *
   * Does nothing if push is disabled.
   *
   * @returns {Promise<void>} Resolves when receiving stops.
   */
  async receivePushMessages() {
    if (!(await this.ensurePushServiceReady())) {
      return;
    }

    await new Promise(resolve => {
      let receiving = true;
      let pendingMessages = 0;
      let messagesStoppedArriving = false;
      let capped = false;
      let pushTopicObserver = null;
      let pushMessageHandledTopicObserver = null;
      let notificationShownObserver = null;
      const pushTopic = lazy.PushService.pushTopic;
      const pushMessageHandledTopic = lazy.PushService.pushMessageHandledTopic;
      // Fired by nsAlertsService for every web content alert shown, private
      // browsing aside. Gated by browser.alerts.capture.enabled, a kill switch.
      const notificationShownTopic = "web-notification-shown";
      let perMessageTimer = null;
      let totalTimer = null;
      let totalMessages = 0;
      let totalNotifications = 0;

      const stopReceiving = () => {
        if (!receiving) {
          return;
        }
        receiving = false;
        Services.obs.removeObserver(pushTopicObserver, pushTopic);
        Services.obs.removeObserver(
          pushMessageHandledTopicObserver,
          pushMessageHandledTopic
        );
        Services.obs.removeObserver(
          notificationShownObserver,
          notificationShownTopic
        );
        lazy.Timer.clearTimeout(perMessageTimer);
        lazy.Timer.clearTimeout(totalTimer);
        Glean.backgroundNotificationHelper.wakeMessages.accumulateSingleSample(
          totalMessages
        );
        Glean.backgroundNotificationHelper.wakeNotifications.accumulateSingleSample(
          totalNotifications
        );
        resolve();
      };

      const stopReceivingWhenDone = () => {
        if (messagesStoppedArriving && pendingMessages == 0) {
          stopReceiving();
        }
      };

      const perMessageTimeoutMs = Services.prefs.getIntPref(
        "app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs",
        5000
      );

      const startPerMessageTimer = () => {
        messagesStoppedArriving = false;
        lazy.Timer.clearTimeout(perMessageTimer);
        perMessageTimer = lazy.Timer.setTimeout(() => {
          messagesStoppedArriving = true;
          stopReceivingWhenDone();
        }, perMessageTimeoutMs);
      };

      const totalTimeoutMs = Services.prefs.getIntPref(
        "app.backgroundNotifications.receivePushMessages.totalTimeoutMs",
        60000
      );

      const startTotalTimer = () => {
        totalTimer = lazy.Timer.setTimeout(() => {
          // New messages aren't acked, so they come back on the next connection
          lazy.PushService.wrappedJSObject.ignoreNewMessages();
          capped = true;
          messagesStoppedArriving = true;
          lazy.Timer.clearTimeout(perMessageTimer);
          stopReceivingWhenDone();
        }, totalTimeoutMs);
      };

      pushTopicObserver = () => {
        totalMessages++;
        pendingMessages++;
        if (!capped) {
          startPerMessageTimer();
        }
      };

      pushMessageHandledTopicObserver = () => {
        if (pendingMessages > 0) {
          pendingMessages--;
        }
        stopReceivingWhenDone();
      };

      notificationShownObserver = () => totalNotifications++;

      Services.obs.addObserver(pushTopicObserver, pushTopic);
      Services.obs.addObserver(
        pushMessageHandledTopicObserver,
        pushMessageHandledTopic
      );
      Services.obs.addObserver(
        notificationShownObserver,
        notificationShownTopic
      );
      startPerMessageTimer();
      startTotalTimer();
    });
  }
}
