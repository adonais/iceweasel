/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-signedout.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-toggle.mjs";

const DEFAULT_TIME_CONNECTED = "00:00:00";

export default class IPProtectionContentElement extends MozLitElement {
  static queries = {
    statusCardEl: "#status-card",
    connectionTitleEl: "#connection-title",
    connectionToggleEl: "#connection-toggle",
    upgradeEl: "#upgrade-vpn-content",
  };

  static properties = {
    state: { type: Object },
  };

  constructor() {
    super();

    this.state = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent("IPProtection:Init", { bubbles: true }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleClickSupportLink() {
    this.dispatchEvent(
      new CustomEvent("IPProtection:Close", { bubbles: true })
    );
  }

  handleToggleConnect(event) {
    let isEnabled = event.target.pressed;

    if (isEnabled) {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserEnable", { bubbles: true })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserDisable", { bubbles: true })
      );
    }
  }

  handleUpgrade() {
    // TODO: Handle click of Upgrade button - Bug 1975317
  }

  statusCardTemplate() {
    const isEnabledClass = this.state.isProtectionEnabled ? "is-enabled" : "";
    const statusCardL10nId = this.state.isProtectionEnabled
      ? "ipprotection-connection-status-on"
      : "ipprotection-connection-status-off";
    const toggleL10nId = this.state.isProtectionEnabled
      ? "ipprotection-toggle-active"
      : "ipprotection-toggle-inactive";

    // TODO: update timer and its starting value according to the protectionEnabledSince property (Bug 1972460)
    const timeConnected = DEFAULT_TIME_CONNECTED;

    return html` <div id="status-card" class=${isEnabledClass}>
      <div id="connection-wrapper">
        <span id="connection-icon" class=${isEnabledClass}></span>
        <span id="connection-details-and-toggle">
          <div id="connection-details">
            <h3 id="connection-title" data-l10n-id=${statusCardL10nId}></h3>
            <span id="connection-time" class="text-deemphasized"
              >${timeConnected}</span
            >
          </div>
          <div>
            <moz-toggle
              id="connection-toggle"
              data-l10n-id=${toggleL10nId}
              @click=${this.handleToggleConnect}
              ?pressed=${this.state.isProtectionEnabled}
            ></moz-toggle>
          </div>
        </span>
      </div>
    </div>`;
  }

  mainContentTemplate() {
    // TODO: Update support-page with new SUMO link for Mozilla VPN - Bug 1975474
    if (!this.state.isSignedIn) {
      return html` <ipprotection-signedout></ipprotection-signedout> `;
    }
    return html`
      ${this.statusCardTemplate()}
      <div id="upgrade-vpn-content">
        <h2 id="upgrade-vpn-title" data-l10n-id="upgrade-vpn-title"></h2>
        <p
          id="upgrade-vpn-paragraph"
          data-l10n-id="upgrade-vpn-paragraph"
          @click=${this.handleClickSupportLink}
        >
          <a
            is="moz-support-link"
            data-l10n-name="learn-more-vpn"
            support-page="test"
          ></a>
        </p>
        <moz-button
          id="upgrade-vpn-button"
          @click=${this.handleUpgrade}
          type="secondary"
          data-l10n-id="upgrade-vpn-button"
        ></moz-button>
      </div>
    `;
  }

  render() {
    // TODO: Conditionally render post-upgrade subview within #ipprotection-content-wrapper - Bug 1973813
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-content.css"
      />
      <div id="ipprotection-content-wrapper">${this.mainContentTemplate()}</div>
    `;
  }
}

customElements.define("ipprotection-content", IPProtectionContentElement);
