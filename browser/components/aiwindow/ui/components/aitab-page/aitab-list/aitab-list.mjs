/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/** @typedef {{ text: string }} ListItem */
/** @typedef {{ heading?: string, items: ListItem[] }} ListGroup */
/**
 * @typedef { "column" | "row" } LayoutType "column" puts the title and
 *   description above the groups, which spread across as many columns as they
 *   fit; "row" puts them beside a single column of groups.
 */

/** @type {LayoutType} */
const DEFAULT_LAYOUT = "column";

/**
 * Body block for a generated AI Tab page, rendered from the page config's
 * `List` block: optionally grouped items, in two layouts.
 *
 * @property {string} title - Block title.
 * @property {string} description - One sentence of context below the title.
 * @property {ListGroup[]} groups - Groups to render, in order. A group
 *   without a heading renders as bare items.
 * @property {LayoutType} layout - The layout to render in.
 */
export class AITabList extends MozLitElement {
  static properties = {
    title: { type: String },
    description: { type: String },
    groups: { type: Array },
    layout: { type: String, reflect: true },
  };

  constructor() {
    super();
    this.title = "";
    this.description = "";
    this.groups = [];
    this.layout = DEFAULT_LAYOUT;
  }

  #renderIntro() {
    if (!this.title && !this.description) {
      return nothing;
    }

    return html`<div class="aitab-list-intro">
      ${this.title
        ? html`<h2 class="aitab-list-title">${this.title}</h2>`
        : nothing}
      ${this.description
        ? html`<p class="aitab-list-description aitab-deemphasized">
            ${this.description}
          </p>`
        : nothing}
    </div>`;
  }

  #renderGroup(group) {
    return html`<div class="aitab-list-group">
      ${group.heading
        ? html`<h3 class="aitab-list-group-heading">${group.heading}</h3>`
        : nothing}
      <ul class="aitab-list-items">
        ${group.items.map(
          item => html`<li class="aitab-list-item">${item?.text ?? ""}</li>`
        )}
      </ul>
    </div>`;
  }

  render() {
    const groups = (this.groups ?? []).filter(group => group?.items?.length);
    if (!groups.length) {
      return nothing;
    }

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-base.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-list.css"
      />
      <section class="aitab-list">
        ${this.#renderIntro()}
        <div class="aitab-list-groups">
          ${groups.map(group => this.#renderGroup(group))}
        </div>
      </section>
    `;
  }
}

customElements.define("aitab-list", AITabList);
