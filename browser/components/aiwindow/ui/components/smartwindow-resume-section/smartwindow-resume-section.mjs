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

export const RESUME_SECTION_EMPTY_REASON = {
  NO_SUGGESTIONS: "no-suggestions",
  ALL_DISMISSED: "all-dismissed",
};

/**
 * A collapsible grid of resume cards. Card events bubble to the caller.
 *
 * @property {Array<{content: object, memory: object}>} cards - Journeys to render as cards
 * @property {string} emptyReason - Why `cards` is empty (a
 *   RESUME_SECTION_EMPTY_REASON value), or null/undefined to render nothing
 *   while empty
 * @property {boolean} loading - Whether resume content is still being generated
 */
export class SmartwindowResumeSection extends MozLitElement {
  static properties = {
    cards: { type: Array },
    emptyReason: { type: String },
    loading: { type: Boolean },
    expanded: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.cards = [];
    this.emptyReason = null;
    this.loading = false;
    this.expanded = false;
  }

  #dispatch(type, detail) {
    this.dispatchEvent(
      new CustomEvent(`smartwindow-resume-section:${type}`, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  #onToggleClick = () => {
    this.expanded = !this.expanded;
  };

  #onHideClick = () => {
    this.#dispatch("hide", { reason: this.emptyReason });
  };

  #renderEmptyState() {
    const isAllDismissed =
      this.emptyReason === RESUME_SECTION_EMPTY_REASON.ALL_DISMISSED;

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
      </div>
      <div class="resume-section-empty">
        <div
          class="resume-section-empty-heading"
          data-l10n-id=${isAllDismissed
            ? "aiwindow-resume-section-empty-all-dismissed-heading"
            : "aiwindow-resume-section-empty-no-suggestions-heading"}
        ></div>
        <div
          class="resume-section-empty-description"
          data-l10n-id=${isAllDismissed
            ? "aiwindow-resume-section-empty-all-dismissed-description"
            : "aiwindow-resume-section-empty-no-suggestions-description"}
        ></div>
        <moz-button
          class="resume-section-empty-hide"
          size="small"
          @click=${this.#onHideClick}
          data-l10n-id="aiwindow-resume-section-hide"
        ></moz-button>
      </div>
    `;
  }

  #renderSkeletonCard() {
    return html`
      <div class="resume-card-skeleton" aria-hidden="true">
        <div class="resume-card-skeleton-header">
          <span class="resume-card-skeleton-favicons">
            <span class="resume-card-skeleton-favicon"></span>
            <span class="resume-card-skeleton-favicon"></span>
            <span class="resume-card-skeleton-favicon"></span>
          </span>
          <span
            class="resume-section-skeleton-text resume-card-skeleton-tab-count"
          ></span>
        </div>
        <span
          class="resume-section-skeleton-text resume-card-skeleton-title"
        ></span>
        <span
          class="resume-section-skeleton-text resume-card-skeleton-description"
        ></span>
        <span
          class="resume-section-skeleton-text resume-card-skeleton-description"
        ></span>
        <div class="resume-card-skeleton-actions">
          <span
            class="resume-section-skeleton-text resume-card-skeleton-button"
          ></span>
          <span
            class="resume-section-skeleton-text resume-card-skeleton-button"
          ></span>
        </div>
      </div>
    `;
  }

  #renderLoadingState() {
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
      </div>
      <div class="resume-section-grid">
        ${Array.from({ length: COLLAPSED_CARD_COUNT }, () =>
          this.#renderSkeletonCard()
        )}
      </div>
    `;
  }

  render() {
    if (this.loading) {
      return this.#renderLoadingState();
    }

    if (!this.cards.length) {
      return this.emptyReason ? this.#renderEmptyState() : nothing;
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
