/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, when } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NonPrivateTabs: "resource:///modules/OpenTabs.sys.mjs",
  OpenTabsController: "resource:///modules/OpenTabsController.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  getTabsTargetForWindow: "resource:///modules/OpenTabs.sys.mjs",
});

const MAX_PREVIEW_TABS = 5;

// Time (in ms) the preview stays open after the pointer leaves the launcher
// button, so that the pointer can travel from the button onto the preview
// without it disappearing on the way.
const STICKY_TIME_MS = 100;

/**
 * Preview of the most recently active tabs, shown on hover over the Open Tabs
 * button in the sidebar launcher.
 */
export default class SidebarOpenTabsPreview extends MozLitElement {
  static properties = {
    tabItems: { type: Array },
  };

  static queries = {
    heading: ".preview-heading",
    rows: { all: ".preview-row" },
    showAllButton: ".show-all-button",
  };

  constructor() {
    super();
    this.tabItems = [];
    this.controller = new lazy.OpenTabsController();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "hoverPreviewEnabled",
      "sidebar.openTabsPanel.hoverPreview.enabled",
      true
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "showDelayMs",
      "ui.tooltip.delay_ms",
      500
    );
  }

  connectedCallback() {
    super.connectedCallback();
    this.panel = this.closest("panel");
    this.panel.addEventListener("popuphidden", this);
    this.addEventListener("mouseover", this);
    this.addEventListener("mouseout", this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#clearTimers();
    this.panel.removeEventListener("popuphidden", this);
    this.removeEventListener("mouseover", this);
    this.removeEventListener("mouseout", this);
    this._openTabsTarget?.removeEventListener("TabChange", this);
  }

  get openTabsTarget() {
    if (!this._openTabsTarget) {
      this._openTabsTarget = lazy.PrivateBrowsingUtils.isWindowPrivate(window)
        ? lazy.getTabsTargetForWindow(window)
        : lazy.NonPrivateTabs;
    }
    return this._openTabsTarget;
  }

  handleEvent(e) {
    switch (e.type) {
      case "mouseover":
        if (!this.contains(e.relatedTarget)) {
          this.#clearHideTimer();
        }
        break;
      case "mouseout":
        if (!this.contains(e.relatedTarget)) {
          this.deactivate();
        }
        break;
      case "TabChange":
        this.#updateTabItems();
        break;
      case "popuphidden":
        this._openTabsTarget?.removeEventListener("TabChange", this);
        break;
    }
  }

  /**
   * Schedule the preview to open against the given launcher button.
   *
   * @param {MozButton} anchor
   *   The Open Tabs button in the sidebar launcher.
   */
  activate(anchor) {
    if (!this.hoverPreviewEnabled) {
      return;
    }
    this.#clearHideTimer();
    if (this.panel.state == "open" || this._showTimer) {
      return;
    }
    this._showTimer = setTimeout(() => {
      this._showTimer = null;
      this.#show(anchor);
    }, this.showDelayMs);
  }

  deactivate() {
    this.#clearShowTimer();
    if (this.panel.state != "open" || this._hideTimer) {
      return;
    }
    this._hideTimer = setTimeout(() => {
      this._hideTimer = null;
      this.panel.hidePopup();
    }, STICKY_TIME_MS);
  }

  hide() {
    this.#clearTimers();
    this.panel.hidePopup();
  }

  async #show(anchor) {
    this.#updateTabItems();
    if (!this.tabItems.length) {
      return;
    }
    await this.updateComplete;
    this.openTabsTarget.addEventListener("TabChange", this);
    this.panel.openPopup(
      anchor.shadowRoot.querySelector(".button-background"),
      "topleft topright"
    );
  }

  #clearShowTimer() {
    if (this._showTimer) {
      clearTimeout(this._showTimer);
      this._showTimer = null;
    }
  }

  #clearHideTimer() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  #clearTimers() {
    this.#clearShowTimer();
    this.#clearHideTimer();
  }

  #hasAudio(item) {
    return (
      item.indicators?.includes("soundplaying") ||
      item.indicators?.includes("muted")
    );
  }

  #isMuted(item) {
    return item.indicators?.includes("muted");
  }

  #updateTabItems() {
    const tabs = this.openTabsTarget.getRecentTabs().slice(0, MAX_PREVIEW_TABS);
    const items = this.controller.getTabListItems(tabs, false);
    this.tabItems = [
      ...items.filter(item => this.#hasAudio(item)),
      ...items.filter(item => !this.#hasAudio(item)),
    ];
  }

  #getIconSrc(item) {
    const { icon, url } = item;
    if (
      icon &&
      !icon.startsWith("http") &&
      !icon.startsWith("moz-remote-image:")
    ) {
      return icon;
    }
    if (url) {
      return `page-icon:${url}`;
    }
    return "chrome://global/skin/icons/defaultFavicon.svg";
  }

  #activateTab(item) {
    const { tabElement } = item;
    if (!tabElement) {
      return;
    }
    this.hide();
    const browserWindow = tabElement.documentGlobal;
    browserWindow.focus();
    browserWindow.gBrowser.selectedTab = tabElement;
  }

  #closeTab(e, item) {
    e.stopPropagation();
    const { tabElement } = item;
    tabElement?.documentGlobal.gBrowser.removeTabs([tabElement]);
  }

  #showAll() {
    this.hide();
    window.SidebarController.show("viewOpenTabsSidebar");
  }

  #audioButtonTemplate(item) {
    const muted = this.#isMuted(item);
    return when(
      this.#hasAudio(item),
      () => html`
        <moz-button
          class="audio-button"
          type="icon ghost"
          size="small"
          iconsrc=${muted
            ? "chrome://browser/skin/tabbrowser/tab-audio-muted-small.svg"
            : "chrome://browser/skin/tabbrowser/tab-audio-playing-small.svg"}
          data-l10n-id=${muted
            ? "sidebar-opentabs-preview-unmute-tab"
            : "sidebar-opentabs-preview-mute-tab"}
          @click=${e => this.#toggleAudio(e, item)}
        ></moz-button>
      `
    );
  }

  #toggleAudio(e, item) {
    e.preventDefault();
    e.stopPropagation();
    item.tabElement?.toggleMuteAudio();
  }

  #rowTemplate(item) {
    return html`
      <div
        class="preview-row"
        role="button"
        tabindex="-1"
        title=${item.title}
        @click=${() => this.#activateTab(item)}
      >
        <img
          class="favicon"
          role="presentation"
          src=${this.#getIconSrc(item)}
        />
        ${this.#audioButtonTemplate(item)}
        <span class="preview-row-title">${item.title}</span>
        <moz-button
          class="close-button"
          type="icon ghost"
          size="small"
          iconsrc="resource://content-accessible/close-12.svg"
          data-l10n-id="sidebar-opentabs-preview-close-tab"
          data-l10n-args=${JSON.stringify({ tabTitle: item.title })}
          @click=${e => this.#closeTab(e, item)}
        ></moz-button>
      </div>
    `;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/sidebar/sidebar-opentabs-preview.css"
      />
      <h2
        class="preview-heading"
        data-l10n-id="sidebar-opentabs-preview-heading"
      ></h2>
      <div class="preview-list">
        ${this.tabItems.map(item => this.#rowTemplate(item))}
      </div>
      <hr class="preview-separator" />
      <button
        class="show-all-button"
        data-l10n-id="firefoxview-show-all"
        @click=${() => this.#showAll()}
      ></button>
    `;
  }
}

customElements.define("sidebar-opentabs-preview", SidebarOpenTabsPreview);
