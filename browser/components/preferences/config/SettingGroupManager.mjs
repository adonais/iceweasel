/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import {SettingGroupConfig} from "chrome://browser/content/preferences/widgets/setting-group.mjs" */

export const SettingGroupManager = {
  /** @type {Map<string, SettingGroupConfig>} */
  _data: new Map(),

  /** @type {Set<(id: string) => void>} */
  _onRegisterListeners: new Set(),

  /**
   * @param {string} id
   */
  get(id) {
    if (!this._data.has(id)) {
      throw new Error(`Setting group "${id}" not found`);
    }
    return this._data.get(id);
  },

  /**
   * @param {string} id
   * @returns {boolean} Whether this group is registered.
   */
  has(id) {
    return this._data.has(id);
  },

  /**
   * Notifies subscribers as each group registers (bug 2051119).
   *
   * @param {(id: string) => void} callback
   * @returns {() => void} Removes the listener.
   */
  onRegister(callback) {
    this._onRegisterListeners.add(callback);
    return () => this._onRegisterListeners.delete(callback);
  },

  /**
   * @param {string} id
   * @param {SettingGroupConfig} config
   */
  registerGroup(id, config) {
    if (this._data.has(id)) {
      throw new Error(`Setting group "${id}" already registered`);
    }
    this._data.set(id, config);
    for (let callback of this._onRegisterListeners) {
      try {
        callback(id);
      } catch (ex) {
        console.error("Error notifying SettingGroupManager listener", ex);
      }
    }
  },

  /**
   * @param {Record<string, SettingGroupConfig>} groupConfigs
   */
  registerGroups(groupConfigs) {
    for (let id in groupConfigs) {
      this.registerGroup(id, groupConfigs[id]);
    }
  },
};
