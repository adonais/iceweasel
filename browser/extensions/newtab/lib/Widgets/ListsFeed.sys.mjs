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
const PREF_WIDGETS_LISTS_MAX_LISTS = "widgets.lists.maxLists";
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

  isOverMaximumListCount(lists) {
    const prefs = this.store.getState()?.Prefs.values;
    const maxListsCount = prefs?.[PREF_WIDGETS_LISTS_MAX_LISTS];
    const currentListsCount = Object.keys(lists).length;
    return currentListsCount > maxListsCount;
  }

  async syncLists(isStartup = false) {
    const cachedData = (await this.cache.get()) || {};
    const { lists, selected } = cachedData;
    // only update lists if this has been set before
    if (lists) {
      // Ensure all lists have a `completed` array
      for (const listId in lists) {
        if (lists[listId]) {
          const list = lists[listId];
          if (!Array.isArray(list.completed)) {
            list.completed = [];
          }
          // move any completed tasks to the completed array
          const activeTasks = [];
          const completedTasks = [];
          for (const task of list.tasks) {
            if (task.completed === true) {
              completedTasks.push(task);
            } else {
              activeTasks.push(task);
            }
          }

          list.tasks = activeTasks;
          list.completed = list.completed.concat(completedTasks);
        }
      }

      // Bug 1981722 — Only trigger if the user has manually created more lists
      // than allowed. Throwing here prevents lists from syncing.
      if (this.isOverMaximumListCount(lists)) {
        throw new Error(`Over the maximum list count`);
      }

      this.update({ lists }, isStartup);
    }

    if (selected) {
      this.updateSelected(selected, isStartup);
    }
  }

  update(data, isStartup = false) {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_LISTS_SET,
        data: data.lists,
        meta: isStartup,
      })
    );
  }

  updateSelected(data, isStartup = false) {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_LISTS_SET_SELECTED,
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
        await this.cache.set("lists", action.data.lists);
        this.update(action.data);
        break;
      case at.WIDGETS_LISTS_CHANGE_SELECTED:
        await this.cache.set("selected", action.data);
        this.updateSelected(action.data);
        break;
    }
  }
}

ListsFeed.prototype.PersistentCache = (...args) => {
  return new lazy.PersistentCache(...args);
};
