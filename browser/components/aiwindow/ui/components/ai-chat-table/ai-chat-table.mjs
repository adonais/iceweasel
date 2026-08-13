/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * A custom element for rendering markdown tables in chat messages.
 *
 * @property {Array<number>} lineRange - [startLine, endLine] from the source markdown
 * @property {string} messageId - The ID of the parent message
 */
export class AIChatTable extends MozLitElement {
  static properties = {
    messageId: { type: String, attribute: "message-id" },
    lineRange: { type: Array, attribute: "data-line-range" },
    isOverflowing: { type: Boolean, state: true },
  };

  #scrollContainer = null;
  #resizeObserver = null;
  #observedTable = null;

  constructor() {
    super();
    this.isOverflowing = false;
  }

  firstUpdated() {
    this.#scrollContainer = this.renderRoot.querySelector(
      ".table-scroll-container"
    );
    this.#resizeObserver = new ResizeObserver(() => this.#updateOverflow());
    this.#resizeObserver.observe(this.#scrollContainer);
    this.#observeTable();
    this.#updateOverflow();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#scrollContainer = null;
    this.#observedTable = null;
  }

  #observeTable() {
    const table = this.querySelector("table");
    if (table === this.#observedTable) {
      return;
    }
    if (this.#observedTable) {
      this.#resizeObserver?.unobserve(this.#observedTable);
    }
    this.#observedTable = table;
    if (table) {
      this.#resizeObserver?.observe(table);
    }
  }

  #onSlotChange() {
    this.#observeTable();
    this.#updateOverflow();
  }

  #updateOverflow() {
    const container = this.#scrollContainer;
    if (!container) {
      return;
    }
    this.isOverflowing = container.scrollWidth - container.clientWidth > 1;
  }

  #handleCopyTable() {
    this.dispatchEvent(
      new CustomEvent("copy-table", {
        bubbles: true,
        composed: true,
        detail: {
          messageId: this.messageId,
          lineRange: this.lineRange,
        },
      })
    );
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-table.css"
      />
      <div class="table-wrapper">
        ${this.messageId && this.lineRange
          ? html`<moz-button
              data-l10n-id="aiwindow-copy-table"
              data-l10n-attrs="tooltiptext,aria-label"
              class="table-copy-button"
              type="ghost"
              size="small"
              iconsrc="chrome://global/skin/icons/edit-copy.svg"
              @click=${this.#handleCopyTable}
            ></moz-button>`
          : nothing}
        <div class="table-scroll-container">
          <slot @slotchange=${this.#onSlotChange}></slot>
        </div>
        ${this.isOverflowing
          ? html`<div class="table-scroll-indicator">
              <span
                class="table-scroll-indicator-label"
                data-l10n-id="aiwindow-table-scroll-indicator"
              ></span>
            </div>`
          : nothing}
      </div>
    `;
  }
}

customElements.define("ai-chat-table", AIChatTable);
