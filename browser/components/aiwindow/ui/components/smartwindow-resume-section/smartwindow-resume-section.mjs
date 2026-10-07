/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/smartwindow-resume-card.mjs";

const COLLAPSED_CARD_COUNT = 2;

/**
 * A collapsible grid of resume cards. Card events bubble to the caller.
 *
 * @property {Array<{content: object, memory: object}>} cards - Journeys to render as cards
 */
export class SmartwindowResumeSection extends MozLitElement {
  static properties = {
    cards: { type: Array },
    expanded: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.cards = [];
    this.expanded = false;
  }

  #onToggleClick = () => {
    this.expanded = !this.expanded;
  };

  render() {
    if (!this.cards.length) {
      return nothing;
    }

    const hiddenCount = Math.max(0, this.cards.length - COLLAPSED_CARD_COUNT);
    const visibleCards =
      this.expanded || !hiddenCount
        ? this.cards
        : this.cards.slice(0, COLLAPSED_CARD_COUNT);

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-resume-section.css"
      />
      <div class="resume-section-heading">
        <span
          class="resume-section-title"
          data-l10n-id="aiwindow-resume-section-heading"
        ></span>
        ${hiddenCount
          ? html`
              <moz-button
                class="resume-section-toggle"
                type="ghost"
                size="small"
                @click=${this.#onToggleClick}
                data-l10n-id=${this.expanded
                  ? "aiwindow-resume-section-show-less"
                  : "aiwindow-resume-section-show-more"}
                data-l10n-args=${JSON.stringify({
                  count: this.cards.length,
                })}
              ></moz-button>
            `
          : nothing}
      </div>
      <div class="resume-section-grid">
        ${visibleCards.map(
          ({ content, memory }) => html`
            <smartwindow-resume-card
              .content=${content}
              .journeyId=${memory.id}
            ></smartwindow-resume-card>
          `
        )}
      </div>
    `;
  }
}

customElements.define("smartwindow-resume-section", SmartwindowResumeSection);
