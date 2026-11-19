/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, ifDefined } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import-x/no-unassigned-import
import "chrome://browser/content/aiwindow/components/tab-group-icon.mjs";

/**
 * Three types of chips:
 * - source (default): used to display citations links across smart window
 * - in-line: used in the smartbar when typing "@" aka mentions
 * - context: used in the smartbar header, added via the + button
 *
 * @property {string} type - Type of chip: "source", "in-line" or "context"
 * @property {string} label - The text content of the chip
 * @property {string} iconSrc - Favicon or icon URL
 * @property {string} href - URL for the link
 * @property {string} itemRole - ARIA role for the inner element
 * @property {string} openLinkEvent - Event dispatched when a linked chip is
 * clicked. Each host opens links itself, so it names the event it listens for.
 * @property {boolean} isTabGroup - Whether the chip stands for a tab group, which has no
 * page and so shows a tab-group-icon instead of a favicon
 * @property {string} tabGroupColor - Tab group color name, tinting that icon
 * @property {string} tabGroupId - Id of the tab group to open when clicked
 * @property {boolean} removable - Whether the chip shows a remove button on hover - only
 * affects type context and source
 */
export class SmartwindowChip extends MozLitElement {
  // Forward focus to the inner element for keyboard navigation.
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    type: { type: String, reflect: true },
    label: { type: String },
    iconSrc: { type: String },
    href: { type: String },
    itemRole: { type: String },
    // Each host opens links itself, so it names the event it listens for.
    openLinkEvent: { type: String },
    isTabGroup: { type: Boolean },
    tabGroupColor: { type: String },
    tabGroupId: { type: String },
    removable: { type: Boolean, reflect: true },
  };

  #parentHost = null;

  constructor() {
    super();
    this.type = "source";
    this.label = "";
    this.iconSrc = "";
    this.href = "";
    this.itemRole = "";
    this.openLinkEvent = "AIChatContent:OpenLink";
    this.removable = false;
    this.isTabGroup = false;
    this.tabGroupColor = "";
    this.tabGroupId = "";
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
        new CustomEvent("smartwindow-chip:disconnected", {
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

  get #isInlineAndEmpty() {
    return this.type === "in-line" && !this.label;
  }

  get #isRemovableAndNotInline() {
    return this.type !== "in-line" && this.removable;
  }

  #handleClick() {
    if (this.isTabGroup && this.tabGroupId) {
      this.dispatchEvent(
        new CustomEvent("AIChatContent:OpenTabGroup", {
          bubbles: true,
          composed: true,
          detail: { groupId: this.tabGroupId },
        })
      );
    }
    this.dispatchEvent(
      new CustomEvent("smartwindow-chip:click", {
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
      new CustomEvent("smartwindow-chip:remove", {
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
      new CustomEvent(this.openLinkEvent, {
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

  #renderIcon() {
    if (this.#isInlineAndEmpty) {
      return html`<span class="chip-at">@</span>`;
    }

    if (this.isTabGroup) {
      return html`<tab-group-icon
        .label=${this.label}
        .color=${this.tabGroupColor}
      ></tab-group-icon>`;
    }

    return html`<img
      class="chip-icon"
      src=${this.iconSrc || "chrome://global/skin/icons/defaultFavicon.svg"}
      @error=${e => {
        e.target.src = "chrome://global/skin/icons/defaultFavicon.svg";
      }}
      alt=""
    />`;
  }

  #renderRemoveButton() {
    if (!this.#isRemovableAndNotInline) {
      return null;
    }

    return html`<button
      class="chip-remove"
      @click=${this.#handleRemove}
      data-l10n-id="aiwindow-website-chip-remove-button"
    >
      <img
        class="chip-remove-icon"
        src="chrome://global/skin/icons/close.svg"
        alt=""
      />
    </button>`;
  }

  #renderLabel() {
    if (this.#isInlineAndEmpty) {
      return html`<span
        class="chip-label"
        data-l10n-id="aiwindow-website-chip-placeholder"
      ></span>`;
    }

    return html`<span class="chip-label">${this.label}</span>`;
  }

  #renderChip() {
    const iconTemplate = this.#renderIcon();
    const removeButton = this.#renderRemoveButton();
    const labelTemplate = this.#renderLabel();
    const chipContent = html`
      ${iconTemplate} ${removeButton} ${labelTemplate}
    `;

    if (this.href) {
      return html`<a
        class="chip"
        part="chip"
        role=${ifDefined(this.itemRole || undefined)}
        href=${this.href}
        @click=${this.#handleAnchorClick}
      >
        ${chipContent}
      </a>`;
    }

    return html`<button
      class="chip"
      part="chip"
      role=${ifDefined(this.itemRole || undefined)}
      ?data-empty=${this.#isInlineAndEmpty}
      @click=${this.#handleClick}
    >
      ${chipContent}
    </button>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-chip.css"
      />
      ${this.#renderChip()}
    `;
  }
}

customElements.define("smartwindow-chip", SmartwindowChip);
