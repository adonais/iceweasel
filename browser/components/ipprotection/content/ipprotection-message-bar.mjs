/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-message-bar.mjs";

export default class IPProtectionMessageBarElement extends MozLitElement {
  #MESSAGE_TYPE_MAP = new Map([
    ["generic-error", () => this.genericErrorTemplate()],
  ]);
  DISMISS_EVENT = "ipprotection-message-bar:user-dismissed";

  static queries = {
    mozMessageBarEl: "moz-message-bar",
  };

  static properties = {
    type: { type: String },
  };

  constructor() {
    super();

    this.handleDismiss = this.handleDismiss.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleDismiss() {
    // Dispatch an ipprotection specific dismiss event to wrapping components to notify them
    // when the message was actually dismissed.
    this.dispatchEvent(
      new CustomEvent(this.DISMISS_EVENT, { bubbles: true, composed: true })
    );
  }

  genericErrorTemplate() {
    return html`
      <moz-message-bar
        type="error"
        data-l10n-id="ipprotection-message-generic-error"
        dismissable
      >
      </moz-message-bar>
    `;
  }

  firstUpdated() {
    this.mozMessageBarEl.addEventListener(
      "message-bar:user-dismissed",
      this.handleDismiss,
      {
        once: true,
      }
    );
  }

  render() {
    let messageBarTemplate = this.#MESSAGE_TYPE_MAP.get(this.type)();

    if (!messageBarTemplate) {
      return null;
    }

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-header.css"
      />
      ${messageBarTemplate}
    `;
  }
}

customElements.define(
  "ipprotection-message-bar",
  IPProtectionMessageBarElement
);
