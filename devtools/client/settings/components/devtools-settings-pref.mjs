/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// <reference path="./devtools-settings-pref.tagmap.d.ts" />

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { MozCheckbox } from "chrome://global/content/elements/moz-checkbox.mjs";

import { SettingChangedEvent } from "../events.mjs";

/** @import { PropertyDeclarations, PropertyValues } from "chrome://global/content/vendor/lit.all.mjs" */

/** Binds the controls it wraps to a pref. */
export class DevToolsSettingsPref extends MozLitElement {
  /** @satisfies {PropertyDeclarations} */
  static properties = {
    pref: { type: String },
    changeAction: { type: String, attribute: "change-action" },
    _errorMessage: { state: true },
  };

  constructor() {
    super();
    this.pref = "";
    /** @type {string | null} */
    this.changeAction = null;
    this._errorMessage = "";
  }

  /** @param {PropertyValues<this>} changedProperties */
  willUpdate(changedProperties) {
    if (!changedProperties.has("pref")) {
      return;
    }
    try {
      const checkbox = this.querySelector("moz-checkbox");
      if (checkbox === null) {
        return;
      }
      const checked = Services.prefs.getBoolPref(this.pref);
      checkbox.checked = checked;
      this._errorMessage = "";
    } catch (error) {
      this._errorMessage = `Unable to render setting for "${this.pref}".`;
      console.error(this._errorMessage, error);
    }
  }

  /** @param {Event} event */
  #checkboxChange = event => {
    const checkbox = event.target;
    if (!(checkbox instanceof MozCheckbox)) {
      return;
    }
    Services.prefs.setBoolPref(this.pref, checkbox.checked);
    if (this.changeAction) {
      this.dispatchEvent(
        new SettingChangedEvent({ action: this.changeAction })
      );
    }
  };

  render() {
    if (this._errorMessage) {
      return html`<p role="alert">${this._errorMessage}</p>`;
    }
    return html`<slot @change=${this.#checkboxChange}></slot>`;
  }
}

customElements.define("devtools-settings-pref", DevToolsSettingsPref);
