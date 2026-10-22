/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

/**
 * Renders AITab creation progress state and options for
 * user to choose where to open the AITab.
 */
export class AITabToolUI extends MozLitElement {
  static properties = {
    state: { type: String },
    title: { type: String },
    completeStateOpen: { type: Boolean },
  };

  constructor() {
    super();
    this.state = "creating";
    this.title = "";
    this.completeStateOpen = true;
  }

  #handleKeyboardActivation(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.#toggleCompleteMessage();
    }
  }

  #toggleCompleteMessage() {
    this.completeStateOpen = !this.completeStateOpen;
  }

  #requestOpen(openTarget) {
    this.dispatchEvent(
      new CustomEvent("aitab-open-request", {
        bubbles: true,
        composed: true,
        detail: { openTarget },
      })
    );
  }

  #renderCreating() {
    return html`<p
      class="status"
      role="status"
      data-l10n-id="smartwindow-aitab-creating"
    ></p>`;
  }

  #renderChoose() {
    return html`<div class="card">
      <p class="title">
        <img
          src="chrome://newtab/content/data/content/assets/firefox.svg"
          alt=""
          width="16"
          height="16"
        />
        ${this.title}
      </p>
      <div class="actions">
        <moz-button
          type="default"
          data-l10n-id="smartwindow-aitab-open-current"
          data-l10n-attrs="label"
          @click=${() => this.#requestOpen("current")}
        ></moz-button>
        <moz-button
          type="primary"
          data-l10n-id="smartwindow-aitab-open-new"
          data-l10n-attrs="label"
          @click=${() => this.#requestOpen("new")}
        ></moz-button>
      </div>
    </div>`;
  }

  #renderComplete() {
    const arrow = this.completeStateOpen
      ? "chrome://global/skin/icons/arrow-up-12.svg"
      : "chrome://global/skin/icons/arrow-down-12.svg";

    return html`<div class="complete card">
      <div
        class="complete-title"
        role="button"
        tabindex="0"
        @click=${() => this.#toggleCompleteMessage()}
        @keydown=${e => this.#handleKeyboardActivation(e)}
      >
        <img src=${arrow} alt="" />
        <span data-l10n-id="smartwindow-aitab-created-an-aitab"></span>
      </div>

      ${this.completeStateOpen
        ? html`
            <p class="title">
              <img
                src="chrome://browser/skin/smart-window-mono-32.svg"
                alt=""
                width="16"
                height="16"
              />
              ${this.title}
            </p>
          `
        : nothing}
    </div>`;
  }

  #renderState() {
    switch (this.state) {
      case "creating":
        return this.#renderCreating();

      case "choose":
        return this.#renderChoose();

      case "complete":
        return this.#renderComplete();

      default:
        return nothing;
    }
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-tool-ui.css"
      />
      ${this.#renderState()}
    `;
  }
}

customElements.define("aitab-tool-ui", AITabToolUI);
