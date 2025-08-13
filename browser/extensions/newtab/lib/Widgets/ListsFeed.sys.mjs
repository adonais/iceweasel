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

const PREF_LISTS_ENABLED = "widgets.lists.enabled";
const PREF_SYSTEM_LISTS_ENABLED = "widgets.system.lists.enabled";
const CACHE_KEY = "lists_widget";

/**
 * Class for the Lists widget, which manages the updates to the lists widget
 * and syncs with PersistentCache
 */
export class ListsFeed {
  constructor() {
    this.initialized = false;
    this.cache = this.PersistentCache(CACHE_KEY, true);
  }

  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    return prefs?.[PREF_LISTS_ENABLED] && prefs?.[PREF_SYSTEM_LISTS_ENABLED];
  }

  async init() {
    this.initialized = true;
    await this.syncLists(true);
  }

  async syncLists(isStartup = false) {
    const cachedData = (await this.cache.get()) || {};
    const { lists } = cachedData;
    // only update lists if this has been set before
    if (lists) {
      this.update(lists, isStartup);
    }
  }

  update(data, isStartup = false) {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_LISTS_SET,
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
          (action.data.name === PREF_LISTS_ENABLED ||
            action.data.name === PREF_SYSTEM_LISTS_ENABLED) &&
          action.data.value
        ) {
          if (this.enabled) {
            await this.init();
          }
        }
        break;
      case at.WIDGETS_LISTS_UPDATE:
        await this.cache.set("lists", action.data);
        this.update(action.data);
        break;
    }
  }
}

ListsFeed.prototype.PersistentCache = (...args) => {
  return new lazy.PersistentCache(...args);
};
