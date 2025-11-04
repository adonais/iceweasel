/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { EventEmitter } = ChromeUtils.importESModule(
  "resource://gre/modules/EventEmitter.sys.mjs"
);

/**
 * This is the interface for the async setting classes to implement.
 *
 * For the actual implementation see AsyncSettingMixin.
 */
export class AsyncSetting extends EventEmitter {
  /** @type {string} */
  static id = "";

  /** @type {Object} */
  static controllingExtensionInfo;

  defaultValue = "";
  defaultDisabled = false;
  defaultVisible = true;
  defaultGetControlConfig = {};

  /**
   * Emit a change event to notify listeners that the setting's data has
   * changed and should be updated.
   */
  emitChange() {
    this.emit("change");
  }

  /**
   * Setup any external listeners that are required for managing this
   * setting's state. When the state needs to update the Setting.emitChange method should be called.
   * @returns {Function | void} Teardown function to clean up external listeners.
   */
  setup() {}

  /**
   * Get the value of this setting.
   * @abstract
   * @returns {Promise<boolean | number | string | void>}
   */
  async get() {}

  /**
   * Set the value of this setting.
   * @abstract
   * @param value {any} The value from the input that triggered the update.
   * @returns {Promise<void>}
   */
  async set() {}

  /**
   * Whether the control should be disabled.
   * @returns {Promise<boolean>}
   */
  async disabled() {
    return false;
  }

  /**
   * Whether the control should be visible.
   * @returns {Promise<boolean>}
   */
  async visible() {
    return true;
  }

  /**
   * Override the initial control config. This will be spread into the
   * initial config, with this object taking precedence.
   * @returns {Promise<Object>}
   */
  async getControlConfig() {
    return {};
  }

  /**
   * Callback fired after a user has changed the setting's value. Useful for
   * recording telemetry.
   * @param value {any}
   * @returns {Promise<void>}
   */
  async onUserChange() {}
}

/**
 * Wraps an AsyncSetting and adds caching of values to provide a synchronous
 * API to the Setting class.
 */
export class AsyncSettingHandler {
  /** @type {AsyncSetting} */
  asyncSetting;

  /** @type {Function} */
  #emitChange;

  /** @type {import("./Setting.mjs").PreferenceSettingDepsMap} */
  deps;

  /** @type {Setting} */
  setting;

  /**
   * @param {AsyncSetting} asyncSetting
   */
  constructor(asyncSetting) {
    this.asyncSetting = asyncSetting;
    this.#emitChange = () => {};

    // Initialize cached values with defaults
    this.cachedValue = asyncSetting.defaultValue;
    this.cachedDisabled = asyncSetting.defaultDisabled;
    this.cachedVisible = asyncSetting.defaultVisible;
    this.cachedGetControlConfig = asyncSetting.defaultGetControlConfig;

    // Listen for change events from the async setting
    this.asyncSetting.on("change", () => this.refresh());
  }

  /**
   * @param emitChange {Function}
   * @param deps {Record<string, Setting>}
   * @param setting {Setting}
   * @returns {Function | void}
   */
  setup(emitChange, deps, setting) {
    let teardown = this.asyncSetting.setup();

    this.#emitChange = emitChange;
    this.deps = deps;
    this.setting = setting;

    this.refresh();
    return teardown;
  }

  /**
   * Called to trigger async tasks and re-cache values.
   */
  async refresh() {
    [
      this.cachedValue,
      this.cachedDisabled,
      this.cachedVisible,
      this.cachedGetControlConfig,
    ] = await Promise.all([
      this.asyncSetting.get(),
      this.asyncSetting.disabled(),
      this.asyncSetting.visible(),
      this.asyncSetting.getControlConfig(),
    ]);
    this.#emitChange();
  }

  /**
   * @returns {boolean | number | string | void}
   */
  get() {
    return this.cachedValue;
  }

  /**
   * @param value {any}
   * @returns {Promise<void>}
   */
  set(value) {
    return this.asyncSetting.set(value);
  }

  /**
   * @returns {boolean}
   */
  disabled() {
    return this.cachedDisabled;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return this.cachedVisible;
  }

  /**
   * @param config {Object}
   * @returns {Object}
   */
  getControlConfig(config) {
    return {
      ...config,
      ...this.cachedGetControlConfig,
    };
  }

  /**
   * @param value {any}
   * @returns {Promise<void>}
   */
  onUserChange(value) {
    return this.asyncSetting.onUserChange(value);
  }
}
