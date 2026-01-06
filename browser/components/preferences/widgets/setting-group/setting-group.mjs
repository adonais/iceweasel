/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import {
  SettingElement,
  spread,
} from "chrome://browser/content/preferences/widgets/setting-element.mjs";

/** @import { SettingElementConfig } from "chrome://browser/content/preferences/widgets/setting-element.mjs" */
/** @import { SettingControlConfig, SettingControlEvent } from "../setting-control/setting-control.mjs" */
/** @import { Preferences } from "chrome://global/content/preferences/Preferences.mjs" */

/**
 * @typedef {object} SettingGroupConfigExtensions
 * @property {SettingControlConfig[]} items Array of SettingControlConfigs to render.
 * @property {number} [headingLevel] A heading level to create the legend as (1-6).
 * @property {boolean} [inProgress]
 * Hide this section unless the browser.settings-redesign.enabled or
 * browser.settings-redesign.<groupid>.enabled prefs are true.
 */
/** @typedef {SettingElementConfig & SettingGroupConfigExtensions} SettingGroupConfig */

const CLICK_HANDLERS = new Set([
  "dialog-button",
  "moz-box-button",
  "moz-box-item",
  "moz-box-link",
  "moz-button",
  "moz-box-group",
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
  }

  static properties = {
    config: { type: Object },
    groupId: { type: String },
    getSetting: { type: Function },
  };

  static queries = {
    controlEls: { all: "setting-control" },
  };

  createRenderRoot() {
    return this;
  }

  async handleVisibilityChange() {
    await this.updateComplete;
    // @ts-expect-error bug 1997478
    let hasVisibleControls = [...this.controlEls].some(el => !el.hidden);
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
    await Promise.all([...this.controlEls].map(el => el.updateComplete));
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

  render() {
    if (!this.config) {
      return "";
    }
    return html`<moz-fieldset
      .headingLevel=${this.config.headingLevel}
      @change=${this.onChange}
      @toggle=${this.onChange}
      @click=${this.onClick}
      @visibility-change=${this.handleVisibilityChange}
      ${spread(this.getCommonPropertyMapping(this.config))}
      >${this.config.items.map(item => this.itemTemplate(item))}</moz-fieldset
    >`;
  }
}
customElements.define("setting-group", SettingGroup);
