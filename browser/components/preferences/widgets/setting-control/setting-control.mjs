/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createRef,
  html,
  ifDefined,
  literal,
  ref,
  staticHtml,
  unsafeStatic,
} from "chrome://global/content/vendor/lit.all.mjs";
import {
  SettingElement,
  spread,
} from "chrome://browser/content/preferences/widgets/setting-element.mjs";

/** @import MozCheckbox from "../../../../../toolkit/content/widgets/moz-checkbox/moz-checkbox.mjs"*/
/** @import { Setting } from "chrome://global/content/preferences/Setting.mjs"; */
/** @import { PreferencesSettingConfigNestedControlOption } from "chrome://global/content/preferences/Preferences.mjs"; */

/**
 * Properties that represent a nested HTML element that will be a direct descendant of this setting control element
 * @typedef {object} SettingNestedElementOption
 * @property {Array<SettingNestedElementOption>} [options]
 * @property {string} control - The {@link HTMLElement#localName} of any HTML element
 * @property {Record<string, string>} [controlAttrs] - Attributes for the element
 */

/**
 * Mapping of parent control tag names to the literal tag name for their
 * expected children. eg. "moz-radio-group"->literal`moz-radio`.
 * @type Map<string, literal>
 */
const KNOWN_OPTIONS = new Map([
  ["moz-radio-group", literal`moz-radio`],
  ["moz-select", literal`moz-option`],
  ["moz-visual-picker", literal`moz-visual-picker-item`],
]);

/**
 * Mapping of parent control tag names to the expected slot for their children.
 * If there's no entry here for a control then it's expected that its children
 * should go in the default slot.
 * @type Map<string, string>
 */
const ITEM_SLOT_BY_PARENT = new Map([
  ["moz-checkbox", "nested"],
  ["moz-input-text", "nested"],
  ["moz-input-search", "nested"],
  ["moz-input-folder", "nested"],
  ["moz-input-password", "nested"],
  ["moz-radio", "nested"],
  ["moz-radio-group", "nested"],
  // NOTE: moz-select does not support the nested slot.
  ["moz-toggle", "nested"],
]);

export class SettingNotDefinedError extends Error {
  /** @param {string} settingId */
  constructor(settingId) {
    super(
      `No Setting with id "${settingId}". Did you register it with Preferences.addSetting()?`
    );
    this.name = "SettingNotDefinedError";
    this.settingId = settingId;
  }
}

export class SettingControl extends SettingElement {
  static SettingNotDefinedError = SettingNotDefinedError;
  static properties = {
    setting: { type: Object },
    config: { type: Object },
    value: {},
    parentDisabled: { type: Boolean },
    showEnableExtensionMessage: { type: Boolean },
    tabIndex: { type: Number, reflect: true },
  };

  /**
   * @type {Setting | undefined}
   */
  #lastSetting;

  constructor() {
    super();
    this.controlRef = createRef();

    /**
     * @type {Preferences['getSetting'] | undefined}
     */
    this.getSetting = undefined;

    /**
     * @type {Setting | undefined}
     */
    this.setting = undefined;

    /**
     * @type {PreferencesSettingsConfig | undefined}
     */
    this.config = undefined;

    /**
     * @type {boolean | undefined}
     */
    this.parentDisabled = undefined;

    /**
     * @type {boolean}
     */
    this.showEnableExtensionMessage = false;
  }

  createRenderRoot() {
    return this;
  }

  focus() {
    this.controlRef.value.focus();
  }

  get controlEl() {
    return this.controlRef.value;
  }

  async getUpdateComplete() {
    let result = await super.getUpdateComplete();
    await this.controlEl?.updateComplete;
    return result;
  }

  onSettingChange = () => {
    this.setValue();
    this.requestUpdate();
  };

  /**
   * @type {SettingElement['willUpdate']}
   */
  willUpdate(changedProperties) {
    if (changedProperties.has("setting")) {
      if (this.#lastSetting) {
        this.#lastSetting.off("change", this.onSettingChange);
      }
      this.#lastSetting = this.setting;
      this.setValue();
      this.setting.on("change", this.onSettingChange);
    }
    if (!this.setting) {
      throw new SettingNotDefinedError(this.config.id);
    }
    let prevHidden = this.hidden;
    this.hidden = !this.setting.visible;
    if (prevHidden != this.hidden) {
      this.dispatchEvent(new Event("visibility-change", { bubbles: true }));
    }
  }

  /**
   * @type {MozLitElement['updated']}
   */
  updated() {
    const control = this.controlRef?.value;
    if (!control) {
      return;
    }

    // Set the value based on the control's API.
    if ("checked" in control) {
      control.checked = this.value;
    } else if ("pressed" in control) {
      control.pressed = this.value;
    } else if ("value" in control) {
      control.value = this.value;
    }

    control.requestUpdate();
  }

  /**
   * The default properties that controls and options accept.
   * Note: for the disabled property, a setting can either be locked,
   * or controlled by an extension but not both.
   *
   * @override
   * @param {PreferencesSettingsConfig} config
   * @returns {ReturnType<SettingElement['getCommonPropertyMapping']>}
   */
  getCommonPropertyMapping(config) {
    return {
      ...super.getCommonPropertyMapping(config),
      ".setting": this.setting,
      ".control": this,
    };
  }

  /**
   * The default properties for an option.
   * @param {PreferencesSettingConfigNestedControlOption | SettingNestedElementOption} config
   */
  getOptionPropertyMapping(config) {
    const props = this.getCommonPropertyMapping(config);
    props[".value"] = config.value;
    return props;
  }

  /**
   * The default properties for this control.
   */
  getControlPropertyMapping(config) {
    const props = this.getCommonPropertyMapping(config);
    props[".parentDisabled"] = this.parentDisabled;
    props["?disabled"] =
      this.setting.disabled ||
      this.setting.locked ||
      this.isControlledByExtension();

    return props;
  }

  getValue() {
    return this.setting.value;
  }

  setValue = () => {
    this.value = this.setting.value;
  };

  /**
   * @param {MozCheckbox | HTMLInputElement} el
   * @returns {boolean | string | undefined}
   */
  controlValue(el) {
    if (el.constructor.activatedProperty && el.localName != "moz-radio") {
      return el[el.constructor.activatedProperty];
    } else if (el.localName == "moz-input-folder") {
      return el.folder;
    }
    return el.value;
  }

  // Called by our parent when our input changed.
  onChange(el) {
    this.setting.userChange(this.controlValue(el));
  }

  onClick(event) {
    this.setting.userClick(event);
  }

  async disableExtension() {
    await this.setting.disableControllingExtension();
    this.showEnableExtensionMessage = true;
  }

  isControlledByExtension() {
    return (
      this.setting.controllingExtensionInfo?.id &&
      this.setting.controllingExtensionInfo?.name
    );
  }

  handleEnableExtensionDismiss() {
    this.showEnableExtensionMessage = false;
  }

  navigateToAddons(event) {
    if (event.target.matches("a[data-l10n-name='addons-link']")) {
      event.preventDefault();
      let mainWindow = window.browsingContext.topChromeWindow;
      mainWindow.BrowserAddonUI.openAddonsMgr("addons://list/theme");
    }
  }

  get extensionName() {
    return this.setting.controllingExtensionInfo.name;
  }

  get extensionMessageId() {
    return this.setting.controllingExtensionInfo.l10nId;
  }

  /**
   * Prepare nested item config and settings.
   * @param {PreferencesSettingConfigNestedControlOption} config
   * @returns {Array<string>}
   */
  itemsTemplate(config) {
    if (!config.items) {
      return [];
    }

    const itemArgs = config.items.map(i => ({
      config: i,
      setting: this.getSetting(i.id),
    }));
    let control = config.control || "moz-checkbox";
    return itemArgs.map(
      item =>
        html`<setting-control
          .config=${item.config}
          .setting=${item.setting}
          .getSetting=${this.getSetting}
          slot=${ifDefined(ITEM_SLOT_BY_PARENT.get(control))}
        ></setting-control>`
    );
  }

  /**
   * Prepares any children (and any of its children's children) that this element may need.
   * @param {PreferencesSettingConfigNestedControlOption | SettingNestedElementOption} config
   * @returns {Array<string>}
   */
  optionsTemplate(config) {
    if (!config.options) {
      return [];
    }
    let control = config.control || "moz-checkbox";
    return config.options.map(opt => {
      let optionTag = opt.control
        ? unsafeStatic(opt.control)
        : KNOWN_OPTIONS.get(control);
      return staticHtml`<${optionTag}
          ${spread(this.getOptionPropertyMapping(opt))}
        >${"items" in opt ? this.itemsTemplate(opt) : this.optionsTemplate(opt)}</${optionTag}>`;
    });
  }

  render() {
    // Allow the Setting to override the static config if necessary.
    this.config = this.setting.getControlConfig(this.config);
    let { config } = this;
    let control = config.control || "moz-checkbox";

    let nestedSettings =
      "items" in config
        ? this.itemsTemplate(config)
        : this.optionsTemplate(config);

    // Get the properties for this element: id, fluent, disabled, etc.
    // These will be applied to the control using the spread directive.
    let controlProps = this.getControlPropertyMapping(config);

    let tag = unsafeStatic(control);
    let messageBar;

    // NOTE: the showEnableMessage message bar should ONLY appear when
    // there are no extensions controlling the setting.
    if (this.isControlledByExtension()) {
      let args = { name: this.extensionName };
      messageBar = html`<moz-message-bar
        class="extension-controlled-message-bar"
        .messageL10nId=${this.extensionMessageId}
        .messageL10nArgs=${args}
      >
        <moz-button
          slot="actions"
          @click=${this.disableExtension}
          data-l10n-id="disable-extension"
        ></moz-button>
      </moz-message-bar>`;
    } else if (this.showEnableExtensionMessage) {
      messageBar = html`<moz-message-bar
        class="reenable-extensions-message-bar"
        dismissable=""
        @message-bar:user-dismissed=${this.handleEnableExtensionDismiss}
      >
        <span
          @click=${this.navigateToAddons}
          slot="message"
          data-l10n-id="extension-controlled-enable-2"
        >
          <a data-l10n-name="addons-link" href="#"></a>
        </span>
      </moz-message-bar>`;
    }
    return staticHtml`
    ${messageBar}
    <${tag}
      ${spread(controlProps)}
      ${ref(this.controlRef)}
      tabindex=${ifDefined(this.tabIndex)}
    >${nestedSettings}</${tag}>`;
  }
}
customElements.define("setting-control", SettingControl);
