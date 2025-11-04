/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * The widget for enabling password protection if the backup is not yet
 * encrypted.
 */
export default class PasswordRulesTooltip extends MozLitElement {
  static properties = {
    hasEmail: { type: Boolean },
    tooShort: { type: Boolean },
  };

  static get queries() {
    return {
      passwordRulesEl: "#password-rules-wrapper",
    };
  }

  constructor() {
    super();
    this.hasEmail = false;
    this.tooShort = false;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/backup/password-rules-tooltip.css"
      />
      <div id="password-rules-wrapper" aria-live="polite">
        <h2
          id="password-rules-header"
          data-l10n-id="password-rules-header"
        ></h2>
        <ul>
          <li class=${this.tooShort && "warning"}>
            <span
              data-l10n-id="password-rules-length-description"
              class="rule-description"
            ></span>
          </li>
          <li class=${this.hasEmail && "warning"}>
            <span
              data-l10n-id="password-rules-email-description"
              class="rule-description"
            ></span>
          </li>
        </ul>
      </div>
    `;
  }
}

customElements.define("password-rules-tooltip", PasswordRulesTooltip);
