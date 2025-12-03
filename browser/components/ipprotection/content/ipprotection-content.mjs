/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, ifDefined } from "chrome://global/content/vendor/lit.all.mjs";
import {
  LINKS,
  ERRORS,
} from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-message-bar.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-signedout.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-status-card.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-toggle.mjs";

/**
 * Custom element that implements a message bar and status card for IP protection.
 */
export default class IPProtectionContentElement extends MozLitElement {
  static queries = {
    signedOutEl: "ipprotection-signedout",
    messagebarEl: "ipprotection-message-bar",
    statusCardEl: "ipprotection-status-card",
    upgradeEl: "#upgrade-vpn-content",
    activeSubscriptionEl: "#active-subscription-vpn-content",
    supportLinkEl: "#vpn-support-link",
  };

  static properties = {
    state: { type: Object, attribute: false },
    _showMessageBar: { type: Boolean, state: true },
    _messageDismissed: { type: Boolean, state: true },
  };

  constructor() {
    super();

    this.state = {};

    this.keyListener = this.#keyListener.bind(this);
    this.messageBarListener = this.#messageBarListener.bind(this);
    this.statusCardListener = this.#statusCardListener.bind(this);
    this._showMessageBar = false;
    this._messageDismissed = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent("IPProtection:Init", { bubbles: true }));
    this.addEventListener("keydown", this.keyListener, { capture: true });
    this.addEventListener(
      "ipprotection-status-card:user-toggled-on",
      this.#statusCardListener
    );
    this.addEventListener(
      "ipprotection-status-card:user-toggled-off",
      this.#statusCardListener
    );
    this.addEventListener(
      "ipprotection-site-settings-control:click",
      this.#statusCardListener
    );
    this.addEventListener(
      "ipprotection-message-bar:user-dismissed",
      this.#messageBarListener
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener("keydown", this.keyListener, { capture: true });
    this.removeEventListener(
      "ipprotection-status-card:user-toggled-on",
      this.#statusCardListener
    );
    this.removeEventListener(
      "ipprotection-status-card:user-toggled-off",
      this.#statusCardListener
    );
    this.removeEventListener(
      "ipprotection-site-settings-control:click",
      this.#statusCardListener
    );
    this.removeEventListener(
      "ipprotection-message-bar:user-dismissed",
      this.#messageBarListener
    );
  }

  get canShowConnectionTime() {
    return (
      this.state &&
      this.state.isProtectionEnabled &&
      this.state.protectionEnabledSince &&
      !this.state.isSignedOut
    );
  }

  get canEnableConnection() {
    return this.state && this.state.isProtectionEnabled && !this.state.error;
  }

  get #hasErrors() {
    return !this.state || this.state.error !== "";
  }

  handleClickSupportLink(event) {
    const win = event.target.ownerGlobal;

    if (event.target === this.supportLinkEl) {
      event.preventDefault();
      win.openWebLinkIn(LINKS.PRODUCT_URL, "tab");
      this.dispatchEvent(
        new CustomEvent("IPProtection:Close", { bubbles: true })
      );
    }
  }

  handleUpgrade(event) {
    const win = event.target.ownerGlobal;
    win.openWebLinkIn(LINKS.PRODUCT_URL + "#pricing", "tab");
    // Close the panel
    this.dispatchEvent(
      new CustomEvent("IPProtection:ClickUpgrade", { bubbles: true })
    );

    Glean.ipprotection.clickUpgradeButton.record();
  }

  focus() {
    if (this.state.isSignedOut) {
      this.signedOutEl?.focus();
    } else {
      this.statusCardEl?.focus();
    }
  }

  #keyListener(event) {
    let keyCode = event.code;
    switch (keyCode) {
      case "Tab":
      case "ArrowUp":
      // Intentional fall-through
      case "ArrowDown": {
        event.stopPropagation();
        event.preventDefault();

        let isForward =
          (keyCode == "Tab" && !event.shiftKey) || keyCode == "ArrowDown";
        let direction = isForward
          ? Services.focus.MOVEFOCUS_FORWARD
          : Services.focus.MOVEFOCUS_BACKWARD;
        Services.focus.moveFocus(
          window,
          null,
          direction,
          Services.focus.FLAG_BYKEY
        );
        break;
      }
    }
  }

  #statusCardListener(event) {
    if (event.type === "ipprotection-status-card:user-toggled-on") {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserEnable", { bubbles: true })
      );
    } else if (event.type === "ipprotection-status-card:user-toggled-off") {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserDisable", { bubbles: true })
      );
    } else if (event.type === "ipprotection-site-settings-control:click") {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserShowSiteSettings", { bubbles: true })
      );
    }
  }

  #messageBarListener(event) {
    if (event.type === "ipprotection-message-bar:user-dismissed") {
      this._showMessageBar = false;
      this._messageDismissed = true;
      this.state.error = "";
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    // Clear messages when there is an error.
    if (this.state.error) {
      this._messageDismissed = false;
    }
  }

  messageBarTemplate() {
    // Fallback to a generic error
    return html`
      <ipprotection-message-bar
        class="vpn-top-content"
        type=${ERRORS.GENERIC}
      ></ipprotection-message-bar>
    `;
  }

  statusCardTemplate() {
    // TODO: Pass site information to status-card to conditionally
    // render the site settings control. (Bug 1997412)
    return html`
      <ipprotection-status-card
        .protectionEnabled=${this.canEnableConnection}
        .canShowTime=${this.canShowConnectionTime}
        .enabledSince=${this.state.protectionEnabledSince}
        .location=${this.state.location}
        .siteData=${ifDefined(this.state.siteData)}
      ></ipprotection-status-card>
    `;
  }

  beforeUpgradeTemplate() {
    return html`
      <div id="upgrade-vpn-content" class="vpn-bottom-content">
        <h2
          id="upgrade-vpn-title"
          data-l10n-id="upgrade-vpn-title"
          class="vpn-subtitle"
        ></h2>
        <p
          id="upgrade-vpn-paragraph"
          data-l10n-id="upgrade-vpn-paragraph"
          @click=${this.handleClickSupportLink}
        >
          <a
            id="vpn-support-link"
            href=${LINKS.PRODUCT_URL}
            data-l10n-name="learn-more-vpn"
          ></a>
        </p>
        <moz-button
          id="upgrade-vpn-button"
          class="vpn-button"
          @click=${this.handleUpgrade}
          type="secondary"
          data-l10n-id="upgrade-vpn-button"
        ></moz-button>
      </div>
    `;
  }

  mainContentTemplate() {
    // TODO: Update support-page with new SUMO link for Mozilla VPN - Bug 1975474
    if (this.state.isSignedOut) {
      return html` <ipprotection-signedout></ipprotection-signedout> `;
    }
    return html`
      ${this.statusCardTemplate()}
      ${!this.state.hasUpgraded ? this.beforeUpgradeTemplate() : null}
    `;
  }

  render() {
    if (this.#hasErrors && !this._messageDismissed) {
      this._showMessageBar = true;
    }

    const messageBar = this._showMessageBar ? this.messageBarTemplate() : null;
    const content = html`${messageBar}${this.mainContentTemplate()}`;

    // TODO: Conditionally render post-upgrade subview within #ipprotection-content-wrapper - Bug 1973813
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-content.css"
      />
      <div id="ipprotection-content-wrapper">${content}</div>
    `;
  }
}

customElements.define("ipprotection-content", IPProtectionContentElement);
