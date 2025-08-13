/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";

export default class IPProtectionSignedOutContentElement extends MozLitElement {
  constructor() {
    super();
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-content.css"
      />
      <div id="signed-out-vpn-content">
        <img
          id="signed-out-vpn-img"
          src="chrome://browser/content/ipprotection/assets/ipprotection.svg"
          alt=""
        />
        <p id="signed-out-vpn-message" data-l10n-id="signed-out-vpn-message">
          <a
            data-l10n-name="learn-more-vpn-signed-out"
            is="moz-support-link"
            support-page="test"
          >
          </a>
        </p>
        <moz-button
          id="sign-in-vpn"
          data-l10n-id="sign-in-vpn"
          type="primary"
        ></moz-button>
      </div>
    `;
  }
}

customElements.define(
  "ipprotection-signedout",
  IPProtectionSignedOutContentElement
);
