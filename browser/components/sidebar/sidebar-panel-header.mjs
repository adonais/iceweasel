/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/sidebar/sidebar-panel-switcher.mjs";

/**
 * Per-panel header showing the panel title and a close button, plus each
 * panel's own toolbar content (search boxes, options menus, etc.) via its
 * default slot. In horizontal-tabs "hide-launcher" mode the title is replaced
 * by the sidebar-panel-switcher dropdown (which switches between panels), since
 * there is no launcher to switch them with; this is toggled via CSS (see
 * sidebar-panel-header.css).
 */
export class SidebarPanelHeader extends MozLitElement {
  static properties = {
    view: { type: String },
    heading: { type: String },
  };

  static queries = {
    closeButton: "moz-button",
    switcher: "sidebar-panel-switcher",
  };

  getWindow() {
    return window.browsingContext.embedderWindowGlobal.browsingContext.window;
  }

  closeSidebarPanel(e) {
    e.preventDefault();
    const controller = this.getWindow().SidebarController;
    // In "hide-launcher" mode there is no launcher to return to, so keep the
    // panel remembered rather than revealing the launcher.
    controller.hide({
      dismissPanel: !controller._state.launcherHiddenWithPanel,
    });
  }

  render() {
    return html`
      <link rel="stylesheet" href="chrome://browser/content/sidebar/sidebar-panel-header.css"></link>
      <div class="sidebar-panel-heading">
        <h4 class="sidebar-panel-title text-truncated-ellipsis">${this.heading}</h4>
        <sidebar-panel-switcher view=${this.view}></sidebar-panel-switcher>
        <moz-button
          iconsrc="chrome://global/skin/icons/close.svg"
          data-l10n-id="sidebar-panel-header-close-button"
          @click=${this.closeSidebarPanel}
          view=${this.view}
          size="default"
          type="icon ghost"
        >
        </moz-button>
      </div>
      <slot></slot>
    `;
  }
}
customElements.define("sidebar-panel-header", SidebarPanelHeader);
