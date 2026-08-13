/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Local sidebar/banner element for about:keyboard.
 *
 * Renders as a sticky sidebar by default, and as a sticky header on narrower
 * viewports. It includes the brand logo, page name, subheading text with a
 * support, a search and reset controls.
 */
class CustomkeysSidebar extends MozLitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <header
        class="customkeys-sidebar"
        data-l10n-attrs="aria-label"
        data-l10n-id="customkeys-sidebar"
      >
        <div class="customkeys-heading">
          <img
            class="brand-logo"
            alt=""
            src="chrome://branding/content/about-logo.png"
          />
          <h1 class="customkeys-title" data-l10n-id="customkeys-title"></h1>
        </div>
        <p class="customkeys-description">
          <span data-l10n-id="customkeys-description"></span>
          <a
            is="moz-support-link"
            data-l10n-id="customkeys-support-link-text"
            support-page="keyboard-shortcuts-perform-firefox-tasks-quickly"
            target="_blank"
          ></a>
        </p>
        <div class="customkeys-sidebar-actions">
          <moz-input-search
            id="search"
            data-l10n-id="customkeys-search-input"
            inputlayout="block"
          ></moz-input-search>
          <moz-button
            id="resetAll"
            data-l10n-id="customkeys-reset-all-button"
            iconsrc="chrome://global/skin/icons/arrow-counterclockwise-16.svg"
          ></moz-button>
        </div>
      </header>
    `;
  }
}

customElements.define("customkeys-sidebar", CustomkeysSidebar);
