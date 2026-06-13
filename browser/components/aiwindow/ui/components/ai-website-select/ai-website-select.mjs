/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-checkbox.mjs";

const CHANGE_EVENT = "ai-website-select:change";

/**
 * A website select component for listing and selecting tabs
 *
 * @property {string} tabId - Id of tab
 * @property {string} label - The text content (tab name)
 * @property {string} iconSrc - Favicon or icon URL
 * @property {string} href - URL for the link
 * @property {boolean} checked - Whether this item is selected
 */
export class AIWebsiteSelect extends MozLitElement {
  static properties = {
    tabId: { type: String },
    label: { type: String },
    iconSrc: { type: String },
    href: { type: String },
    checked: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.tabId = "";
    this.label = "";
    this.iconSrc = "";
    this.href = "";
    this.checked = false;
  }

  /**
   * Handle checkbox state changes and dispatch custom event
   * This allows parent containers to manage state centrally
   *
   * @param {Event} event - The change event from the checkbox
   */
  handleCheckboxChange(event) {
    // Prevent the default checkbox behavior if we want controlled component
    event.stopPropagation();
    const newCheckedState = event.target.checked;

    // Dispatch custom event with all relevant data for parent container
    const changeEvent = new CustomEvent(CHANGE_EVENT, {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        tabId: this.tabId,
        label: this.label,
        href: this.href,
        iconSrc: this.iconSrc,
        checked: newCheckedState,
      },
    });

    this.dispatchEvent(changeEvent);

    // Only update internal state if not prevented by parent
    if (!changeEvent.defaultPrevented) {
      this.checked = newCheckedState;
    }
  }

  /**
   * Programmatically set checked state
   *
   * @param {boolean} checked - The new checked state
   */
  setChecked(checked) {
    if (this.checked === checked) {
      return;
    }
    // Directly dispatch the custom event instead of calling handleCheckboxChange
    const changeEvent = new CustomEvent(CHANGE_EVENT, {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        tabId: this.tabId,
        label: this.label,
        href: this.href,
        iconSrc: this.iconSrc,
        checked,
      },
    });
    this.dispatchEvent(changeEvent);

    // Only update internal state if not prevented by parent
    if (!changeEvent.defaultPrevented) {
      this.checked = checked;
    }
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-website-select.css"
      />

      <moz-checkbox
        class="website-select-checkbox text-truncated-ellipsis"
        .checked=${this.checked}
        @change=${this.handleCheckboxChange}
        name=${this.tabId}
        value=${this.tabId}
        label=${this.label}
        iconSrc=${this.iconSrc ||
        "chrome://global/skin/icons/defaultFavicon.svg"}
        aria-label=${this.label}
      ></moz-checkbox>
    `;
  }
}

customElements.define("ai-website-select", AIWebsiteSelect);
