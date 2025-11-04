/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  AsyncSetting,
  AsyncSettingHandler,
} from "chrome://global/content/preferences/AsyncSetting.mjs";
import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";

/** @import { type Preference } from "chrome://global/content/preferences/Preference.mjs" */
/** @import { PreferencesSettingsConfig } from "chrome://global/content/preferences/Preferences.mjs" */

const { EventEmitter } = ChromeUtils.importESModule(
  "resource://gre/modules/EventEmitter.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionSettingsStore:
    "resource://gre/modules/ExtensionSettingsStore.sys.mjs",
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  Management: "resource://gre/modules/Extension.sys.mjs",
});

/**
 * A map of Setting instances (values) along with their IDs
 * (keys) so that the dependencies of a setting can
 * be easily looked up by just their ID.
 *
 * @typedef {Record<string, Setting | undefined>} PreferenceSettingDepsMap
 */

/**
 * @typedef {string | boolean | number} SettingValue
 */

class PreferenceNotAddedError extends Error {
  constructor(settingId, prefId) {
    super(
      `Setting "${settingId}" was unable to find Preference "${prefId}". Did you register it with Preferences.add/addAll?`
    );
    this.name = "PreferenceNotAddedError";
    this.settingId = settingId;
    this.prefId = prefId;
  }
}

export class Setting extends EventEmitter {
  /**
   * @type {Preference | undefined | null}
   */
  pref;

  /**
   * Keeps a cache of each dep's Setting so that
   * it can be easily looked up by its ID.
   *
   * @type {PreferenceSettingDepsMap | undefined}
   */
  _deps;

  /**
   * @type {PreferencesSettingsConfig}
   */
  config;

  /**
   * @param {PreferencesSettingsConfig['id']} id
   * @param {PreferencesSettingsConfig} config
   * @throws {Error} Will throw an error (PreferenceNotAddedError) if
   *    config.pref was not registered
   */
  constructor(id, config) {
    super();

    if (Object.getPrototypeOf(config) == AsyncSetting) {
      config = new AsyncSettingHandler(new config());
    }

    this.id = id;
    this.config = config;
    this.pref = config.pref && Preferences.get(config.pref);
    if (config.pref && !this.pref) {
      throw new PreferenceNotAddedError(id, config.pref);
    }
    this._emitting = false;

    this.controllingExtensionInfo = {
      ...this.config.controllingExtensionInfo,
    };
    if (this.pref) {
      this.pref.on("change", this.onChange);
    }
    if (this.config.controllingExtensionInfo?.storeId) {
      this._checkForControllingExtension();
      this.watchExtensionPrefChange();
    }
    if (typeof this.config.setup === "function") {
      this._teardown = this.config.setup(this.onChange, this.deps, this);
    }
  }

  onChange = () => {
    if (this._emitting) {
      return;
    }
    this._emitting = true;
    this.emit("change");
    this._emitting = false;
  };

  /**
   * A map of each dep and it's associated {@link Setting} instance.
   *
   * @type {PreferenceSettingDepsMap}
   */
  get deps() {
    if (this._deps) {
      return this._deps;
    }
    /**
     * @type {PreferenceSettingDepsMap}
     */
    const deps = {};

    if (this.config.deps) {
      for (let id of this.config.deps) {
        const setting = Preferences.getSetting(id);
        if (setting) {
          deps[id] = setting;
        }
      }
    }
    this._deps = deps;

    for (const setting of Object.values(this._deps)) {
      setting.on("change", this.onChange);
    }

    return this._deps;
  }

  /**
   * @type {SettingValue}
   */
  get value() {
    let prefVal = this.pref?.value;
    if (this.config.get) {
      return this.config.get(prefVal, this.deps, this);
    }
    return prefVal;
  }

  /**
   * @param {SettingValue} val
   */
  set value(val) {
    let newVal = this.config.set ? this.config.set(val, this.deps, this) : val;
    if (this.pref) {
      this.pref.value = newVal;
    }
  }

  /**
   * @type {boolean}
   */
  get locked() {
    return this.pref?.locked ?? false;
  }

  get visible() {
    return this.config.visible ? this.config.visible(this.deps, this) : true;
  }

  get disabled() {
    return this.config.disabled ? this.config.disabled(this.deps, this) : false;
  }

  /**
   * @param {PreferencesSettingsConfig} config
   * @returns {PreferencesSettingsConfig | undefined}
   */
  getControlConfig(config) {
    if (this.config.getControlConfig) {
      return this.config.getControlConfig(config, this.deps, this);
    }
    return config;
  }

  userClick(event) {
    if (this.config.onUserClick) {
      this.config.onUserClick(event, this.deps, this);
    }
  }

  /**
   * @param {string} val
   */
  userChange(val) {
    this.value = val;
    if (this.config.onUserChange) {
      this.config.onUserChange(val, this.deps, this);
    }
  }

  async disableControllingExtension() {
    if (
      this.controllingExtensionInfo.name &&
      this.controllingExtensionInfo.id
    ) {
      await lazy.ExtensionSettingsStore.initialize();
      let { id } = await lazy.ExtensionSettingsStore.getSetting(
        "prefs",
        this.controllingExtensionInfo.storeId
      );
      if (id) {
        let addon = await lazy.AddonManager.getAddonByID(id);
        await addon.disable();
      }
    }
  }

  _observeExtensionSettingChanged = (_, setting) => {
    if (
      setting.key == this.config.controllingExtensionInfo.storeId &&
      setting.type == "prefs"
    ) {
      this._checkForControllingExtension();
    }
  };

  async _checkForControllingExtension() {
    // Make sure all settings API modules are loaded
    // and the extension controlling settings metadata
    // loaded from the ExtensionSettingsStore backend.
    await lazy.Management.asyncLoadSettingsModules();
    await lazy.ExtensionSettingsStore.initialize();
    // Retrieve the extension controlled settings info
    // for the given setting storeId.
    let info = lazy.ExtensionSettingsStore.getSetting(
      "prefs",
      this.config.controllingExtensionInfo?.storeId
    );
    if (info && info.id) {
      let addon = await lazy.AddonManager.getAddonByID(info.id);
      if (addon) {
        this.controllingExtensionInfo.name = addon.name;
        this.controllingExtensionInfo.id = info.id;
        this.emit("change");
        return;
      }
    }
    this._clearControllingExtensionInfo();
  }

  _clearControllingExtensionInfo() {
    delete this.controllingExtensionInfo.id;
    delete this.controllingExtensionInfo.name;
    // Request an update to the setting control so the UI is in the correct state
    this.onChange();
  }

  watchExtensionPrefChange() {
    lazy.Management.on(
      "extension-setting-changed",
      this._observeExtensionSettingChanged
    );
  }

  destroy() {
    if (typeof this._teardown === "function") {
      this._teardown();
      this._teardown = null;
    }

    if (this.config.controllingExtensionInfo?.storeId) {
      lazy.Management.off(
        "extension-setting-changed",
        this._observeExtensionSettingChanged
      );
    }
  }
}
