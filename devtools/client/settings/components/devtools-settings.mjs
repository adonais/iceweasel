/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// <reference path="./devtools-settings.tagmap.d.ts" />

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

import { inventory } from "../inventory.mjs";

/**
 * @import { Setting, SettingSection } from "../types/inventory.d.ts"
 */

/** Renders the settings inventory as nested binding elements and controls. */
export class DevToolsSettings extends MozLitElement {
  /** @param {Setting} setting */
  #renderSetting(setting) {
    switch (setting.type) {
      case "boolean":
        return html`
          <devtools-settings-pref
            pref=${setting.pref}
            change-action=${setting.changeAction ?? nothing}
          >
            <moz-checkbox
              id=${setting.id}
              data-l10n-id=${setting.l10nId}
            ></moz-checkbox>
          </devtools-settings-pref>
        `;
      default:
        throw new Error(`Unsupported setting type "${setting.type}".`);
    }
  }

  /** @param {SettingSection} section */
  #renderSection(section) {
    return html`
      <moz-fieldset id=${section.id} data-l10n-id=${section.l10nId}>
        ${section.settings.map(setting => this.#renderSetting(setting))}
      </moz-fieldset>
    `;
  }

  render() {
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
