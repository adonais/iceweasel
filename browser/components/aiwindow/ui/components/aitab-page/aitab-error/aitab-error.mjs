/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Error component for the non-existent or unavailable pages for AITab
 *
 * @property {string} status - "unavailable" when no page is stored under the
 *   name, which is the only case the listed reasons describe, or "error".
 */
export class AITabError extends MozLitElement {
  static properties = {
    status: { type: String },
  };

  constructor() {
    super();
    this.status = "error";
  }

  #renderReasons() {
    if (this.status != "unavailable") {
      return nothing;
    }

    return html`
      <p class="aitab-error-intro" data-l10n-id="aitab-page-error-intro"></p>
      <ul class="aitab-error-reasons">
        <li data-l10n-id="aitab-page-error-reason-deleted"></li>
        <li data-l10n-id="aitab-page-error-reason-incorrect-link"></li>
        <li data-l10n-id="aitab-page-error-reason-shared-link"></li>
      </ul>
    `;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-base.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-error.css"
      />
      <main class="aitab-error">
        <div class="aitab-error-wrapper">
          <img
            class="aitab-error-image"
            src="chrome://browser/content/aiwindow/assets/aitab-error-kit.svg"
            alt=""
          />
          <div class="aitab-error-text-group" role="alert">
            <h1
              class="aitab-error-heading"
              data-l10n-id="aitab-page-error-heading"
            ></h1>
            ${this.#renderReasons()}
          </div>
        </div>
      </main>
    `;
  }
}

customElements.define("aitab-error", AITabError);
