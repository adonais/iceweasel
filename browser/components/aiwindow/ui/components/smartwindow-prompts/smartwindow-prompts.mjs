/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

// The favicon cluster shows at most this many icons; beyond that, the
// last slot becomes a "+N" overflow badge instead of an icon.
const MAX_VISIBLE_FAVICONS = 3;

/**
 * A component for displaying conversation starter prompts.
 * Renders a list of prompt buttons that can be clicked to start a conversation.
 *
 * @property {Array<{text: string, type: string, previewIcons?: Array<{iconSrc: string}>, memory?: object, content?: object}>} prompts - Array of prompt objects to display
 */
export class SmartWindowPrompts extends MozLitElement {
  static properties = {
    prompts: { type: Array },
    mode: { type: String, reflect: true },
  };

  constructor() {
    super();
    this.prompts = [];
    this.mode = "fullpage";
  }

  #promptSelected(swPrompt) {
    const { text, type } = swPrompt;
    const detail =
      type === "resume"
        ? {
            text,
            type,
            memory: swPrompt.memory,
            content: swPrompt.content,
          }
        : { text, type };

    const event = new CustomEvent("SmartWindowPrompt:prompt-selected", {
      detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  #hasInteracted(e) {
    e.currentTarget.classList.add("has-interacted");
  }

  /**
   * Renders a decorative favicon cluster for a prompt's previewIcons, if
   * any. Shows up to MAX_VISIBLE_FAVICONS icons; beyond that, the last
   * slot becomes a "+N" badge for the remaining count.
   *
   * @param {Array<{iconSrc: string}>} [previewIcons]
   */
  #renderFavicons(previewIcons) {
    if (!previewIcons?.length) {
      return nothing;
    }

    const showOverflow = previewIcons.length > MAX_VISIBLE_FAVICONS;
    const visibleIcons = previewIcons.slice(
      0,
      showOverflow ? MAX_VISIBLE_FAVICONS - 1 : MAX_VISIBLE_FAVICONS
    );
    const overflowCount = previewIcons.length - visibleIcons.length;

    return html`
      <span class="sw-prompt-favicons">
        ${visibleIcons.map(
          icon => html`
            <img
              class="sw-prompt-favicon"
              src=${icon.iconSrc}
              alt=""
              @error=${e => {
                e.target.src = "chrome://global/skin/icons/defaultFavicon.svg";
              }}
            />
          `
        )}
        ${showOverflow
          ? html`<span class="sw-prompt-favicon-overflow"
              >+${overflowCount}</span
            >`
          : nothing}
      </span>
    `;
  }

  /**
   * Renders a non-interactive placeholder pill shown in a starter slot
   * while its real content is still loading.
   */
  #renderSkeletonPrompt() {
    return html`
      <span class="sw-prompt-skeleton" aria-hidden="true">
        <span class="sw-prompt-skeleton-text"></span>
      </span>
    `;
  }

  render() {
    if (!this.prompts.length) {
      return html``;
    }

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-prompts.css"
      />
      <!-- TODO : TODO a11y translations? -->
      <div class="sw-prompts-container" role="group">
        ${this.prompts.map(swPrompt =>
          swPrompt.type === "skeleton"
            ? this.#renderSkeletonPrompt()
            : html`
                <moz-button
                  class="sw-prompt-button"
                  @click=${() => this.#promptSelected(swPrompt)}
                  @mouseenter=${this.#hasInteracted}
                  @focusin=${this.#hasInteracted}
                  aria-label=${swPrompt.text}
                >
                  ${this.#renderFavicons(swPrompt.previewIcons)}${swPrompt.text}
                </moz-button>
              `
        )}
      </div>
    `;
  }
}

customElements.define("smartwindow-prompts", SmartWindowPrompts);
