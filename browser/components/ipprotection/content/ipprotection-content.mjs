/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import {
  html,
  classMap,
  ifDefined,
} from "chrome://global/content/vendor/lit.all.mjs";
import {
  LINKS,
  ERRORS,
} from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

import {
  connectionTimer,
  defaultTimeValue,
} from "chrome://browser/content/ipprotection/ipprotection-timer.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-header.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-flag.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-message-bar.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-signedout.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-toggle.mjs";

/**
 * Custom element that implements a message bar and status card for IP protection.
 */
export default class IPProtectionContentElement extends MozLitElement {
  static queries = {
    headerEl: "ipprotection-header",
    signedOutEl: "ipprotection-signedout",
    messagebarEl: "ipprotection-message-bar",
    statusCardEl: "#status-card",
    animationEl: "#status-card-animation",
    connectionToggleEl: "#connection-toggle",
    locationEl: "#location-wrapper",
    upgradeEl: "#upgrade-vpn-content",
    activeSubscriptionEl: "#active-subscription-vpn-content",
    supportLinkEl: "#vpn-support-link",
  };

  static properties = {
    state: { type: Object, attribute: false },
    showAnimation: { type: Boolean, state: true },
    _showMessageBar: { type: Boolean, state: true },
    _messageDismissed: { type: Boolean, state: true },
    _enabled: { type: Boolean, state: true },
  };

  constructor() {
    super();

    this.state = {};

    this.keyListener = this.#keyListener.bind(this);
    this.messageBarListener = this.#messageBarListener.bind(this);
    this._showMessageBar = false;
    this._messageDismissed = false;
    this.showAnimation = false;
    this._enabled = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent("IPProtection:Init", { bubbles: true }));
    this.addEventListener("keydown", this.keyListener, { capture: true });
    this.addEventListener(
      "ipprotection-message-bar:user-dismissed",
      this.#messageBarListener
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener("keydown", this.keyListener, { capture: true });
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

    this._enabled = isEnabled;
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
      this.connectionToggleEl?.focus();
    }
  }

  #keyListener(event) {
    let keyCode = event.code;
    switch (keyCode) {
      case "ArrowUp":
      // Intentional fall-through
      case "ArrowDown": {
        event.stopPropagation();
        event.preventDefault();

        let direction =
          keyCode == "ArrowDown"
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

  #messageBarListener(event) {
    if (event.type === "ipprotection-message-bar:user-dismissed") {
      this._showMessageBar = false;
      this._messageDismissed = true;
      this.state.error = "";
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    // Set the toggle to the protection enabled state, if it hasn't just changed.
    if (!changedProperties.has("_enabled")) {
      this._enabled = this.state.isProtectionEnabled;
    }

    // Clear hiding messages and disable the toggle when if there is an error.
    if (this.state.error) {
      this._messageDismissed = false;
      this._enabled = false;
    }

    /**
     * Don't show animations until all elements are connected and layout is fully drawn.
     * This will allow us to best position our animation component with the globe icon
     * based on the most up to date status card dimensions.
     */
    if (this.state.isProtectionEnabled) {
      this.showAnimation = true;
    } else {
      this.showAnimation = false;
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

  descriptionTemplate() {
    return this.state.location
      ? html`
          <ipprotection-flag
            .location=${this.state.location}
          ></ipprotection-flag>
        `
      : null;
  }

  animationRingsTemplate() {
    return html` <div id="status-card-animation">
      <div id="animation-rings"></div>
    </div>`;
  }

  statusCardTemplate() {
    let protectionEnabled = this.state.isProtectionEnabled;
    const statusCardL10nId = protectionEnabled
      ? "ipprotection-connection-status-on"
      : "ipprotection-connection-status-off";
    const toggleL10nId = protectionEnabled
      ? "ipprotection-toggle-active"
      : "ipprotection-toggle-inactive";
    const statusIcon = protectionEnabled
      ? "chrome://browser/content/ipprotection/assets/ipprotection-connection-on.svg"
      : "chrome://browser/content/ipprotection/assets/ipprotection-connection-off.svg";

    let time = this.canShowConnectionTime
      ? connectionTimer(this.state.protectionEnabledSince)
      : defaultTimeValue;

    return html` <moz-box-group class="vpn-status-group">
      ${this.showAnimation ? this.animationRingsTemplate() : null}
      <moz-box-item
        id="status-card"
        class=${classMap({
          "is-enabled": this.state.isProtectionEnabled,
        })}
        layout="large-icon"
        iconsrc=${statusIcon}
        data-l10n-id=${statusCardL10nId}
        data-l10n-args=${time}
      >
        <moz-toggle
          id="connection-toggle"
          data-l10n-id=${toggleL10nId}
          @click=${this.handleToggleConnect}
          ?pressed=${ifDefined(this._enabled)}
          slot="actions"
        ></moz-toggle>
      </moz-box-item>
      <moz-box-item
        id="location-wrapper"
        class=${classMap({
          "is-enabled": this.state.isProtectionEnabled,
        })}
        iconsrc="chrome://global/skin/icons/info.svg"
        data-l10n-id="ipprotection-location-title"
        .description=${this.descriptionTemplate()}
      >
      </moz-box-item>
    </moz-box-group>`;
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
      <ipprotection-header titleId="ipprotection-title"></ipprotection-header>
      <hr />
      <div id="ipprotection-content-wrapper">${content}</div>
    `;
  }
}

customElements.define("ipprotection-content", IPProtectionContentElement);
