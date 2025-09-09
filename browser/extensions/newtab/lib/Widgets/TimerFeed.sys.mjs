/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "gNewTabStrings", () => {
  return new Localization(["browser/newtab/newtab.ftl"], true);
});

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";

const PREF_TIMER_ENABLED = "widgets.timer.enabled";
const PREF_SYSTEM_TIMER_ENABLED = "widgets.system.timer.enabled";
const PREF_TIMER_SHOW_NOTIFICATIONS =
  "widgets.focusTimer.showSystemNotifications";
const CACHE_KEY = "timer_widget";

/**
 * Class for the Timer widget, which manages the changes to the Timer widget
 * and syncs with PersistentCache
 */
export class TimerFeed {
  constructor() {
    this.initialized = false;
    this.cache = this.PersistentCache(CACHE_KEY, true);
    this.notifiedThisCycle = false;
  }

  resetNotificationFlag() {
    this.notifiedThisCycle = false;
  }

  async showSystemNotification(title, body) {
    const prefs = this.store.getState()?.Prefs.values;

    if (!prefs[PREF_TIMER_SHOW_NOTIFICATIONS]) {
      return;
    }

    try {
      const alertsService = Cc["@mozilla.org/alerts-service;1"].getService(
        Ci.nsIAlertsService
      );

      // TODO: Add more readable args as defined in toolkit/components/alerts/nsIAlertsService.idl
      alertsService.showAlertNotification(
        "chrome://branding/content/icon64.png",
        title,
        body,
        false,
        "",
        null
      );
    } catch (err) {
      console.error("Failed to show system notification", err);
    }
  }

  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    return prefs?.[PREF_TIMER_ENABLED] && prefs?.[PREF_SYSTEM_TIMER_ENABLED];
  }

  async init() {
    this.initialized = true;
    await this.syncTimer(true);
  }

  async syncTimer(isStartup = false) {
    const cachedData = (await this.cache.get()) || {};
    const { timer } = cachedData;
    if (timer) {
      this.update(timer, isStartup);
    }
  }

  update(data, isStartup = false) {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_TIMER_SET,
        data,
        meta: isStartup,
      })
    );
  }

  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        if (this.enabled) {
          await this.init();
        }
        break;
      case at.PREF_CHANGED:
        if (
          (action.data.name === PREF_TIMER_ENABLED ||
            action.data.name === PREF_SYSTEM_TIMER_ENABLED) &&
          action.data.value
        ) {
          if (this.enabled) {
            await this.init();
          }
        }
        break;
      case at.WIDGETS_TIMER_END:
        {
          const prevState = this.store.getState().TimerWidget;
          await this.cache.set("timer", { ...prevState, ...action.data });
          this.update({ ...prevState, ...action.data });
          const { timerType } = action.data;

          const l10nId =
            timerType === "break"
              ? "newtab-widget-timer-notification-break"
              : "newtab-widget-timer-notification-focus";
          const [titleMessage, bodyMessage] =
            await lazy.gNewTabStrings.formatMessages([
              { id: "newtab-widget-timer-notification-title" },
              { id: l10nId },
            ]);
          const title = titleMessage?.value || "Timer";
          const body = bodyMessage?.value || "Timer ended";

          if (!this.notifiedThisCycle) {
            this.notifiedThisCycle = true;
            this.showSystemNotification(title, body);
          }
        }
        break;
      case at.WIDGETS_TIMER_SET_TYPE:
      case at.WIDGETS_TIMER_SET_DURATION:
      case at.WIDGETS_TIMER_PAUSE:
      case at.WIDGETS_TIMER_PLAY:
        {
          this.resetNotificationFlag();
          const prevState = this.store.getState().TimerWidget;
          await this.cache.set("timer", { ...prevState, ...action.data });
          this.update({ ...prevState, ...action.data });
        }
        break;
      case at.WIDGETS_TIMER_RESET:
        {
          this.resetNotificationFlag();
          const prevState = this.store.getState().TimerWidget;
          await this.cache.set("timer", { ...prevState, ...action.data });
          this.update({ ...prevState, ...action.data });
        }
        break;
    }
  }
}

TimerFeed.prototype.PersistentCache = (...args) => {
  return new lazy.PersistentCache(...args);
};
