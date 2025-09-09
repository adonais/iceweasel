/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { FLAGS } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

export default class IPProtectionFlagElement extends MozLitElement {
  static properties = {
    location: { type: Object },
    _iconSrc: { type: String, state: true },
    _name: { type: String, state: true },
  };

  constructor() {
    super();
  }

  get #hasValidLocation() {
    return this.location && this.location.name && this.location.code;
  }

  #getFlagIcon() {
    const iconName = this.location.code;

    if (!Object.hasOwn(FLAGS, iconName)) {
      return null;
    }

    return FLAGS[iconName];
  }

  locationDescriptionTemplate() {
    return html`
      <img id="location-icon" src=${this._iconSrc} />
      <span id="location-name">${this._name}</span>
    `;
  }

  render() {
    if (!this.#hasValidLocation) {
      return null;
    }

    this._name = this.location.name;
    this._iconSrc = this.#getFlagIcon();

    let locationDescription = this._iconSrc
      ? this.locationDescriptionTemplate()
      : null;

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-flag.css"
      />
      <div id="flag-wrapper">${locationDescription}</div>
    `;
  }
}

customElements.define("ipprotection-flag", IPProtectionFlagElement);
