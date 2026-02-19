/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-chat-search-button.mjs";

/**
 * A custom element for managing AI Chat Content
 */
export class AIChatMessage extends MozLitElement {
  /**
   * @member {object} message - {role:"user"|"assistant" , content: string}
   */

  static properties = {
    role: { type: String },
    message: { type: String },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener(
      "AIWindow:chat-search",
      this.handleSearchHandoffEvent.bind(this)
    );
  }

  /**
   * Handle search handoff events
   *
   * @param {CustomEvent} event - The custom event containing the search query.
   */
  handleSearchHandoffEvent(event) {
    const e = new CustomEvent("AIChatContent:DispatchSearch", {
      detail: event.detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(e);
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-message.css"
      />

      <article>
        <div class=${`message-${this.role}`}>
          <!-- TODO: Add markdown parsing here -->
          ${this.message}
        </div>
        <!-- TODO: update props based on assistant response -->
        <ai-chat-search-button
          query="Ada Lovelace"
          label="Ada Lovelace"
        ></ai-chat-search-button>
      </article>
    `;
  }
}

customElements.define("ai-chat-message", AIChatMessage);
