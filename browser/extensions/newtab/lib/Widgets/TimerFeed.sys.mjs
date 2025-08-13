/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
});

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";

const PREF_TIMER_ENABLED = "widgets.timer.enabled";
const PREF_SYSTEM_TIMER_ENABLED = "widgets.system.timer.enabled";
const CACHE_KEY = "timer_widget";

/**
 * Class for the Timer widget, which manages the changes to the Timer widget
 * and syncs with PersistentCache
 */
export class TimerFeed {
  constructor() {
    this.initialized = false;
    this.cache = this.PersistentCache(CACHE_KEY, true);
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
    this.update(timer, isStartup);
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
      case at.WIDGETS_TIMER_PAUSE:
      case at.WIDGETS_TIMER_RESET:
      case at.WIDGETS_TIMER_SET_DURATION:
      case at.WIDGETS_TIMER_START:
        {
          const prevState = this.store.getState().TimerWidget;
          await this.cache.set("timer", { ...prevState, ...action.data });
        }
        break;
    }
  }
}

TimerFeed.prototype.PersistentCache = (...args) => {
  return new lazy.PersistentCache(...args);
};
