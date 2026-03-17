/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "../vendor/lit.all.mjs";
import { MozLitElement } from "../lit-utils.mjs";

window.MozXULElement?.insertFTLIfNeeded("toolkit/global/mozPageHeader.ftl");

/**
 * A header component for providing context about a specific page.
 *
 * @tagname moz-page-header
 * @property {string} heading - The page title text.
 * @property {string} description - Secondary text shown under the heading.
 * @property {string} iconSrc - The src for an optional icon.
 * @property {string} supportPage - Optional URL for a related support article.
 * @property {boolean} backButton - Whether or not the header should include a back button.
 * @property {"beta" | "new" | undefined} badge - Include a badge of this type with matching text.
 * @slot breadcrumbs - Container for a <moz-breadcrumb-group, shown above the heading.
 * @fires navigate-back
 *  Event indicating the backwards navigation should occur.
 */
export default class MozPageHeader extends MozLitElement {
  static properties = {
    heading: { type: String, fluent: true },
    description: { type: String, fluent: true },
    iconSrc: { type: String },
    supportPage: { type: String, attribute: "support-page" },
    backButton: { type: Boolean },
    badge: { type: String },
  };

  static queries = {
    headingEl: "h1",
    backButtonEl: "moz-button",
  };

  constructor() {
    super();
    this.heading = "";
    this.description = "";
    this.iconSrc = "";
    this.supportPage = "";
    this.backButton = false;
    /** @type {"beta" | "new" | undefined} */
    this.badge = undefined;
  }

  backButtonTemplate() {
    if (!this.backButton) {
      return "";
    }
    return html`<moz-button
      type="ghost"
      data-l10n-id="back-nav-button-title"
      iconsrc="chrome://global/skin/icons/arrow-left.svg"
      class="back-button"
      @click=${this.handleBack}
    ></moz-button>`;
  }

  iconTemplate() {
    if (!this.iconSrc) {
      return "";
    }
    return html`<img src=${this.iconSrc} role="presentation" class="icon" />`;
  }

  descriptionTemplate() {
    if (!this.description) {
      return "";
    }
    return html`<span class="description" id="description">
        ${this.description}
      </span>
      ${this.supportLinkTemplate()}`;
  }

  supportLinkTemplate() {
    if (!this.supportPage) {
      return "";
    }
    return html`<a
      is="moz-support-link"
      support-page=${this.supportPage}
      part="support-link"
      class="support-link"
      aria-describedby=${this.description ? "description" : "heading"}
    ></a>`;
  }

  badgeTemplate() {
    if (!this.badge) {
      return "";
    }
    return html`<moz-badge type=${this.badge}></moz-badge>`;
  }

  handleBack() {
    this.dispatchEvent(new Event("navigate-back"));
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://global/content/elements/moz-page-header.css"
      />
      <link
        rel="stylesheet"
        href="chrome://global/skin/design-system/text-and-typography.css"
      />
      <div class="page-header-container">
        <slot name="breadcrumbs"></slot>
        <div class="heading">
          ${this.backButtonTemplate()}${this.iconTemplate()}
          <h1 id="heading">${this.heading}</h1>
          ${this.badgeTemplate()}
          ${!this.description ? this.supportLinkTemplate() : ""}
        </div>
        ${this.descriptionTemplate()}
      </div>
    `;
  }
}
customElements.define("moz-page-header", MozPageHeader);
