/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import {
  html,
  classMap,
  styleMap,
} from "chrome://global/content/vendor/lit.all.mjs";
import {
  connectionTimer,
  defaultTimeValue,
} from "chrome://browser/content/ipprotection/ipprotection-timer.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-toggle.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-site-settings-control.mjs";

/**
 * Custom element that implements a status card for IP protection.
 */
export default class IPProtectionStatusCard extends MozLitElement {
  TOGGLE_ON_EVENT = "ipprotection-status-card:user-toggled-on";
  TOGGLE_OFF_EVENT = "ipprotection-status-card:user-toggled-off";

  static queries = {
    statusGroupEl: "#status-card",
    connectionToggleEl: "#connection-toggle",
    locationEl: "#location-wrapper",
    siteSettingsEl: "ipprotection-site-settings-control",
  };

  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    protectionEnabled: { type: Boolean },
    canShowTime: { type: Boolean },
    enabledSince: { type: Object },
    location: { type: Object },
    siteData: { type: Object },
    // Track toggle state separately so that we can tell when the toggle
    // is enabled because of the existing protection state or because of user action.
    _toggleEnabled: { type: Boolean, state: true },
  };

  constructor() {
    super();

    this.keyListener = this.#keyListener.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent("IPProtection:Init", { bubbles: true }));
    this.addEventListener("keydown", this.keyListener, { capture: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener("keydown", this.keyListener, { capture: true });
  }

  handleToggleConnect(event) {
    let isEnabled = event.target.pressed;

    if (isEnabled) {
      this.dispatchEvent(
        new CustomEvent(this.TOGGLE_ON_EVENT, {
          bubbles: true,
          composed: true,
        })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent(this.TOGGLE_OFF_EVENT, {
          bubbles: true,
          composed: true,
        })
      );
    }

    this._toggleEnabled = isEnabled;
  }

  focus() {
    this.connectionToggleEl?.focus();
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

  updated(changedProperties) {
    super.updated(changedProperties);

    // If the toggle state isn't set, do so now and let it
    // match the protection state.
    if (!changedProperties.has("_toggleEnabled")) {
      this._toggleEnabled = this.protectionEnabled;
    }

    if (!this.protectionEnabled && this._toggleEnabled) {
      // After pressing the toggle, if somehow protection was turned off
      // (eg. error thrown), unset the toggle.
      this._toggleEnabled = false;
    }
  }

  cardContentTemplate() {
    const statusCardL10nId = this.protectionEnabled
      ? "ipprotection-connection-status-on"
      : "ipprotection-connection-status-off";
    const toggleL10nId = this.protectionEnabled
      ? "ipprotection-toggle-active"
      : "ipprotection-toggle-inactive";

    const siteSettingsTemplate = this.protectionEnabled
      ? this.siteSettingsTemplate()
      : null;

    return html` <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-status-card.css"
      />
      <moz-box-group class="vpn-status-group">
        <moz-box-item
          id="status-card"
          class=${classMap({
            "is-enabled": this.protectionEnabled,
          })}
          layout="default"
          data-l10n-id=${statusCardL10nId}
          .description=${this.cardDescriptionTemplate()}
        >
          <moz-toggle
            id="connection-toggle"
            data-l10n-id=${toggleL10nId}
            @click=${this.handleToggleConnect}
            ?pressed=${this._toggleEnabled}
            slot="actions"
          ></moz-toggle>
        </moz-box-item>
        ${siteSettingsTemplate}
      </moz-box-group>`;
  }

  siteSettingsTemplate() {
    // TODO: Once we're able to detect the current site and its exception status, show
    // ipprotection-site-settings-control (Bug 1997412).
    if (!this.siteData?.siteName) {
      return null;
    }

    return html` <moz-box-item
      id="site-settings"
      class=${classMap({
        "is-enabled": this.protectionEnabled,
      })}
    >
      <ipprotection-site-settings-control
        .site=${this.siteData.siteName}
        .exceptionEnabled=${this.siteData.isException}
        class="slotted"
      ></ipprotection-site-settings-control>
    </moz-box-item>`;
  }

  cardDescriptionTemplate() {
    // The template consists of location name and connection time.
    let time = this.canShowTime
      ? connectionTimer(this.enabledSince)
      : defaultTimeValue;

    // To work around mox-box-item description elements being hard to reach because of the shadowDOM,
    // let's use a lit stylemap to apply style changes directly.
    let labelStyles = styleMap({
      display: "flex",
      gap: "var(--space-small)",
    });
    let imgStyles = styleMap({
      "-moz-context-properties": "fill",
      fill: "currentColor",
    });

    return this.location
      ? html`
          <div id="vpn-details">
            <div
              id="location-label"
              data-l10n-id="ipprotection-location-title"
              style=${labelStyles}
            >
              <span>${this.location.name}</span>
              <img
                src="chrome://global/skin/icons/info.svg"
                style=${imgStyles}
              />
            </div>
            <span
              id="time"
              data-l10n-id="ipprotection-connection-time"
              data-l10n-args=${time}
            ></span>
          </div>
        `
      : null;
  }

  render() {
    let content = this.cardContentTemplate();
    return html`${content}`;
  }
}

customElements.define("ipprotection-status-card", IPProtectionStatusCard);
