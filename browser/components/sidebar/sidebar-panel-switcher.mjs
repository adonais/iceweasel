/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";

/**
 * A dropdown that switches between sidebar panels. Used by panels in
 * horizontal-tabs "hide-launcher" mode, where there is no launcher to switch
 * panels with. The element shows the current panel's name and, on click, lists
 * the other panels to switch to. It hides itself (via CSS) outside that mode.
 *
 * Built-in panels set the `view` attribute to the command ID of the panel
 * hosting it. Extension panels leave it unset, so they are identified by
 * whichever panel the sidebar currently has open instead.
 */
export class SidebarPanelSwitcher extends MozLitElement {
  static properties = {
    view: { type: String },
    label: { state: true },
    items: { state: true },
    open: { state: true },
  };

  static queries = {
    button: ".switcher-button",
    panelItems: { all: "panel-item" },
    panelList: "panel-list",
  };

  constructor() {
    super();
    this.label = "";
    this.items = [];
    this.open = false;
  }

  get #controller() {
    return window.browsingContext.embedderWindowGlobal.browsingContext.window
      .SidebarController;
  }

  get #currentView() {
    return this.view || this.#controller.currentID;
  }

  connectedCallback() {
    super.connectedCallback();
    // Extension panels share a single document which is reused as the user
    // switches between them, so re-resolve the label whenever a panel is shown.
    window.addEventListener("SidebarFocused", this);
    this.#updateLabel();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("SidebarFocused", this);
  }

  handleEvent() {
    this.#updateLabel();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has("view")) {
      this.#updateLabel();
    }
  }

  async #updateLabel() {
    const items = await this.#controller.getRevampSwitcherItems();
    this.label =
      items.find(item => item.view === this.#currentView)?.label ?? "";
  }

  async #onButtonClick(e) {
    // Rebuild the list each time so it reflects the currently enabled tools and
    // extensions, then open the dropdown anchored to the switcher button.
    this.items = await this.#controller.getRevampSwitcherItems();
    await this.updateComplete;
    this.panelList.toggle(e);
  }

  #onItemClick(view) {
    if (view !== this.#currentView) {
      this.#controller.show(view);
    }
  }

  render() {
    return html`
      <link rel="stylesheet" href="chrome://browser/content/sidebar/sidebar-panel-switcher.css"></link>
      <button
        class="switcher-button"
        aria-haspopup="menu"
        aria-expanded=${this.open}
        @click=${this.#onButtonClick}
      >
        <span class="switcher-label text-truncated-ellipsis">${this.label}</span>
        <img
          class="switcher-arrow"
          src="chrome://global/skin/icons/arrow-down-12.svg"
          role="presentation"
        />
      </button>
      <panel-list
        @shown=${() => (this.open = true)}
        @hidden=${() => (this.open = false)}
      >
        ${this.items.map(
          item => html`
            <panel-item
              type="checkbox"
              ?checked=${item.view === this.#currentView}
              @click=${() => this.#onItemClick(item.view)}
            >
              ${item.label}
            </panel-item>
          `
        )}
      </panel-list>
    `;
  }
}
customElements.define("sidebar-panel-switcher", SidebarPanelSwitcher);
