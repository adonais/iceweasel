/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Stands in for a tab group's favicon, mirroring the tab group label: a box in
 * the group's color holding the first character of its name. The name is always
 * shown next to it, so the character is hidden from assistive technology.
 * Consumers size it with --tab-group-icon-size and --tab-group-icon-font-size.
 *
 * @property {string} label - Tab group name, of which the first character shows
 * @property {string} color - Tab group color name, as used by --tab-group-*
 */
export class TabGroupIcon extends MozLitElement {
  static properties = {
    label: { type: String },
    color: { type: String, reflect: true },
  };

  constructor() {
    super();
    this.label = "";
    this.color = "";
  }

  willUpdate(changedProperties) {
    if (!changedProperties.has("color")) {
      return;
    }
    // On this element, since a custom property substitutes where it is
    // declared rather than where it is used.
    const color = this.color || "gray";
    this.style.setProperty("--tab-group-color", `var(--tab-group-${color})`);
    this.style.setProperty(
      "--tab-group-text-color",
      `var(--tab-group-${color}-text)`
    );
  }

  // Array.from() so an astral first character is not cut in half.
  get #initial() {
    return (Array.from(this.label?.trim() ?? "")[0] ?? "").toUpperCase();
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/tab-group-icon.css"
      />
      <span aria-hidden="true">${this.#initial}</span>
    `;
  }
}

customElements.define("tab-group-icon", TabGroupIcon);
