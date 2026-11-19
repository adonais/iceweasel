/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// <reference path="./devtools-settings-disable-javascript.tagmap.d.ts" />

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { MozCheckbox } from "chrome://global/content/elements/moz-checkbox.mjs";

/**
 * @import { PropertyDeclarations, PropertyValues } from "chrome://global/content/vendor/lit.all.mjs"
 * @import { Toolbox } from "../types/toolbox.d.ts"
 */

/** Toggles whether JavaScript is disabled in the debugged tab. */
export class DevToolsSettingsDisableJavascript extends MozLitElement {
  /** @satisfies {PropertyDeclarations} */
  static properties = {
    toolbox: { type: Object, attribute: false },
    l10nId: { type: String, attribute: "l10n-id" },
    _javascriptEnabled: { type: Boolean, state: true },
  };

  constructor() {
    super();
    /** @type {Toolbox | null} */
    this.toolbox = null;
    /** @type {string | null} */
    this.l10nId = null;
    /** @type {boolean | undefined} */
    this._javascriptEnabled = undefined;
  }

  /** @param {PropertyValues<this>} changedProperties */
  willUpdate(changedProperties) {
    if (changedProperties.has("toolbox") && this.toolbox) {
      this.#readConfiguration(this.toolbox);
    }
  }

  /** @param {Toolbox} toolbox */
  async #readConfiguration(toolbox) {
    try {
      this._javascriptEnabled =
        await toolbox.commands.targetConfigurationCommand.isJavascriptEnabled();
    } catch (error) {
      if (!toolbox.isDestroying()) {
        throw error;
      }
    }
  }

  /** @param {Event} event */
  #checkboxChange = event => {
    const checkbox = event.target;
    if (!(checkbox instanceof MozCheckbox) || !this.toolbox) {
      return;
    }
    this._javascriptEnabled = !checkbox.checked;
    this.toolbox.commands.targetConfigurationCommand.updateConfiguration({
      javascriptEnabled: this._javascriptEnabled,
    });
  };

  render() {
    return html`<moz-checkbox
      data-l10n-id=${this.l10nId ?? nothing}
      ?checked=${this._javascriptEnabled === false}
      ?disabled=${this._javascriptEnabled === undefined}
      @change=${this.#checkboxChange}
    ></moz-checkbox>`;
  }
}

customElements.define(
  "devtools-settings-disable-javascript",
  DevToolsSettingsDisableJavascript
);
