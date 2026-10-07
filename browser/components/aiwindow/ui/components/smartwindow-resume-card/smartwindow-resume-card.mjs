/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";

const MAX_VISIBLE_FAVICONS = 3;

const MORE_MENU_ID = "resume-card-more-menu";

/**
 * A card for resuming a browsing or chat journey.
 *
 * @property {{headline: string, status: string, previewTabs: Array<{url: string, title: string}>}} content - The journey's title, description, and preview tabs
 * @property {string} journeyId - Opaque journey ID included in card events
 */
export class SmartwindowResumeCard extends MozLitElement {
  static properties = {
    content: { type: Object },
    journeyId: { type: String },
  };

  constructor() {
    super();
    this.content = null;
    this.journeyId = null;
  }

  #dispatch(type, detail) {
    this.dispatchEvent(
      new CustomEvent(`smartwindow-resume-card:${type}`, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  #onResumeClick = () => {
    this.#dispatch("resume", { journeyId: this.journeyId });
  };

  #onDismissClick = e => {
    e.stopPropagation();
    this.#dispatch("dismiss", { journeyId: this.journeyId });
  };

  #onMenuItemClick(itemId) {
    this.#dispatch("menu-item-selected", {
      journeyId: this.journeyId,
      itemId,
    });
  }

  #renderFavicons() {
    const tabs = this.content?.previewTabs ?? [];
    if (!tabs.length) {
      return nothing;
    }

    return html`
      <span class="resume-card-favicons">
        ${tabs.slice(0, MAX_VISIBLE_FAVICONS).map(
          tab => html`
            <img
              class="resume-card-favicon"
              src="page-icon:${tab.url}"
              alt=""
              @error=${e => {
                e.target.src = "chrome://global/skin/icons/defaultFavicon.svg";
              }}
            />
          `
        )}
      </span>
    `;
  }

  render() {
    if (!this.content) {
      return html``;
    }

    const tabCount = this.content.previewTabs?.length ?? 0;
    const l10nArgs = JSON.stringify({ text: this.content.headline });

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-resume-card.css"
      />
      <div class="resume-card">
        <button
          class="resume-card-dismiss"
          @click=${this.#onDismissClick}
          data-l10n-id="aiwindow-resume-card-dismiss"
          data-l10n-args=${l10nArgs}
        >
          <img
            class="resume-card-dismiss-icon"
            src="chrome://global/skin/icons/close.svg"
            alt=""
          />
        </button>
        <div class="resume-card-header">
          ${this.#renderFavicons()}
          <span
            class="resume-card-tab-count"
            data-l10n-id="aiwindow-resume-card-tab-count"
            data-l10n-args=${JSON.stringify({ count: tabCount })}
          ></span>
        </div>
        <div class="resume-card-title">${this.content.headline}</div>
        <div class="resume-card-description">${this.content.status}</div>
        <div class="resume-card-actions">
          <moz-button
            class="resume-card-action-button resume-card-more-button"
            .menuId=${MORE_MENU_ID}
            iconsrc="chrome://global/skin/icons/arrow-down.svg"
            iconposition="end"
            data-l10n-id="aiwindow-resume-card-more"
            data-l10n-args=${l10nArgs}
          ></moz-button>
          <panel-list id=${MORE_MENU_ID}>
            <panel-item
              @click=${() => this.#onMenuItemClick("open-tabs")}
              data-l10n-id="aiwindow-resume-card-open-tabs"
            ></panel-item>
            <panel-item
              @click=${() => this.#onMenuItemClick("snooze")}
              data-l10n-id="aiwindow-resume-card-snooze"
            ></panel-item>
          </panel-list>
          <moz-button
            class="resume-card-action-button resume-card-resume-button"
            data-l10n-id="aiwindow-resume-card-resume"
            data-l10n-args=${l10nArgs}
            @click=${this.#onResumeClick}
          ></moz-button>
        </div>
      </div>
    `;
  }
}

customElements.define("smartwindow-resume-card", SmartwindowResumeCard);
