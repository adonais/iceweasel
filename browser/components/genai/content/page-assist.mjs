/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/sidebar/sidebar-panel-header.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PageAssist: "moz-src:///browser/components/genai/PageAssist.sys.mjs",
});

export class PageAssist extends MozLitElement {
  static properties = {
    userPrompt: { type: String },
    aiResponse: { type: String },
  };

  constructor() {
    super();
    this.userPrompt = "";
    this.aiResponse = "";
  }

  connectedCallback() {
    super.connectedCallback();
  }

  /**
   * Featch Page Data
   *
   * @returns {Promise<null|
   * {
   *  url: string,
   *  title: string,
   *  content: string,
   *  textContent: string,
   *  excerpt: string,
   *  isReaderable: boolean
   * }>}
   */
  async _fetchPageData() {
    const { gBrowser } =
      window.browsingContext.embedderWindowGlobal.browsingContext.window;
    const selectedBrowser = gBrowser?.selectedBrowser;
    if (!selectedBrowser) {
      return null;
    }

    const windowGlobal = selectedBrowser.browsingContext.currentWindowGlobal;
    if (!windowGlobal) {
      return null;
    }

    // Get the parent actor instance
    const actor = windowGlobal.getActor("PageAssist");
    return await actor.fetchPageData();
  }

  handlePromptInput = e => {
    const value = e.target.value;
    this.userPrompt = value;
  };

  handleSubmit = async () => {
    const pageData = await this._fetchPageData();
    if (!pageData) {
      this.aiResponse = "No page data";
      return;
    }
    const aiResponse = await lazy.PageAssist.fetchAiResponse(
      this.userPrompt,
      pageData
    );
    this.aiResponse = aiResponse ?? "No response";
  };

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/genai/content/page-assist.css"
      />
      <div>
        <sidebar-panel-header
          data-l10n-id="genai-page-assist-sidebar-title"
          data-l10n-attrs="heading"
          view="viewGenaiPageAssistSidebar"
        ></sidebar-panel-header>
        <div class="wrapper">
          ${this.aiResponse
            ? html`<div class="ai-response">${this.aiResponse}</div>`
            : ""}
          <div>
            <textarea
              class="prompt-textarea"
              @input=${e => this.handlePromptInput(e)}
            ></textarea>
            <moz-button
              id="submit-user-prompt-btn"
              type="primary"
              size="small"
              @click=${this.handleSubmit}
            >
              Submit
            </moz-button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("page-assist", PageAssist);
