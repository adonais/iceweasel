/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  nothing,
  repeat,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-website-chip.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/smartwindow-panel-list.mjs";

/**
 * A citation source.
 *
 * @typedef {object} Citation
 * @property {string} url - Source URL
 * @property {string} [title] - Display title
 * @property {string} [faviconUrl] - Favicon URL
 * @property {boolean} [hasFavicon] - Whether we already have a favicon stored for this URL
 */

/**
 * Renders citation pills for an assistant chat message.
 *
 * @property {Citation[]} citations - The sources to display.
 */
export class ChatAssistantCitations extends MozLitElement {
  static properties = {
    citations: { type: Array, attribute: false },
    isPanelOpen: { type: Boolean, state: true },
    maxVisible: { type: Number, attribute: false },
  };

  constructor() {
    super();
    this.citations = [];
    this.isPanelOpen = false;
    this.maxVisible = 3;
  }

  #panel() {
    return this.shadowRoot.querySelector("smartwindow-panel-list");
  }

  #onToggleClick(event) {
    const panel = this.#panel();
    if (panel) {
      panel.anchor = event.currentTarget;
      panel.toggle(event);
    }
  }

  #onPanelOpenLink() {
    this.#panel()?.hide();
  }

  #label(citation) {
    return (
      citation.title || (URL.parse(citation.url)?.hostname ?? citation.url)
    );
  }

  #titleText(citation) {
    return citation.title || citation.url;
  }

  #icon(citation) {
    if (citation.faviconUrl) {
      return citation.faviconUrl;
    }
    return citation.hasFavicon
      ? `page-icon:${citation.url}`
      : "chrome://global/skin/icons/defaultFavicon.svg";
  }

  #renderPill(citation, { itemRole, showTitle } = {}) {
    return html`<ai-website-chip
      type="context-chip"
      size="small"
      role=${itemRole ? "presentation" : nothing}
      .itemRole=${itemRole ?? ""}
      title=${showTitle ? this.#titleText(citation) : nothing}
      .label=${this.#label(citation)}
      .href=${citation.url}
      .iconSrc=${this.#icon(citation)}
    ></ai-website-chip>`;
  }

  render() {
    if (!this.citations?.length) {
      return nothing;
    }

    const visibleCount =
      this.citations.length > this.maxVisible
        ? this.maxVisible - 1
        : this.maxVisible;
    const citationsVisible = this.citations.slice(0, visibleCount);
    const citationsOverflow = this.citations.slice(visibleCount);

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/chat-assistant-citations.css"
      />
      <div class="citations" role="list">
        ${citationsVisible.map(
          citation =>
            html`<span role="listitem"
              >${this.#renderPill(citation, { showTitle: true })}</span
            >`
        )}
        ${citationsOverflow.length
          ? html`
              <moz-button
                type="ghost"
                .ariaHasPopup=${"menu"}
                .ariaExpanded=${String(this.isPanelOpen)}
                data-l10n-id="smartwindow-assistant-citations-more-label"
                data-l10n-args=${JSON.stringify({
                  count: citationsOverflow.length,
                })}
                @click=${this.#onToggleClick}
              ></moz-button>
              <smartwindow-panel-list
                @shown=${() => (this.isPanelOpen = true)}
                @hidden=${() => (this.isPanelOpen = false)}
                @AIChatContent:OpenLink=${this.#onPanelOpenLink}
              >
                ${repeat(
                  citationsOverflow,
                  citation => citation.url,
                  citation =>
                    this.#renderPill(citation, { itemRole: "menuitem" })
                )}
              </smartwindow-panel-list>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define("chat-assistant-citations", ChatAssistantCitations);
