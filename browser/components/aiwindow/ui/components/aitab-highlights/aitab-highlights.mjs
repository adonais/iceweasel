/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { httpUrl } from "chrome://browser/content/aiwindow/modules/AITabUtils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-website-chip.mjs";

/** @typedef {{ favicon?: string, title?: string, href: string }} SourceLink */

/**
 * One evidence-backed statement, as described by the `HighlightItem` schema
 * in component_schema.json.
 *
 * @typedef {object} HighlightItem
 * @property {string} [eyebrow] - Short label above the statement, for example
 *   "Morning".
 * @property {string} [title] - The statement itself.
 * @property {string} [body] - The sentence of evidence behind it.
 * @property {{ items: SourceLink[] }} [sources] - Pages the evidence came
 *   from, each shown as a source chip.
 */

/**
 * @property {string} title - Optional title naming the shared theme.
 * @property {HighlightItem[]} items - The statements.
 */
export class AITabHighlights extends MozLitElement {
  static properties = {
    title: { type: String },
    items: { type: Array, attribute: false },
  };

  constructor() {
    super();
    this.title = "";
    this.items = [];
  }

  #renderSource(source, url) {
    return html`<ai-website-chip
      type="context-chip"
      size="small"
      .label=${source.title || url.hostname}
      .href=${url.href}
      .iconSrc=${source.favicon || `page-icon:${url.href}`}
      openLinkEvent="AITab:OpenLink"
    ></ai-website-chip>`;
  }

  #renderSources(sources) {
    const links = (sources?.items ?? [])
      .map(source => ({ source, url: httpUrl(source?.href) }))
      .filter(link => link.url);
    if (!links.length) {
      return nothing;
    }
    return html`<div class="aitab-highlight-sources">
      ${links.map(({ source, url }) => this.#renderSource(source, url))}
    </div>`;
  }

  #renderItem(item) {
    return html`<li class="aitab-highlight">
      <div class="aitab-highlight-statement">
        ${item.eyebrow
          ? html`<p class="aitab-eyebrow">${item.eyebrow}</p>`
          : nothing}
        ${item.title
          ? html`<p class="aitab-highlight-title aitab-heading-3">
              ${item.title}
            </p>`
          : nothing}
      </div>
      <div class="aitab-highlight-evidence">
        ${item.body
          ? html`<p class="aitab-highlight-body">${item.body}</p>`
          : nothing}
        ${this.#renderSources(item.sources)}
      </div>
    </li>`;
  }

  #renderList() {
    const items = (this.items ?? []).filter(Boolean);
    if (!items.length) {
      return nothing;
    }
    return html`<ul
      class="aitab-highlights-list"
      aria-labelledby=${this.title ? "title" : nothing}
    >
      ${items.map(item => this.#renderItem(item))}
    </ul>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-base.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-highlights.css"
      />
      <section class="aitab-highlights">
        ${this.title
          ? html`<h2 id="title" class="aitab-highlights-title aitab-heading-3">
              ${this.title}
            </h2>`
          : nothing}
        ${this.#renderList()}
      </section>
    `;
  }
}

customElements.define("aitab-highlights", AITabHighlights);
