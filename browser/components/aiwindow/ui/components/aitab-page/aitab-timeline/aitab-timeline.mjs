/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * @typedef {object} TimelineItem
 * @property {string} date_label - Date or time, already written for display
 *   by the model. There is no machine-readable date to pair it with.
 * @property {string} [date_eyebrow] - Short label for what the date is, under
 *   the date itself.
 * @property {string} title - What happens then.
 * @property {string} [description] - A sentence or two of detail.
 */

/**
 * Body block for a generated AI Tab page, rendered from the page config's
 * `Timeline` block: entries in the order the model gave them, each one against
 * its date in a gutter.
 *
 * @property {string} title - Block title.
 * @property {string} description - One sentence of context below the title.
 * @property {TimelineItem[]} items - Entries to render, in order.
 */
export class AITabTimeline extends MozLitElement {
  static properties = {
    title: { type: String },
    description: { type: String },
    items: { type: Array },
  };

  constructor() {
    super();
    this.title = "";
    this.description = "";
    this.items = [];
  }

  #renderIntro() {
    if (!this.title && !this.description) {
      return nothing;
    }

    return html`<div class="aitab-timeline-intro">
      ${this.title
        ? html`<h2 class="aitab-timeline-title aitab-heading-3">
            ${this.title}
          </h2>`
        : nothing}
      ${this.description
        ? html`<p class="aitab-timeline-description aitab-deemphasized">
            ${this.description}
          </p>`
        : nothing}
    </div>`;
  }

  /**
   * An entry title sits under the block title where there is one, and under
   * the page title where the model left the block untitled. The size comes
   * from the class either way, so only the outline changes.
   *
   * @param {string} text
   */
  #renderEntryTitle(text) {
    const classes = "aitab-timeline-item-title aitab-heading-4";
    return this.title
      ? html`<h3 class=${classes}>${text}</h3>`
      : html`<h2 class=${classes}>${text}</h2>`;
  }

  #renderItem(item) {
    return item
      ? html`<li class="aitab-timeline-item">
          <div class="aitab-timeline-date">
            ${item.date_label
              ? html`<span class="aitab-timeline-date-label"
                  >${item.date_label}</span
                >`
              : nothing}
            ${item.date_eyebrow
              ? html`<span class="aitab-timeline-date-eyebrow aitab-eyebrow"
                  >${item.date_eyebrow}</span
                >`
              : nothing}
          </div>
          <div class="aitab-timeline-entry">
            ${item.title ? this.#renderEntryTitle(item.title) : nothing}
            ${item.description
              ? html`<p class="aitab-timeline-item-description">
                  ${item.description}
                </p>`
              : nothing}
          </div>
        </li>`
      : nothing;
  }

  render() {
    const items = (this.items ?? []).filter(
      item => item?.date_label || item?.title
    );
    if (!items.length) {
      return nothing;
    }

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-base.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-timeline.css"
      />
      <section class="aitab-timeline">
        ${this.#renderIntro()}
        <ol class="aitab-timeline-items">
          ${items.map(item => this.#renderItem(item))}
        </ol>
      </section>
    `;
  }
}

customElements.define("aitab-timeline", AITabTimeline);
