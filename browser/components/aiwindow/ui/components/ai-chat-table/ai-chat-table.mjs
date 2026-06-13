/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * A custom element for rendering markdown tables in chat messages.
 */
export class AIChatTable extends MozLitElement {
  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-table.css"
      />
      <div class="table-wrapper">
        <slot></slot>
      </div>
    `;
  }
}

customElements.define("ai-chat-table", AIChatTable);
