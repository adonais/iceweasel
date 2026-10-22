/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { CONTEXT_MENTION_TYPE } from "chrome://browser/content/urlbar/SmartbarMentionUtils.mjs";
import { html, repeat } from "chrome://global/content/vendor/lit.all.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/smartwindow-panel-list.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/tab-group-icon.mjs";

/**
 * Container for rendering 3 or more grouped chips inside the chat content
 */
export class AIGroupedChipContainer extends MozLitElement {
  static properties = {
    chips: { type: Array },
    // Each host opens links itself, so it names the event it listens for.
    openLinkEvent: { type: String },
    isPanelOpen: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.chips = [];
    this.openLinkEvent = "AIChatContent:OpenLink";
    this.isPanelOpen = false;
  }

  // Keep this mousedown from reaching panel-list's document-level light-dismiss
  // listener, so the panel stays open until the click handler runs toggle().
  // Otherwise mousedown closes it and the click reopens it.
  #onTriggerMousedown(event) {
    event.stopPropagation();
  }

  #toggleGroupedPanel(event) {
    const panel = this.shadowRoot.querySelector("smartwindow-panel-list");
    panel.anchor = event.currentTarget;
    panel.toggle();
  }

  #closeGroupedPanel() {
    this.shadowRoot.querySelector("smartwindow-panel-list")?.hide();
  }

  #onItemSelected(event) {
    const url = event.detail?.id;
    if (url) {
      this.dispatchEvent(
        new CustomEvent(this.openLinkEvent, {
          bubbles: true,
          composed: true,
          detail: { url, preferSwitchToTab: true },
        })
      );
    }
    this.#closeGroupedPanel();
  }

  // A tab group has no favicon, so it gets an icon in its color.
  #renderStackedIcon(chip) {
    if (chip.type == CONTEXT_MENTION_TYPE.TAB_GROUP) {
      return html`<tab-group-icon
        class="grouped-chips__stacked-icon"
        .label=${chip.label}
        .color=${chip.color}
      ></tab-group-icon>`;
    }

    return html`<img
      class="grouped-chips__favicon"
      src=${chip.iconSrc || "chrome://global/skin/icons/defaultFavicon.svg"}
      alt=""
      @error=${e => {
        e.target.src = "chrome://global/skin/icons/defaultFavicon.svg";
      }}
    />`;
  }

  render() {
    const chipsGroups = [
      {
        items: this.chips.map(w => ({
          id: w.url,
          type: w.type,
          label: w.label,
          icon: w.iconSrc,
          color: w.color,
        })),
      },
    ];

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-grouped-chip-container.css"
      />
      <button
        class="grouped-chips"
        id="grouped-chips-trigger"
        aria-haspopup="menu"
        aria-expanded=${this.isPanelOpen}
        ?data-is-smartwindow-panel-open=${this.isPanelOpen}
        @mousedown=${e => this.#onTriggerMousedown(e)}
        @click=${e => this.#toggleGroupedPanel(e)}
      >
        <span class="grouped-chips__favicon-group">
          ${repeat(
            this.chips,
            (chip, index) => `${chip.url ?? chip.groupId}-${index}`,
            chip => this.#renderStackedIcon(chip)
          )}
        </span>
        <span
          class="grouped-chips__label"
          data-l10n-id="smart-window-context-chips-tag-count"
          data-l10n-args=${JSON.stringify({ tags: this.chips.length })}
        ></span>
        <img
          class="grouped-chips__arrow-icon"
          src="chrome://global/skin/icons/arrow-down-12.svg"
          alt=""
        />
      </button>
      <smartwindow-panel-list
        .groups=${chipsGroups}
        @shown=${() => (this.isPanelOpen = true)}
        @hidden=${() => (this.isPanelOpen = false)}
        @item-selected=${e => this.#onItemSelected(e)}
      ></smartwindow-panel-list>
    `;
  }
}

customElements.define("ai-grouped-chip-container", AIGroupedChipContainer);
