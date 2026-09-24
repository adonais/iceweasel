/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const REQUEST_PAGE_EVENT = "AITab:RequestPage";

/**
 * Returns the href as an http(s) URL, or null for anything else. Footer button
 * hrefs can also be in-app route ids, which must not become links.
 *
 * @param {string} href
 * @returns {?string}
 */
function httpUrl(href) {
  const parsed = URL.parse(String(href ?? "").trim());
  return parsed?.protocol == "http:" || parsed?.protocol == "https:"
    ? parsed.href
    : null;
}

/**
 * Root component for about:aitab. Looks up the page config for the generated
 * page named in the page URL and renders it.
 *
 * Body blocks render as placeholders for now; the text, table, cards, list and
 * timeline components land separately.
 *
 * @property {?object} page - Page config to render, or null when there is none.
 * @property {string} status - One of "loading", "unavailable", "error" or
 *   "ready". Drives which of the states below is rendered.
 */
export class AITabPage extends MozLitElement {
  static properties = {
    page: { type: Object },
    status: { type: String },
  };

  constructor() {
    super();
    this.page = null;
    this.status = "loading";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#loadPage().catch(error => {
      console.error("Failed to load AI Tab page:", error);
      this.status = "error";
    });
  }

  /**
   * Unique name of the generated page to render, taken from the page URL. It
   * is an opaque key for the parent process to look up, never a path.
   *
   * @returns {?string}
   */
  get pageName() {
    return new URLSearchParams(window.location.search).get("page");
  }

  async #loadPage() {
    const pageName = this.pageName;
    if (!pageName) {
      this.status = "unavailable";
      return;
    }

    const response = await this.#requestPage(pageName);
    if (!response?.success) {
      throw new Error(response?.error ?? "No response from the parent process");
    }

    this.page = response.page ?? null;
    this.status = this.page ? "ready" : "unavailable";
  }

  /**
   * Asks the AITab actor for a stored page config.
   *
   * @param {string} pageName
   * @returns {Promise<object>} Resolves with the parent actor's response.
   */
  #requestPage(pageName) {
    return new Promise((resolve, reject) => {
      const onResponse = event => {
        this.removeEventListener(`${REQUEST_PAGE_EVENT}:Error`, onError);
        resolve(event.detail);
      };
      const onError = event => {
        this.removeEventListener(`${REQUEST_PAGE_EVENT}:Response`, onResponse);
        reject(new Error(event.detail?.error || "Failed to load the page"));
      };

      this.addEventListener(`${REQUEST_PAGE_EVENT}:Response`, onResponse, {
        once: true,
      });
      this.addEventListener(`${REQUEST_PAGE_EVENT}:Error`, onError, {
        once: true,
      });

      this.dispatchEvent(
        new CustomEvent(REQUEST_PAGE_EVENT, {
          bubbles: true,
          detail: { pageName },
        })
      );
    });
  }

  updated(changedProperties) {
    if (!changedProperties.has("page")) {
      return;
    }
    // The title is what shows up for this page in history and in the tab strip.
    const title = this.page?.header?.title;
    if (title) {
      document.title = title;
    }
  }

  #renderHeader(header) {
    if (!header) {
      return nothing;
    }
    return html`
      <header class="aitab-header">
        ${header.eyebrow
          ? html`<p class="aitab-eyebrow">${header.eyebrow}</p>`
          : nothing}
        <h1 class="aitab-title">${header.title}</h1>
        ${header.subhead
          ? html`<p class="aitab-subhead">${header.subhead}</p>`
          : nothing}
      </header>
    `;
  }

  #renderBlock(block) {
    if (!block?.type) {
      return nothing;
    }
    return html`
      <section class="aitab-block" data-block-type=${block.type}>
        ${block.title ? html`<h2>${block.title}</h2>` : nothing}
      </section>
    `;
  }

  #renderFooterButton(button) {
    const url = httpUrl(button.href);
    const variant = button.variant ?? "secondary";
    return url
      ? html`<a
          class="aitab-chip"
          data-variant=${variant}
          href=${url}
          target="_blank"
          rel="noopener noreferrer"
          >${button.text}</a
        >`
      : html`<span class="aitab-chip" data-variant=${variant}
          >${button.text}</span
        >`;
  }

  #renderFooter(footer) {
    if (!footer) {
      return nothing;
    }
    return html`
      <footer class="aitab-footer">
        ${footer.text
          ? html`<p class="aitab-footer-text">${footer.text}</p>`
          : nothing}
        <div class="aitab-chips">
          ${(footer.buttons ?? []).map(button =>
            this.#renderFooterButton(button)
          )}
        </div>
      </footer>
    `;
  }

  #renderStatus() {
    if (this.status == "loading") {
      return nothing;
    }
    return html`<p
      class="aitab-status"
      role="alert"
      data-l10n-id=${this.status == "error"
        ? "ai-tab-page-error"
        : "ai-tab-page-unavailable"}
    ></p>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-page.css"
      />
      ${this.status == "ready"
        ? html`<main class="aitab-sheet">
            ${this.#renderHeader(this.page.header)}
            <div class="aitab-blocks">
              ${(this.page.blocks ?? []).map(block => this.#renderBlock(block))}
            </div>
            ${this.#renderFooter(this.page.footer)}
          </main>`
        : this.#renderStatus()}
    `;
  }
}

customElements.define("aitab-page", AITabPage);
