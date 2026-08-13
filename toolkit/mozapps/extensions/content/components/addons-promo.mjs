/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-card.mjs";

class AddonsPromo extends MozLitElement {
  static properties = {
    heading: { type: String, fluent: true },
    message: { type: String, fluent: true },
    imageSrc: { type: String, reflect: true },
    imageAlignment: { type: String, reflect: true },
    textCentered: { type: Boolean, reflect: true },
  };

  imageTemplate() {
    if (this.imageSrc) {
      return html`<div class="image-container">
        <img src=${this.imageSrc} alt="" />
      </div>`;
    }
    return nothing;
  }

  render() {
    return html`
      <link
        href="chrome://mozapps/content/extensions/components/addons-promo.css"
        rel="stylesheet"
      />
      <moz-card>
        <div class="promo-layout">
          ${this.imageTemplate()}
          <div class="text-container">
            ${this.heading
              ? html`<h2 class="heading heading-medium">${this.heading}</h2>`
              : nothing}
            <p class="message">${this.message}</p>
            <slot name="actions"></slot>
          </div>
        </div>
      </moz-card>
    `;
  }
}
customElements.define("addons-promo", AddonsPromo);
