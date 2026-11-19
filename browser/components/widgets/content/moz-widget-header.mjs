/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import-x/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import-x/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";

if (!window.MozXULElement) {
  document.l10n?.addResourceIds(["toolkit/global/mozButton.ftl"]);
}

/**
 * The header of a `moz-widget`, placed in its `header` slot.
 *
 * @property {string} title - The heading text.
 * @property {string} menuLabel - The accessible name of the menu button. Defaults to "More options".
 * @property {string} menuId - The id of the `panel-list` the menu button opens when the `menu` slot is empty. Set by `moz-widget` from its `menu` slot.
 * @slot leading - Content before the heading, such as a back button or badge.
 * @slot trailing - Content at the end of the header.
 * @slot menu - A `panel-list`.
 * @csspart heading - The heading element.
 */
export class MozWidgetHeader extends MozLitElement {
  static properties = {
    title: { type: String, fluent: true, mapped: true },
    menuLabel: { type: String, attribute: "menu-label", fluent: true },
    menuId: { type: String, attribute: "menu-id" },
    _menuId: { state: true },
  };

  constructor() {
    super();
    this.title = null;
    this.menuLabel = null;
    this.menuId = null;
    this._menuId = null;
  }

  willUpdate(changes) {
    super.willUpdate(changes);
    if (!this.hasUpdated) {
      this.#setMenu(this.querySelector(':scope > [slot="menu"]'));
    }
  }

  #onMenuSlotChange(event) {
    this.#setMenu(event.target.assignedElements()[0]);
  }

  #setMenu(menu) {
    if (menu) {
      menu.id ||= `moz-widget-header-menu-${crypto.randomUUID()}`;
    }
    this._menuId = menu?.id || null;
  }

  #renderMenuButton(menuId) {
    return html`<moz-button
      id="menu-button"
      type="ghost"
      size="small"
      iconsrc="chrome://global/skin/icons/more.svg"
      .menuId=${menuId}
      data-l10n-id=${this.menuLabel ? nothing : "moz-button-more-options"}
      .ariaLabel=${this.menuLabel}
      .title=${this.menuLabel}
    ></moz-button>`;
  }

  render() {
    const menuId = this._menuId || this.menuId;
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/widgets/moz-widget-header.css"
      />
      <slot name="leading"></slot>
      ${this.title
        ? html`<h2 id="heading" part="heading" title=${this.title}>
            ${this.title}
          </h2>`
        : nothing}
      <slot name="trailing" class=${menuId ? "with-menu" : ""}></slot>
      ${menuId ? this.#renderMenuButton(menuId) : nothing}
      <slot name="menu" @slotchange=${this.#onMenuSlotChange}></slot>
    `;
  }
}

customElements.define("moz-widget-header", MozWidgetHeader);
