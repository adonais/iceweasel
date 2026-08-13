/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-promo.mjs";

// Event names are owned by the handler module so both sides stay in sync. In
// Storybook the sys.mjs isn't reachable, so fall back to inline literals.
const SIDEBAR_CHATBOT_PROMO_EVENTS = window.IS_STORYBOOK
  ? Object.freeze({
      PRIMARY: "ChatbotPromo:PrimaryAction",
      CLOSE: "ChatbotPromo:Close",
      IMPRESSION: "ChatbotPromo:Impression",
    })
  : ChromeUtils.importESModule(
      "resource:///modules/asrouter/SidebarChatBotPromo.sys.mjs"
    ).SIDEBAR_CHATBOT_PROMO_EVENTS;

/**
 * Renders a promotional card in the chatbot sidebar footer. Receives resolved
 * content via the `message` property and dispatches
 * `ChatbotPromo:PrimaryAction` / `ChatbotPromo:Close` / `ChatbotPromo:Impression`
 * events. All messaging-system behavior (content resolution, impressions,
 * button actions) lives in SidebarChatBotPromo.sys.mjs; this element only
 * renders and reports interactions.
 *
 * @property {object|null} message - Resolved promo content
 */
export class ChatbotPromo extends MozLitElement {
  static properties = {
    message: { type: Object },
  };

  #impressionFired = false;
  #onVisibilityChange = () => this.#maybeFireImpression();

  constructor() {
    super();
    this.message = null;
  }

  updated(changedProperties) {
    // Arm impression detection once content arrives. If the document isn't
    // visible yet, wait for it so impressions only count when actually shown.
    if (
      changedProperties.has("message") &&
      this.message &&
      !this.#impressionFired &&
      !this.#maybeFireImpression()
    ) {
      this.ownerDocument.addEventListener(
        "visibilitychange",
        this.#onVisibilityChange
      );
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener(
      "visibilitychange",
      this.#onVisibilityChange
    );
  }

  #maybeFireImpression() {
    if (
      this.#impressionFired ||
      this.ownerDocument.visibilityState !== "visible"
    ) {
      return this.#impressionFired;
    }
    this.#impressionFired = true;
    this.ownerDocument.removeEventListener(
      "visibilitychange",
      this.#onVisibilityChange
    );
    this.#dispatch(SIDEBAR_CHATBOT_PROMO_EVENTS.IMPRESSION);
    return true;
  }

  #dispatch(type) {
    this.dispatchEvent(
      new CustomEvent(type, { bubbles: true, composed: true })
    );
  }

  #handlePrimary = () => this.#dispatch(SIDEBAR_CHATBOT_PROMO_EVENTS.PRIMARY);

  #handleClose = () => this.#dispatch(SIDEBAR_CHATBOT_PROMO_EVENTS.CLOSE);

  render() {
    const content = this.message;
    if (!content) {
      return nothing;
    }
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/genai/content/chatbot-promo.css"
      />
      <div class="promo-container">
        <moz-promo
          type=${content.type ?? "default"}
          heading=${content.heading ?? ""}
          message=${content.message ?? ""}
        >
          ${content.additionalActionText || content.primaryActionText
            ? html`<div class="chatbot-promo-footer" slot="actions">
                ${content.additionalActionText
                  ? html`<moz-button type="default" @click=${this.#handleClose}>
                      ${content.additionalActionText}
                    </moz-button>`
                  : nothing}
                ${content.primaryActionText
                  ? html`<moz-button
                      type="default"
                      @click=${this.#handlePrimary}
                    >
                      ${content.primaryActionText}
                    </moz-button>`
                  : nothing}
              </div>`
            : nothing}
        </moz-promo>
      </div>
    `;
  }
}

customElements.define("chatbot-promo", ChatbotPromo);
