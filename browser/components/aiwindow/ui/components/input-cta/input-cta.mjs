/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  ifDefined,
  repeat,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

/**
 * Input CTA button with action menu extending `moz-button`.
 *
 * @property {string|null} action - Current action or null for initial state.
 */
export class InputCta extends MozLitElement {
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    action: { type: String, reflect: true },
  };

  static ACTIONS = ["chat", "search", "navigate"];

  constructor() {
    super();
    this.action = null;
    this._menuId = `actions-menu-${crypto.randomUUID()}`;
  }

  get actionLabelId() {
    return this.action ? `aiwindow-input-cta-label-${this.action}` : "";
  }

  #setAction(key) {
    if (key === this.action || !InputCta.ACTIONS.includes(key)) {
      return;
    }

    this.action = key;
    this.dispatchEvent(
      new CustomEvent("aiwindow-input-cta:action-change", {
        detail: { action: key },
        bubbles: true,
        composed: true,
      })
    );
  }

  willUpdate(changedProps) {
    if (
      changedProps.has("action") &&
      this.action !== null &&
      !InputCta.ACTIONS.includes(this.action)
    ) {
      console.warn(`Invalid action: ${this.action}`);
      this.action = null;
    }
  }

  render() {
    const panelListTemplate = this.action
      ? html`<panel-list id=${this._menuId}>
          ${repeat(
            InputCta.ACTIONS,
            key => key,
            key =>
              html`<panel-item
                @click=${() => this.#setAction(key)}
                data-l10n-id=${`aiwindow-input-cta-label-${key}`}
              ></panel-item>`
          )}
        </panel-list>`
      : null;

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/input-cta.css"
      />
      <moz-button
        type=${this.action ? "split" : "default"}
        class="input-cta"
        menuId=${ifDefined(this.action ? this._menuId : undefined)}
        .iconSrc=${this.action
          ? undefined
          : "chrome://browser/content/aiwindow/assets/input-cta-arrow-icon.svg"}
        ?disabled=${!this.action}
      >
        <slot>
          <span
            data-l10n-id=${ifDefined(this.actionLabelId || undefined)}
          ></span>
        </slot>
      </moz-button>
      ${panelListTemplate}
    `;
  }
}

customElements.define("input-cta", InputCta);
