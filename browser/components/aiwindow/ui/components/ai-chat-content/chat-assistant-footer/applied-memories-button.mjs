/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";

/**
 * AppliedMemoriesButton
 *
 * TODO: Currently using placeholder "Highlights" icon which will be replaced
 * with the memories icon once ready
 *
 * Custom element that renders the “Memories applied” pill and popover for
 * a single assistant message. The popover shows a list of applied
 * memories and allows the user to:
 *   - Remove an individual applied insight.
 *   - Retry the message without any applied memories.
 *
 * @property {string|null} messageId
 *   Identifier for the assistant message this control belongs to.
 *
 * @property {Array<object>} appliedMemories
 *   List of applied memories for the message. The component will render up
 *   to the first 5 items in the popover.
 *
 * @property {boolean} open
 *   Whether the popover is currently open. This is typically controlled
 *   internally when the button is clicked and also reflected via the
 *   "toggle-applied-memories" event.
 *
 * Events dispatched:
 *   - "toggle-applied-memories"
 *       detail: { messageId, open }
 *   - "remove-applied-memory"
 *       detail: { messageId, index, insight }
 *   - "retry-without-memories"
 *       detail: { messageId }
 */
export class AppliedMemoriesButton extends MozLitElement {
  static properties = {
    messageId: { type: String, attribute: "message-id" },
    appliedMemories: { attribute: false },
    open: { type: Boolean, reflect: false },
  };

  constructor() {
    super();
    this.messageId = null;
    this.appliedMemories = [];
    this.open = false;

    this._onDocumentClick = this._onDocumentClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this._onDocumentClick);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this._onDocumentClick);
    super.disconnectedCallback();
  }

  get _hasMemories() {
    return Array.isArray(this.appliedMemories) && !!this.appliedMemories.length;
  }

  get _visibleMemories() {
    return this.appliedMemories.slice(0, 5);
  }

  #onTriggerClick(event) {
    event.stopPropagation();
    if (!this._hasMemories) {
      return;
    }

    this.open = !this.open;
    this.toggleAttribute("data-open", this.open);

    this.dispatchEvent(
      new CustomEvent("toggle-applied-memories", {
        bubbles: true,
        composed: true,
        detail: {
          messageId: this.messageId,
          open: this.open,
        },
      })
    );
  }

  _onPopoverClick(event) {
    event.stopPropagation();
  }

  _onDocumentClick() {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.toggleAttribute("data-open", false);
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent("toggle-applied-memories", {
        bubbles: true,
        composed: true,
        detail: {
          messageId: this.messageId,
          open: false,
        },
      })
    );
  }

  _onRemoveInsight(event, index) {
    event.stopPropagation();

    if (!Array.isArray(this.appliedMemories)) {
      return;
    }

    const insight = this.appliedMemories[index];

    // Remove insight visually, but update will be done by parent
    this.appliedMemories = this.appliedMemories.filter((_, i) => {
      return i !== index;
    });

    this.dispatchEvent(
      new CustomEvent("remove-applied-memory", {
        bubbles: true,
        composed: true,
        detail: {
          messageId: this.messageId,
          index,
          insight,
        },
      })
    );
  }

  _onRetryWithoutMemories(event) {
    event.stopPropagation();

    this.dispatchEvent(
      new CustomEvent("retry-without-memories", {
        bubbles: true,
        composed: true,
        detail: {
          messageId: this.messageId,
        },
      })
    );
  }

  // TODO: Update formatting function once shape of memories passed is confirmed
  _formatInsightLabel(insight) {
    if (typeof insight === "string") {
      return insight;
    }
    return "";
  }

  renderPopover() {
    if (!this._hasMemories) {
      return nothing;
    }

    const isOpen = this.open;
    const visibleMemories = this._visibleMemories;

    return html`
      <div
        class="popover ${isOpen ? "open" : ""}"
        role="region"
        aria-hidden=${!isOpen}
        @click=${event => this._onPopoverClick(event)}
      >
        <ul class="memories-list">
          ${visibleMemories.map((insight, index) => {
            const label = this._formatInsightLabel(insight);
            if (!label) {
              return nothing;
            }
            return html`
              <li class="memories-list-item">
                <span class="memories-list-label">${label}</span>
                <moz-button
                  class="memories-remove-button"
                  type="ghost"
                  size="small"
                  iconsrc="chrome://global/skin/icons/close.svg"
                  aria-label="Remove this insight"
                  @click=${event => this._onRemoveInsight(event, index)}
                ></moz-button>
              </li>
            `;
          })}
        </ul>

        <div class="retry-row">
          <moz-button
            type="ghost"
            size="default"
            iconsrc="chrome://global/skin/icons/reload.svg"
            iconposition="start"
            class="retry-row-button"
            data-l10n-id="aiwindow-retry-without-memories"
            data-l10n-attrs="label"
          ></moz-button>
        </div>
      </div>
    `;
  }

  render() {
    if (!this._hasMemories) {
      return null;
    }

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/applied-memories-button.css"
      />
      <moz-button
        class="memories-trigger"
        type="ghost"
        size="small"
        iconposition="start"
        iconsrc="chrome://global/skin/icons/highlights.svg"
        aria-haspopup="dialog"
        aria-expanded=${this.open && this._hasMemories}
        data-l10n-id="aiwindow-memories-used"
        data-l10n-attrs="label"
        @click=${event => this.#onTriggerClick(event)}
      ></moz-button>

      ${this.renderPopover()}
    `;
  }
}

customElements.define("applied-memories-button", AppliedMemoriesButton);
