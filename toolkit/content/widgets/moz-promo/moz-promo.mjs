/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "../vendor/lit.all.mjs";
import { MozLitElement } from "../lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

window.MozXULElement?.insertFTLIfNeeded("toolkit/global/mozPromo.ftl");

/**
 * A promotional callout element.
 *
 * @tagname moz-promo
 * @property {string} type - The type of promo, can be either
 *  "default" or "vibrant". Determines the colors of the promotional
 *  element
 * @property {string} heading - The heading of the promo element.
 * @property {string} message - The message of the promo element.
 * @property {string} imageSrc - The main image of the promo element.
 * @property {string} imageAlignment - How the image should be aligned. Can be "start", "end", "center".
 * @property {string} imageWidth - How big the image is sized. Can be "default", "small" or "large".
 * @property {string} imageDisplay - Whether the image touches the edge of the promo or has a little bit of padding around it. Can be "cover" or "padded".
 * @property {boolean} dismissable - Whether the promo can be dismissed.
 * @fires promo:user-dismissed
 *  Custom event indicating that the promo was dismissed by the user.
 */
export default class MozPromo extends MozLitElement {
  static queries = {
    actionsSlot: "slot[name=actions]",
    supportLinkSlot: "slot[name=support-link]",
    actionsSupportWrapper: ".actions-and-support-link-wrapper",
    closeButton: "moz-button.close",
  };

  static properties = {
    type: { type: String, reflect: true },
    heading: { type: String, fluent: true },
    message: { type: String, fluent: true },
    imageSrc: { type: String, reflect: true },
    imageWidth: { type: String, reflect: true },
    imageAlignment: { type: String, reflect: true },
    imageDisplay: { type: String, reflect: true },
    dismissable: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.type = "default";
    this.imageAlignment = "start";
    this.imageWidth = "small";
    this.imageDisplay = "padded";
    this.dismissable = false;
  }

  handleSlotChange() {
    let hasActions = this.actionsSlot.assignedNodes().length;
    let hasSupport = this.supportLinkSlot.assignedNodes().length;
    this.actionsSupportWrapper.classList.toggle(
      "active",
      hasActions || hasSupport
    );
  }

  headingTemplate() {
    if (this.heading) {
      return html`<h2 class="heading heading-medium">${this.heading}</h2>`;
    }
    return "";
  }
  imageTemplate() {
    if (this.imageSrc) {
      return html`
        <div class="image-container"><img src=${this.imageSrc} alt="" /></div>
      `;
    }
    return "";
  }

  closeButtonTemplate() {
    if (this.dismissable) {
      return html`
        <moz-button
          class="close"
          type="icon ghost"
          iconsrc="chrome://global/skin/icons/close.svg"
          data-l10n-id="moz-promo-close-button"
          @click=${this.dismiss}
        ></moz-button>
      `;
    }
    return "";
  }

  render() {
    let imageStartAligned = this.imageAlignment == "start";
    return html` <link
        rel="stylesheet"
        href="chrome://global/content/elements/moz-promo.css"
      />
      <div class="container">
        ${imageStartAligned ? this.imageTemplate() : ""}
        <div class="text-container">
          ${this.headingTemplate()}
          <p class="message">
            ${this.message}<span class="actions-and-support-link-wrapper">
              <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
              <slot
                name="support-link"
                @slotchange=${this.handleSlotChange}
              ></slot>
            </span>
          </p>
        </div>
        ${!imageStartAligned ? this.imageTemplate() : ""}
        ${this.closeButtonTemplate()}
      </div>`;
  }

  dismiss() {
    let event = new CustomEvent("promo:user-dismissed", {
      bubbles: true,
      cancelable: true,
    });
    this.dispatchEvent(event);
    if (!event.defaultPrevented) {
      this.close();
    }
  }

  close() {
    this.remove();
  }
}
customElements.define("moz-promo", MozPromo);
