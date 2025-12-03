/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, classMap } from "chrome://global/content/vendor/lit.all.mjs";

/**
 * Custom element that implements a button for site settings in the panel.
 */
export default class IPPSiteSettingsControl extends MozLitElement {
  CLICK_EVENT = "ipprotection-site-settings-control:click";

  static properties = {
    site: { type: String },
    exceptionEnabled: { type: Boolean },
  };

  constructor() {
    super();

    this.site = null;
    this.exceptionEnabled = false;
  }

  get iconsrc() {
    if (!this.exceptionEnabled) {
      return "chrome://global/skin/icons/close-fill.svg";
    }
    return "chrome://global/skin/icons/check-filled.svg";
  }

  get descriptionL10n() {
    if (!this.exceptionEnabled) {
      return "ipprotection-site-settings-button-vpn-off";
    }
    return "ipprotection-site-settings-button-vpn-on";
  }

  handleClickSettings(event) {
    event.preventDefault();

    this.dispatchEvent(
      new CustomEvent(this.CLICK_EVENT, {
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.site) {
      return null;
    }

    let icon = this.iconsrc;
    let descriptionL10n = this.descriptionL10n;
    let l10nArgs = JSON.stringify({ sitename: this.site });

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-site-settings-control.css"
      />
      <moz-box-group>
        <moz-box-item
          slot="header"
          id="site-settings-label"
          class="site-settings"
          data-l10n-id="ipprotection-site-settings-control"
        ></moz-box-item>
        <moz-box-button
          @click=${this.handleClickSettings}
          class=${classMap({
            "site-settings": true,
            "exception-enabled": this.exceptionEnabled,
          })}
          data-l10n-id=${descriptionL10n}
          data-l10n-args=${l10nArgs}
          iconsrc=${icon}
        ></moz-box-button>
      </moz-box-group>
    `;
  }
}

customElements.define(
  "ipprotection-site-settings-control",
  IPPSiteSettingsControl
);
