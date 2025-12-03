/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AsyncSetting } from "chrome://global/content/preferences/AsyncSetting.mjs";
import { Preference } from "chrome://global/content/preferences/Preference.mjs";
import { Setting } from "chrome://global/content/preferences/Setting.mjs";

/** @import {PreferenceConfigInfo} from "chrome://global/content/preferences/Preference.mjs" */
/** @import {PreferenceSettingDepsMap} from "chrome://global/content/preferences/Setting.mjs" */

/**
 * @callback PreferenceSettingVisibleFunction
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {boolean | string | undefined} If truthy shows the setting in the UI, or hides it if not
 */

/**
 * Gets the value of a {@link PreferencesSettingsConfig}.
 *
 * @callback PreferenceSettingGetter
 * @param {string | number} val - The value that was retrieved from the preferences backend
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {any} - The value to set onto the setting
 */

/**
 * Sets the value of a {@link PreferencesSettingsConfig}.
 *
 * @callback PreferenceSettingSetter
 * @param {string | undefined} val - The value/pressed/checked from the input (control) associated with the setting
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {void}
 */

/**
 * @callback PreferencesSettingOnUserChangeFunction
 * @param {string} val - The value/pressed/checked from the input of the control associated with the setting
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {void}
 */

/**
 * @callback PreferencesSettingConfigDisabledFunction
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {boolean}
 */

/**
 * @callback PreferencesSettingGetControlConfigFunction
 * @param {PreferencesSettingsConfig} config
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {PreferencesSettingsConfig | undefined}
 */

/**
 * @callback PreferencesSettingConfigTeardownFunction
 * @returns {void}
 */

/**
 * @callback PreferencesSettingConfigSetupFunction
 * @param {Function} emitChange
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {PreferencesSettingConfigTeardownFunction | void}
 */

/**
 * @callback PreferencesSettingConfigOnUserClickFunction
 * @param {Event} event
 * @param {PreferenceSettingDepsMap} deps
 * @param {Setting} setting
 * @returns {void}
 */

/**
 * @typedef {Record<string, any>} PreferencesSettingConfigControlAttributes
 */

/**
 * @typedef {Omit<PreferencesSettingConfigNestedControlOption, 'id | value'>} PreferencesSettingConfigNestedElementOption
 */

/**
 * A set of properties that represent a nested control or element.
 *
 * @typedef {object} PreferencesSettingConfigNestedControlOption
 * @property {string} [control] - The {@link HTMLElement#localName} of any HTML element that will be nested as a direct descendant of the control element. A moz-checkbox will be rendered by default.
 * @property {PreferencesSettingConfigControlAttributes} [controlAttrs] - A map of any attributes to add to the control
 * @property {string} [l10nId] - The fluent ID of the control
 * @property {Array<PreferencesSettingConfigNestedElementOption>} [options] - Options for additional nested HTML elements. This will be overridden if items property is used.
 * @property {string} [id]
 * @property {string} [value] - An optional initial value used for the control element if it's an input element that supports a value property
 * @property {Array<PreferencesSettingsConfig>} [items] - A list of setting control items that will get rendered as direct descendants of the setting control. This overrides the options property.
 */

/**
 * @typedef {object} PreferencesSettingsConfig
 * @property {string} id - The ID for the Setting, this should match the layout id
 * @property {string} [l10nId] - The Fluent l10n ID for the setting
 * @property {Record<string, string>} [l10nArgs] - An object containing l10n IDs and their values that will be translated with Fluent
 * @property {string} [pref] - A {@link Services.prefs} id that will be used as the backend if it is provided
 * @property {PreferenceSettingVisibleFunction} [visible] - Function to determine if a setting is visible in the UI
 * @property {PreferenceSettingGetter} [get] - Function to get the value of the setting. Optional if {@link PreferencesSettingsConfig#pref} is set.
 * @property {PreferenceSettingSetter} [set] - Function to set the value of the setting. Optional if {@link PreferencesSettingsConfig#pref} is set.
 * @property {PreferencesSettingGetControlConfigFunction} [getControlConfig] -  Function that allows the setting to modify its layout, this is intended to be used to provide the options, {@link PreferencesSettingsConfig#l10nId} or {@link PreferencesSettingsConfig#l10nArgs} data if necessary, but technically it can change anything (that doesn't mean it will have any effect though).
 * @property {PreferencesSettingOnUserChangeFunction} [onUserChange] - A function that will be called when the setting
 *    has been modified by the user, it is passed the value/pressed/checked from its input. NOTE: This should be used for
 *    additional work that needs to happen, such as recording telemetry.
 *    If you want to set the value of the Setting then use the {@link PreferencesSettingsConfig.set} function.
 * @property {Array<PreferencesSettingsConfig> | undefined} [items]
 * @property {PreferencesSettingConfigNestedControlOption['control']} [control] - The {@link HTMLElement#localName} of any HTML element that will be rendered as a control in the UI for the setting.
 * @property {PreferencesSettingConfigSetupFunction} [setup] -  A function to be called to register listeners for
 *    the setting. It should return a {@link PreferencesSettingConfigTeardownFunction} function to
 *    remove the listeners if necessary. This should emit change events when the setting has changed to
 *    ensure the UI stays in sync if possible.
 * @property {PreferencesSettingConfigDisabledFunction} [disabled] - A function to determine if a setting should be disabled
 * @property {PreferencesSettingConfigOnUserClickFunction} [onUserClick] - A function that will be called when a setting has been
 *    clicked, the element name must be included in the CLICK_HANDLERS array
 *    in {@link file://./../../browser/components/preferences/widgets/setting-group/setting-group.mjs}. This should be
 *    used for controls that aren’t regular form controls but instead perform an action when clicked, like a button or link.
 * @property {Array<string> | void} [deps] - An array of setting IDs that this setting depends on, when these settings change this setting will emit a change event to update the UI
 * @property {PreferencesSettingConfigControlAttributes} [controlAttrs] - An object of additional attributes to be set on the control. These can be used to further customize the control for example a message bar of the warning type, or what dialog a button should open
 * @property {Array<PreferencesSettingConfigNestedControlOption>} [options] - An optional list of nested controls for this setting (select options, radio group radios, etc)
 * @property {string} [iconSrc] - A path to the icon for the control (if the control supports one)
 * @property {string} [supportPage] - The SUMO support page slug for the setting
 * @property {string} [subcategory] - The sub-category slug used for direct linking to a setting from SUMO
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
});

const domContentLoadedPromise = new Promise(resolve => {
  window.addEventListener("DOMContentLoaded", resolve, {
    capture: true,
    once: true,
  });
});

export const Preferences = {
  /**
   * @type {Record<string, Preference>}
   */
  _all: {},

  /**
   * @type {Map<string, Setting>}
   */
  _settings: new Map(),

  /**
   * @param {PreferenceConfigInfo} prefInfo
   */
  _add(prefInfo) {
    if (this._all[prefInfo.id]) {
      throw new Error(`preference with id '${prefInfo.id}' already added`);
    }
    const pref = new Preference(prefInfo);
    this._all[pref.id] = pref;
    domContentLoadedPromise.then(() => {
      if (!this.updateQueued) {
        pref.updateElements();
      }
    });
    return pref;
  },

  /**
   * @param {PreferenceConfigInfo} prefInfo
   * @returns {Preference}
   */
  add(prefInfo) {
    const pref = this._add(prefInfo);
    return pref;
  },

  /**
   * @param {Array<PreferenceConfigInfo>} prefInfos
   */
  addAll(prefInfos) {
    prefInfos.map(prefInfo => this._add(prefInfo));
  },

  /**
   * @param {string} id
   * @returns {Preference | null}
   */
  get(id) {
    return this._all[id] || null;
  },

  /**
   * @returns {Array<PreferenceConfigInfo>}
   */
  getAll() {
    return Object.values(this._all);
  },

  /**
   * A configuration object that adds an element (control) associated with a pref,
   * that includes all of the configuration for the control
   * such as its Fluent strings, support page, subcategory etc.
   *
   * @param {PreferencesSettingsConfig} settingConfig
   */
  addSetting(settingConfig) {
    this._settings.set(
      settingConfig.id,
      new Setting(settingConfig.id, settingConfig)
    );
  },

  /**
   * @param {string} settingId
   * @returns {Setting | undefined}
   */
  getSetting(settingId) {
    return this._settings.get(settingId);
  },

  defaultBranch: Services.prefs.getDefaultBranch(""),

  get type() {
    return document.documentElement.getAttribute("type") || "";
  },

  get instantApply() {
    // The about:preferences page forces instantApply.
    // TODO: Remove forceEnableInstantApply in favor of always applying in a
    // parent and never applying in a child (bug 1775386).
    if (this._instantApplyForceEnabled) {
      return true;
    }

    // Dialogs of type="child" are never instantApply.
    return this.type !== "child";
  },

  _instantApplyForceEnabled: false,

  // Override the computed value of instantApply for this window.
  forceEnableInstantApply() {
    this._instantApplyForceEnabled = true;
  },

  observe(subject, topic, data) {
    const pref = this._all[data];
    if (pref) {
      pref.value = pref.valueFromPreferences;
    }
  },

  updateQueued: false,

  queueUpdateOfAllElements() {
    if (this.updateQueued) {
      return;
    }

    this.updateQueued = true;

    Services.tm.dispatchToMainThread(() => {
      let startTime = ChromeUtils.now();

      const elements = document.querySelectorAll("[preference]");
      for (const element of elements) {
        const id = element.getAttribute("preference");
        let preference = this.get(id);
        if (!preference) {
          console.error(`Missing preference for ID ${id}`);
          continue;
        }

        preference.setElementValue(element);
      }

      ChromeUtils.addProfilerMarker(
        "Preferences",
        { startTime },
        `updateAllElements: ${elements.length} preferences updated`
      );

      this.updateQueued = false;
    });
  },

  onUnload() {
    this._settings.forEach(setting => setting?.destroy?.());
    Services.prefs.removeObserver("", this);
  },

  QueryInterface: ChromeUtils.generateQI(["nsITimerCallback", "nsIObserver"]),

  _deferredValueUpdateElements: new Set(),

  writePreferences(aFlushToDisk) {
    // Write all values to preferences.
    if (this._deferredValueUpdateElements.size) {
      this._finalizeDeferredElements();
    }

    const preferences = Preferences.getAll();
    for (const preference of preferences) {
      preference.batching = true;
      preference.valueFromPreferences = preference.value;
      preference.batching = false;
    }
    if (aFlushToDisk) {
      Services.prefs.savePrefFile(null);
    }
  },

  getPreferenceElement(aStartElement) {
    let temp = aStartElement;
    while (
      temp &&
      temp.nodeType == Node.ELEMENT_NODE &&
      !temp.hasAttribute("preference")
    ) {
      temp = temp.parentNode;
    }
    return temp && temp.nodeType == Node.ELEMENT_NODE ? temp : aStartElement;
  },

  _deferredValueUpdate(aElement) {
    delete aElement._deferredValueUpdateTask;
    const prefID = aElement.getAttribute("preference");
    const preference = Preferences.get(prefID);
    const prefVal = preference.getElementValue(aElement);
    preference.value = prefVal;
    this._deferredValueUpdateElements.delete(aElement);
  },

  _finalizeDeferredElements() {
    for (const el of this._deferredValueUpdateElements) {
      if (el._deferredValueUpdateTask) {
        el._deferredValueUpdateTask.finalize();
      }
    }
  },

  userChangedValue(aElement) {
    const element = this.getPreferenceElement(aElement);
    if (element.hasAttribute("preference")) {
      if (element.getAttribute("delayprefsave") != "true") {
        const preference = Preferences.get(element.getAttribute("preference"));
        const prefVal = preference.getElementValue(element);
        preference.value = prefVal;
      } else {
        if (!element._deferredValueUpdateTask) {
          element._deferredValueUpdateTask = new lazy.DeferredTask(
            this._deferredValueUpdate.bind(this, element),
            1000
          );
          this._deferredValueUpdateElements.add(element);
        } else {
          // Each time the preference is changed, restart the delay.
          element._deferredValueUpdateTask.disarm();
        }
        element._deferredValueUpdateTask.arm();
      }
    }
  },

  onCommand(event) {
    // This "command" event handler tracks changes made to preferences by
    // the user in this window.
    if (event.sourceEvent) {
      event = event.sourceEvent;
    }
    this.userChangedValue(event.target);
  },

  onChange(event) {
    // This "change" event handler tracks changes made to preferences by
    // the user in this window.
    this.userChangedValue(event.target);
  },

  onInput(event) {
    // This "input" event handler tracks changes made to preferences by
    // the user in this window.
    this.userChangedValue(event.target);
  },

  _fireEvent(aEventName, aTarget) {
    try {
      const event = new CustomEvent(aEventName, {
        bubbles: true,
        cancelable: true,
      });
      return aTarget.dispatchEvent(event);
    } catch (e) {
      console.error(e);
    }
    return false;
  },

  onDialogAccept(event) {
    let dialog = document.querySelector("dialog");
    if (!this._fireEvent("beforeaccept", dialog)) {
      event.preventDefault();
      return false;
    }
    this.writePreferences(true);
    return true;
  },

  close(event) {
    if (Preferences.instantApply) {
      window.close();
    }
    event.stopPropagation();
    event.preventDefault();
  },

  handleEvent(event) {
    switch (event.type) {
      case "toggle":
      case "change":
        return this.onChange(event);
      case "command":
        return this.onCommand(event);
      case "dialogaccept":
        return this.onDialogAccept(event);
      case "input":
        return this.onInput(event);
      case "unload":
        return this.onUnload(event);
      default:
        return undefined;
    }
  },

  /** @type {WeakMap<Element, (el: Element) => any>} */
  _syncFromPrefListeners: new WeakMap(),
  /** @type {WeakMap<Element, (el: Element) => any>} */
  _syncToPrefListeners: new WeakMap(),

  /**
   * @param {Element} aElement
   * @param {(el: Element) => any} callback
   */
  addSyncFromPrefListener(aElement, callback) {
    this._syncFromPrefListeners.set(aElement, callback);
    if (this.updateQueued) {
      return;
    }
    // Make sure elements are updated correctly with the listener attached.
    let elementPref = aElement.getAttribute("preference");
    if (elementPref) {
      let pref = this.get(elementPref);
      if (pref) {
        pref.updateElements();
      }
    }
  },

  /**
   * @param {Element} aElement
   * @param {(el: Element) => any} callback
   */
  addSyncToPrefListener(aElement, callback) {
    this._syncToPrefListeners.set(aElement, callback);
    if (this.updateQueued) {
      return;
    }
    // Make sure elements are updated correctly with the listener attached.
    let elementPref = aElement.getAttribute("preference");
    if (elementPref) {
      let pref = this.get(elementPref);
      if (pref) {
        pref.updateElements();
      }
    }
  },

  removeSyncFromPrefListener(aElement) {
    this._syncFromPrefListeners.delete(aElement);
  },

  removeSyncToPrefListener(aElement) {
    this._syncToPrefListeners.delete(aElement);
  },

  AsyncSetting,
  Preference,
  Setting,
};

Services.prefs.addObserver("", Preferences);
window.addEventListener("toggle", Preferences);
window.addEventListener("change", Preferences);
window.addEventListener("command", Preferences);
window.addEventListener("dialogaccept", Preferences);
window.addEventListener("input", Preferences);
window.addEventListener("select", Preferences);
window.addEventListener("unload", Preferences, { once: true });
