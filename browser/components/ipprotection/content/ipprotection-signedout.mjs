/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { LINKS } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

export default class IPProtectionSignedOutContentElement extends MozLitElement {
  static queries = {
    learnMoreLinkEl: "#learn-more-vpn-signed-out",
  };
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  constructor() {
    super();
  }

  handleSignIn() {
    this.dispatchEvent(
      new CustomEvent("IPProtection:SignIn", { bubbles: true, composed: true })
    );
    // Close the panel
    this.dispatchEvent(
      new CustomEvent("IPProtection:Close", { bubbles: true, composed: true })
    );
  }

  handleClickLearnMore(event) {
    const win = event.target.ownerGlobal;

    if (event.target === this.learnMoreLinkEl) {
      win.openWebLinkIn(LINKS.SUPPORT_URL, "tab");
      this.dispatchEvent(
        new CustomEvent("IPProtection:Close", { bubbles: true, composed: true })
      );
    }
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
        <h2 id="signed-out-vpn-title" data-l10n-id="signed-out-vpn-title"></h2>
        <p
          id="signed-out-vpn-message"
          data-l10n-id="signed-out-vpn-message"
          @click=${this.handleClickLearnMore}
        >
          <a
            id="learn-more-vpn-signed-out"
            data-l10n-name="learn-more-vpn-signed-out"
            href=${LINKS.SUPPORT_URL}
          >
          </a>
        </p>
        <moz-button
          id="sign-in-vpn"
          class="vpn-button"
          data-l10n-id="sign-in-vpn"
          type="primary"
          @click=${this.handleSignIn}
        ></moz-button>
      </div>
    `;
  }
}

customElements.define(
  "ipprotection-signedout",
  IPProtectionSignedOutContentElement
);
