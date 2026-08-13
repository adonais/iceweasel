/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, ifDefined } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * A website chip component for tagging and displaying websites.
 *
 * Two types:
 * - in-line: Supports empty state with "@" symbol + "Tag a tab or site" placeholder
 *   - default: favicon + text
 *   - hover: favicon + text (identical to default)
 *   - empty: "@" symbol + "Tag a tab or site" text
 * - context-chip: No empty state support
 *   - default: favicon + text
 *   - hover (removable): remove button + text
 *   - hover (non-removable): favicon + text (identical to default)
 *
 * @property {string} type - Type of chip: "in-line" or "context-chip"
 * @property {"default" | "small"} size - Chip size
 * @property {string} label - The text content of the chip
 * @property {string} iconSrc - Favicon or icon URL
 * @property {string} href - URL for the link (used with context-chip type)
 * @property {boolean} removable - Whether the chip shows a remove button on hover (default false)
 * @property {string} itemRole - ARIA role for the inner element
 */
export class AIWebsiteChip extends MozLitElement {
  // Forward focus to the inner element for keyboard navigation.
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    type: { type: String, reflect: true },
    size: { type: String, reflect: true },
    label: { type: String },
    iconSrc: { type: String },
    href: { type: String },
    removable: { type: Boolean },
    itemRole: { type: String },
  };

  #parentHost = null;

  constructor() {
    super();
    this.type = "in-line";
    this.size = "default";
    this.label = "";
    this.iconSrc = "";
    this.href = "";
    this.removable = false;
    this.itemRole = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#parentHost = this.getRootNode()?.host;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Dispatch only when the parent is still connected: Chip was removed by
    // the user and not due to the parent unmounting.
    if (this.#parentHost?.isConnected) {
      this.#parentHost.dispatchEvent(
        new CustomEvent("ai-website-chip:disconnected", {
          bubbles: true,
          composed: true,
          detail: {
            label: this.label,
            type: this.type,
          },
        })
      );
    }
    this.#parentHost = null;
  }

  get #isEmpty() {
    return this.type === "in-line" && !this.label;
  }

  get #isRemovable() {
    return this.removable;
  }

  #handleClick() {
    this.dispatchEvent(
      new CustomEvent("ai-website-chip:click", {
        bubbles: true,
        composed: true,
        detail: { label: this.label },
      })
    );
  }

  #handleRemove(e) {
    e.stopPropagation();
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent("ai-website-chip:remove", {
        bubbles: true,
        composed: true,
        detail: { label: this.label },
      })
    );
  }

  #handleAnchorClick(e) {
    if (!this.href) {
      return;
    }
    e.preventDefault();
    const hasModifier =
      e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.button !== 0;

    this.dispatchEvent(
      new CustomEvent("AIChatContent:OpenLink", {
        bubbles: true,
        composed: true,
        detail: {
          url: this.href,
          preferSwitchToTab: !hasModifier,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          button: e.button,
        },
      })
    );
  }

  render() {
    const isEmpty = this.#isEmpty;
    const isRemovable = this.#isRemovable;

    let iconTemplate;
    if (isEmpty) {
      iconTemplate = html`<span class="chip-at">@</span>`;
    } else {
      iconTemplate = html`<img
        class="chip-icon"
        src=${this.iconSrc || "chrome://global/skin/icons/defaultFavicon.svg"}
        @error=${e => {
          e.target.src = "chrome://global/skin/icons/defaultFavicon.svg";
        }}
        alt=""
      />`;
    }

    const removeButton = isRemovable
      ? html`<button
          class="chip-remove"
          @click=${this.#handleRemove}
          data-l10n-id="aiwindow-website-chip-remove-button"
        >
          <img
            class="chip-remove-icon"
            src="chrome://global/skin/icons/close.svg"
            alt=""
          />
        </button>`
      : null;

    const labelTemplate = isEmpty
      ? html`<span
          class="chip-label"
          data-l10n-id="aiwindow-website-chip-placeholder"
        ></span>`
      : html`<span class="chip-label">${this.label}</span>`;

    const chipContent = html`
      ${iconTemplate} ${removeButton} ${labelTemplate}
    `;

    const chipElement = this.href
      ? html`<a
          class="chip"
          part="chip"
          role=${ifDefined(this.itemRole || undefined)}
          ?data-removable=${isRemovable}
          href=${this.href}
          @click=${this.#handleAnchorClick}
        >
          ${chipContent}
        </a>`
      : html`<button
          class="chip"
          part="chip"
          role=${ifDefined(this.itemRole || undefined)}
          ?data-empty=${isEmpty}
          ?data-removable=${isRemovable}
          @click=${this.#handleClick}
        >
          ${chipContent}
        </button>`;

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-website-chip.css"
      />
      ${chipElement}
    `;
  }
}

customElements.define("ai-website-chip", AIWebsiteChip);
