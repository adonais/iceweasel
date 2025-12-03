/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import {
  SettingElement,
  spread,
} from "chrome://browser/content/preferences/widgets/setting-element.mjs";

/** @import { SettingControl } from "../setting-control/setting-control.mjs"; */
/** @import {PreferencesSettingsConfig, Preferences} from "chrome://global/content/preferences/Preferences.mjs" */

const CLICK_HANDLERS = new Set([
  "dialog-button",
  "moz-box-button",
  "moz-box-item",
  "moz-box-link",
  "moz-button",
  "moz-box-group",
]);

export class SettingGroup extends SettingElement {
  constructor() {
    super();

    /**
     * @type {Preferences['getSetting'] | undefined}
     */
    this.getSetting = undefined;

    /**
     * @type {PreferencesSettingsConfig | undefined}
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
    let visibleControls = [...this.controlEls].filter(el => !el.hidden);
    if (!visibleControls.length) {
      this.hidden = true;
    } else {
      this.hidden = false;
    }
    // FIXME: We need to replace this.closest() once the SettingGroup
    // provides its own card wrapper/groupbox replacement element.
    let closestGroupbox = this.closest("groupbox");
    if (!closestGroupbox) {
      return;
    }
    if (this.hidden) {
      // Can't rely on .hidden for the toplevel groupbox because
      // of the pane hiding/showing code potentially changing the
      // hidden attribute.
      closestGroupbox.style.display = "none";
    } else {
      closestGroupbox.style.display = "";
    }
  }

  async getUpdateComplete() {
    let result = await super.getUpdateComplete();
    await Promise.all([...this.controlEls].map(el => el.updateComplete));
    return result;
  }

  /**
   * Notify child controls when their input has fired an event. When controls
   * are nested the parent receives events for the nested controls, so this is
   * actually easier to manage here; it also registers fewer listeners.
   */
  onChange(e) {
    let inputEl = e.target;
    let control = inputEl.control;
    control?.onChange(inputEl);
  }

  onClick(e) {
    if (!CLICK_HANDLERS.has(e.target.localName)) {
      return;
    }
    let inputEl = e.target;
    let control = inputEl.control;
    control?.onClick(e);
  }

  /**
   * @param {PreferencesSettingsConfig} item
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
