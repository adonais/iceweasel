/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import {
  SettingElement,
  spread,
} from "chrome://browser/content/preferences/widgets/setting-element.mjs";
import { SettingControl } from "chrome://browser/content/preferences/widgets/setting-control.mjs";

/**
 * @import { SettingElementConfig } from "chrome://browser/content/preferences/widgets/setting-element.mjs"
 * @import { SettingControlConfig, SettingControlEvent } from "../setting-control/setting-control.mjs"
 * @import { Preferences } from "chrome://global/content/preferences/Preferences.mjs"
 * @import { TemplateResult } from "chrome://global/content/vendor/lit.all.mjs";
 */

/**
 * @typedef {object} SettingGroupConfigExtensions
 * @property {SettingControlConfig[]} items Array of SettingControlConfigs to render.
 * @property {number} [headingLevel] A heading level to create the legend as (1-6).
 * @property {boolean} [inProgress]
 * Hide this section unless the browser.settings-redesign.enabled or
 * browser.settings-redesign.<groupid>.enabled prefs are true.
 * @property {"default"|"always"|"never"} [card]
 * Whether to use a card. Default: use a card after SRD or in a sub-pane.
 */
/** @typedef {SettingElementConfig & SettingGroupConfigExtensions} SettingGroupConfig */

const CLICK_HANDLERS = new Set([
  "dialog-button",
  "moz-box-button",
  "moz-box-item",
  "moz-box-link",
  "moz-button",
  "moz-box-group",
  "moz-message-bar",
]);

/**
 * Enumish of attribute names used for changing setting-group and groupbox
 * visibilities based on the visibility of child setting-controls.
 */
const HiddenAttr = Object.freeze({
  /** Attribute used to hide elements without using the hidden attribute. */
  Self: "data-hidden-by-setting-group",
  /** Attribute used to signal that this element should not be searchable. */
  Search: "data-hidden-from-search",
});

export class SettingGroup extends SettingElement {
  static properties = {
    config: { type: Object },
    groupId: { type: String },
    getSetting: { type: Function },
    srdEnabled: { type: Boolean },
    inSubPane: { type: Boolean },
  };

  static queries = {
    allControlEls: { all: "setting-control" },
    fieldsetEl: "moz-fieldset",
  };

  /**
   * Immediate child control elements. See {@link SettingGroup.allControlEls} to
   * get all ancestors.
   */
  get childControlEls() {
    // @ts-expect-error bug 1997478
    return [...this.fieldsetEl.children].filter(
      child => child instanceof SettingControl
    );
  }

  constructor() {
    super();

    /**
     * @type {Preferences['getSetting'] | undefined}
     */
    this.getSetting = undefined;

    /**
     * @type {SettingGroupConfig | undefined}
     */
    this.config = undefined;

    /**
     * Set by initSettingGroup based on browser.settings-redesign.enabled.
     */
    this.srdEnabled = false;
    /**
     * Set by setting-pane if this is a sub pane so we can render cards even if SRD is off.
     */
    this.inSubPane = false;
  }

  createRenderRoot() {
    return this;
  }

  async handleVisibilityChange() {
    await this.updateComplete;
    let hasVisibleControls = this.childControlEls.some(el => !el.hidden);
    let groupbox = /** @type {XULElement} */ (this.closest("groupbox"));
    if (hasVisibleControls) {
      if (this.hasAttribute(HiddenAttr.Self)) {
        this.removeAttribute(HiddenAttr.Self);
        this.removeAttribute(HiddenAttr.Search);
      }
      if (groupbox && groupbox.hasAttribute(HiddenAttr.Self)) {
        groupbox.removeAttribute(HiddenAttr.Search);
        groupbox.removeAttribute(HiddenAttr.Self);
      }
    } else {
      this.setAttribute(HiddenAttr.Self, "");
      this.setAttribute(HiddenAttr.Search, "true");
      if (groupbox && !groupbox.hasAttribute(HiddenAttr.Search)) {
        groupbox.setAttribute(HiddenAttr.Search, "true");
        groupbox.setAttribute(HiddenAttr.Self, "");
      }
    }
  }

  async getUpdateComplete() {
    let result = await super.getUpdateComplete();
    // @ts-expect-error bug 1997478
    await Promise.all([...this.allControlEls].map(el => el.updateComplete));
    return result;
  }

  /**
   * Notify child controls when their input has fired an event. When controls
   * are nested the parent receives events for the nested controls, so this is
   * actually easier to manage here; it also registers fewer listeners.
   *
   * @param {SettingControlEvent<InputEvent>} e
   */
  onChange(e) {
    let inputEl = e.target;
    inputEl.control?.onChange(inputEl);
  }

  /**
   * Notify child controls when their input has been clicked. When controls
   * are nested the parent receives events for the nested controls, so this is
   * actually easier to manage here; it also registers fewer listeners.
   *
   * @param {SettingControlEvent<MouseEvent>} e
   */
  onClick(e) {
    let inputEl = e.target;
    if (!CLICK_HANDLERS.has(inputEl.localName)) {
      return;
    }
    inputEl.control?.onClick(e);
  }

  /**
   * @param {SettingControlConfig} item
   */
  itemTemplate(item) {
    let setting = this.getSetting(item.id);
    return html`<setting-control
      .setting=${setting}
      .config=${item}
      .getSetting=${this.getSetting}
    ></setting-control>`;
  }

  /**
   * @param {TemplateResult} content The content to render in a container.
   */
  containerTemplate(content) {
    if (
      (this.srdEnabled || this.inSubPane || this.config.card == "always") &&
      this.config.card != "never"
    ) {
      return html`<moz-card>${content}</moz-card>`;
    }
    return content;
  }

  render() {
    if (!this.config) {
      return "";
    }
    return this.containerTemplate(
      html`<moz-fieldset
        .headingLevel=${this.srdEnabled ? 2 : this.config.headingLevel}
        @change=${this.onChange}
        @toggle=${this.onChange}
        @click=${this.onClick}
        @visibility-change=${this.handleVisibilityChange}
        ${spread(this.getCommonPropertyMapping(this.config))}
        >${this.config.items.map(item => this.itemTemplate(item))}</moz-fieldset
      >`
    );
  }
}
customElements.define("setting-group", SettingGroup);
