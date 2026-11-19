/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// <reference path="./devtools-settings.tagmap.d.ts" />

import {
  html,
  nothing,
  staticHtml,
  unsafeStatic,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

import { conditions, inventory } from "../inventory.mjs";

/**
 * @import { Setting, SettingSection } from "../types/inventory.d.ts"
 * @import { Toolbox } from "../types/toolbox.d.ts"
 */

/** Renders the settings inventory as nested binding elements and controls. */
export class DevToolsSettings extends MozLitElement {
  /** @type {Toolbox | null} */
  #toolbox = null;

  /** @param {Toolbox | null} toolbox */
  setToolbox(toolbox) {
    this.#toolbox = toolbox;
    this.requestUpdate();
  }

  /** @param {Setting} setting */
  #renderSetting(setting) {
    const toolbox = this.#toolbox;
    if (!toolbox) {
      return nothing;
    }
    const disabled =
      "disabled" in setting && setting.disabled
        ? conditions[setting.disabled]({ toolbox, setting })
        : false;
    if ("pref" in setting) {
      return html`
        <devtools-settings-pref
          pref=${setting.pref}
          change-action=${setting.changeAction ?? nothing}
        >
          ${this.#renderControl(setting, disabled)}
        </devtools-settings-pref>
      `;
    }
    return this.#renderControl(setting, disabled);
  }

  /**
   * @param {Setting} setting
   * @param {boolean} disabled
   */
  #renderControl(setting, disabled) {
    const { type } = setting;
    switch (type) {
      case "boolean":
        return html`
          <moz-checkbox
            id=${setting.id}
            data-l10n-id=${setting.l10nId}
            .disabled=${disabled}
          >
            ${disabled && setting.disabledL10nId
              ? html`<span
                  slot="description"
                  data-l10n-id=${setting.disabledL10nId}
                ></span>`
              : nothing}
          </moz-checkbox>
        `;
      case "select":
        return html`
          <moz-select
            id=${setting.id}
            data-l10n-id=${setting.l10nId}
            .disabled=${disabled}
          >
            ${setting.options.map(
              option => html`
                <moz-option
                  value=${option.value}
                  data-l10n-id=${option.l10nId ?? nothing}
                  label=${option.l10nId ? nothing : option.value}
                ></moz-option>
              `
            )}
          </moz-select>
        `;
      case "custom-element": {
        const tag = unsafeStatic(setting.element);
        return staticHtml`<${tag}
          id=${setting.id}
          l10n-id=${setting.l10nId ?? nothing}
          .toolbox=${this.#toolbox}
        ></${tag}>`;
      }
      default:
        throw new Error(`Unsupported setting type "${type}".`);
    }
  }

  /** @param {SettingSection} section */
  #renderSection(section) {
    const toolbox = this.#toolbox;
    if (!toolbox) {
      return nothing;
    }
    const settings = [];
    for (const setting of section.settings) {
      if (setting.hidden && conditions[setting.hidden]({ toolbox, setting })) {
        continue;
      }
      settings.push(this.#renderSetting(setting));
    }
    return html`
      <moz-fieldset id=${section.id} data-l10n-id=${section.l10nId}>
        ${settings}
      </moz-fieldset>
    `;
  }

  render() {
    if (!this.#toolbox) {
      return nothing;
    }
    return html`
      <link
        rel="stylesheet"
        href="resource://devtools/client/settings/components/devtools-settings.css"
      />
      ${inventory.map(section => this.#renderSection(section))}
    `;
  }
}

customElements.define("devtools-settings", DevToolsSettings);
