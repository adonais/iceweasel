/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-badge.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

export default class IPProtectionHeaderElement extends MozLitElement {
  static queries = {
    experimentBadgeEl: "#ipprotection-experiment-badge",
    helpButtonEl: "#ipprotection-help-button",
    titleEl: "#ipprotection-header-title",
  };

  static properties = {
    titleId: { type: String },
  };

  constructor() {
    super();
    this.titleId = "";
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleClickHelpButton() {
    this.dispatchEvent(
      new CustomEvent("IPProtection:ShowHelpPage", {
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-header.css"
      />
      <div id="ipprotection-header-wrapper">
        <span id="ipprotection-header-title-and-badge">
          <h1>
            <span
              id="ipprotection-header-title"
              data-l10n-id=${this.titleId}
            ></span>
          </h1>
          <moz-badge
            id="ipprotection-experiment-badge"
            data-l10n-id="ipprotection-experiment-badge"
          ></moz-badge>
        </span>
        <moz-button
          id="ipprotection-help-button"
          type="icon ghost"
          data-l10n-id="ipprotection-help-button"
          iconSrc="chrome://global/skin/icons/help.svg"
          @click=${this.handleClickHelpButton}
          tabindex="0"
        ></moz-button>
      </div>
    `;
  }
}

customElements.define("ipprotection-header", IPProtectionHeaderElement);
