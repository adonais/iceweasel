/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

const REFRESH_EVENT = "aitab-page-actions:refresh";
const DELETE_EVENT = "aitab-page-actions:delete";

/**
 * Page-level controls for a generated AI Tab page: re-fetch the sources the
 * page was built from, or delete the page.
 *
 * Owns the confirmation step for delete but performs neither action itself;
 * it reports intent and the host decides what to do.
 *
 * Fires `aitab-page-actions:refresh` and, once confirmed,
 * `aitab-page-actions:delete`. Both bubble and cross shadow boundaries.
 *
 * @property {boolean} refreshing - Whether a refresh is in flight. While set,
 *   the refresh button is disabled and reports its progress.
 */
export class AITabPageActions extends MozLitElement {
  static properties = {
    refreshing: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.refreshing = false;
  }

  get #dialog() {
    return this.renderRoot.querySelector("dialog");
  }

  #emit(type) {
    this.dispatchEvent(
      new CustomEvent(type, { bubbles: true, composed: true })
    );
  }

  #onRefresh() {
    if (this.refreshing) {
      return;
    }
    this.#emit(REFRESH_EVENT);
  }

  #onDeleteRequested() {
    this.#dialog?.showModal();
  }

  #onConfirmDelete() {
    this.#dialog?.close();
    this.#emit(DELETE_EVENT);
  }

  #renderDeleteDialog() {
    return html`
      <dialog class="aitab-delete-dialog">
        <div class="aitab-delete-dialog-content">
          <h2 data-l10n-id="aitab-page-delete-dialog-title"></h2>
          <p data-l10n-id="aitab-page-delete-dialog-message"></p>
          <div class="aitab-delete-dialog-buttons">
            <moz-button
              class="aitab-delete-confirm"
              type="destructive"
              data-l10n-id="aitab-page-delete-dialog-confirm"
              @click=${() => this.#onConfirmDelete()}
            ></moz-button>
            <moz-button
              class="aitab-delete-cancel"
              autofocus
              data-l10n-id="aitab-page-delete-dialog-cancel"
              @click=${() => this.#dialog?.close()}
            ></moz-button>
          </div>
        </div>
      </dialog>
    `;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-page-actions.css"
      />
      <div class="aitab-page-actions">
        <moz-button
          class="aitab-action-refresh"
          size="default"
          iconSrc="chrome://global/skin/icons/reload.svg"
          ?disabled=${this.refreshing}
          data-l10n-id=${this.refreshing
            ? "aitab-page-refreshing-sources"
            : "aitab-page-refresh-sources"}
          @click=${() => this.#onRefresh()}
        ></moz-button>
        <moz-button
          class="aitab-action-delete"
          type="icon"
          size="default"
          iconSrc="chrome://global/skin/icons/delete.svg"
          data-l10n-id="aitab-page-delete"
          @click=${() => this.#onDeleteRequested()}
        ></moz-button>
      </div>
      ${this.#renderDeleteDialog()}
    `;
  }
}

customElements.define("aitab-page-actions", AITabPageActions);
