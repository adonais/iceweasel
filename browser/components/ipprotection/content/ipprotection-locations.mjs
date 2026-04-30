/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/locations-list.mjs";

/**
 * A custom element that wraps the locations content.
 */
export default class IPProtectionLocationsElement extends MozLitElement {
  static properties = {
    state: { type: Object, attribute: false },
  };

  constructor() {
    super();
    this.state = {};
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent("IPProtection:Init", { bubbles: true }));
  }

  render() {
    if (!this.state.location && !this.state.locationsList) {
      return null;
    }
    return html`<locations-list
      .selectedLocation=${this.state.location}
      .locations=${this.state.locationsList}
    ></locations-list>`;
  }
}

customElements.define("ipprotection-locations", IPProtectionLocationsElement);
