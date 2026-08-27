/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

import {
  classMap,
  html,
  when,
} from "chrome://global/content/vendor/lit.all.mjs";
import { searchTabList } from "chrome://browser/content/firefoxview/search-helpers.mjs";

import { SidebarPage } from "./sidebar-page.mjs";

ChromeUtils.defineESModuleGetters(lazy, {
  FxAccounts: "resource://gre/modules/FxAccounts.sys.mjs",
  NonPrivateTabs: "resource:///modules/OpenTabs.sys.mjs",
  OpenTabsController: "resource:///modules/OpenTabsController.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SidebarCollapsedWindows:
    "moz-src:///browser/components/sidebar/SidebarCollapsedWindows.sys.mjs",
  SidebarTreeView:
    "moz-src:///browser/components/sidebar/SidebarTreeView.sys.mjs",
  getTabsTargetForWindow: "resource:///modules/OpenTabs.sys.mjs",
});

export class SidebarOpenTabs extends SidebarPage {
  static properties = {
    windows: { type: Array },
    searchQuery: { type: String },
    sortOption: { type: String },
  };

  static queries = {
    searchTextbox: "moz-input-search",
    menuButton: ".menu-button",
  };

  initialWindowsReady = false;

  constructor() {
    super();
    this.windows = [];
    this.searchQuery = "";
    this.sortOption = Services.prefs.getStringPref(
      "sidebar.openTabsPanel.sortOption",
      "tabStripOrder"
    );
    this.handlePopupEvent = this.handlePopupEvent.bind(this);
    this.controller = new lazy.OpenTabsController();
    this.treeView = new lazy.SidebarTreeView(this, { multiSelect: false });
  }

  connectedCallback() {
    super.connectedCallback();
    const topWindow = this.topWindow;
    if (lazy.PrivateBrowsingUtils.isWindowPrivate(topWindow)) {
      this.openTabsTarget = lazy.getTabsTargetForWindow(topWindow);
    } else {
      this.openTabsTarget = lazy.NonPrivateTabs;
    }
    this.openTabsTarget.addEventListener("TabChange", this);
    this.openTabsTarget.addEventListener("TabRecencyChange", this);
    lazy.SidebarCollapsedWindows.addEventListener(
      "CollapsedWindowsChanged",
      this
    );
    this.addSidebarFocusedListeners();
    this.addContextMenuListeners();
    const { document: doc } = this.topWindow;
    this._menu = doc.getElementById("sidebar-opentabs-menu");
    this._menuSortByOrder = doc.getElementById(
      "sidebar-opentabs-sort-by-order"
    );
    this._menuSortByRecency = doc.getElementById(
      "sidebar-opentabs-sort-by-recency"
    );
    this._menu.addEventListener("command", this);
    this._menu.addEventListener("popuphidden", this.handlePopupEvent);
    this.openTabsTarget.readyWindowsPromise.finally(() => {
      this.initialWindowsReady = true;
      this.#updateWindowList();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.openTabsTarget.removeEventListener("TabChange", this);
    this.openTabsTarget.removeEventListener("TabRecencyChange", this);
    lazy.SidebarCollapsedWindows.removeEventListener(
      "CollapsedWindowsChanged",
      this
    );
    this.removeSidebarFocusedListeners();
    this.removeContextMenuListeners();
    this._menu.removeEventListener("command", this);
    this._menu.removeEventListener("popuphidden", this.handlePopupEvent);
  }

  shouldUpdate(changedProperties) {
    if (!this.initialWindowsReady) {
      return false;
    }
    return super.shouldUpdate(changedProperties);
  }

  handleEvent(e) {
    switch (e.type) {
      case "TabChange":
        this.#updateWindowList();
        break;
      case "TabRecencyChange":
      case "CollapsedWindowsChanged":
        this.requestUpdate();
        break;
      default:
        super.handleEvent(e);
        break;
    }
  }

  handleContextMenuEvent(e) {
    this.triggerNode = this.findTriggerNode(e, "sidebar-tab-row");
    if (!this.triggerNode) {
      e.preventDefault();
      return;
    }
    const privateWindowItem = this._contextMenu.querySelector(
      "#sidebar-opentabs-context-open-in-private-window"
    );
    privateWindowItem.hidden = !lazy.PrivateBrowsingUtils.enabled;
  }

  async handleCommandEvent(e) {
    switch (e.target.id) {
      case "sidebar-opentabs-context-close-tab": {
        const { tabElement } = this.triggerNode;
        tabElement?.documentGlobal.gBrowser.removeTabs([tabElement]);
        break;
      }
      case "sidebar-opentabs-sort-by-order":
        this.#changeSortOption("tabStripOrder");
        break;
      case "sidebar-opentabs-sort-by-recency":
        this.#changeSortOption("recency");
        break;
      case "sidebar-opentabs-connect-another-device": {
        const url = await lazy.FxAccounts.config.promisePairingURI({
          entrypoint: "sidebar",
        });
        this.topWindow.openTrustedLinkIn(url, "tab");
        break;
      }
      default:
        super.handleCommandEvent(e);
        break;
    }
  }

  openMenu(e) {
    const menuPos = this.sidebarController._positionStart
      ? "after_start"
      : "after_end";
    this._menu.openPopup(e.target, menuPos, 0, 0, false, false, e);
    this.menuButton.setAttribute("aria-expanded", true);
  }

  handlePopupEvent(e) {
    if (e.type == "popuphidden") {
      this.menuButton.setAttribute("aria-expanded", false);
    }
  }

  willUpdate() {
    this._menuSortByOrder.toggleAttribute(
      "checked",
      this.sortOption == "tabStripOrder"
    );
    this._menuSortByRecency.toggleAttribute(
      "checked",
      this.sortOption == "recency"
    );
  }

  #changeSortOption(sortOption) {
    this.sortOption = sortOption;
    Services.prefs.setStringPref(
      "sidebar.openTabsPanel.sortOption",
      sortOption
    );
    this.requestUpdate();
  }

  #updateWindowList() {
    this.windows = [...this.openTabsTarget.currentWindows];
  }

  getTabItemsForWindow(win) {
    const tabs = this.openTabsTarget.getTabsForWindow(
      win,
      this.sortOption === "recency"
    );
    return this.controller.getTabListItems(tabs, false).map(item => ({
      ...item,
      secondaryL10nId: "fxviewtabrow-close-tab-button",
      secondaryL10nArgs: JSON.stringify({ tabTitle: item.title }),
    }));
  }

  #activateTab(tabElement) {
    if (!tabElement) {
      return;
    }
    const browserWindow = tabElement.documentGlobal;
    browserWindow.focus();
    browserWindow.gBrowser.selectedTab = tabElement;
  }

  #getPinnedIconSrc(item) {
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

  onPrimaryAction(e) {
    this.#activateTab(e.originalTarget.tabElement);
    Glean.sidebar.link.open_tabs.add(1);
  }

  onSecondaryAction(e) {
    const { tabElement } = e.detail.item;
    if (!tabElement) {
      return;
    }
    tabElement.documentGlobal.gBrowser.removeTabs([tabElement]);
  }

  #onCardToggle(event) {
    const windowId = event.currentTarget.dataset.windowId;
    if (!windowId) {
      return;
    }
    if (event.newState === "closed") {
      lazy.SidebarCollapsedWindows.collapseWindowById(windowId);
    } else {
      lazy.SidebarCollapsedWindows.expandWindowById(windowId);
    }
    this.dispatchEvent(new CustomEvent("folder-toggle"));
  }

  #pinnedTabsTemplate(pinnedTabItems, isCurrent) {
    return html`
      <div
        class="pinned-tabs"
        role="tablist"
        data-l10n-id="sidebar-opentabs-pinned-tabs"
      >
        ${pinnedTabItems.map(
          item => html`
            <moz-button
              type="icon ghost"
              class=${classMap({
                selected: item.tabElement?.selected,
                inactive: !isCurrent,
              })}
              .iconSrc=${this.#getPinnedIconSrc(item)}
              title=${item.title}
              @click=${() => this.#activateTab(item.tabElement)}
            ></moz-button>
          `
        )}
      </div>
    `;
  }

  #windowCardTemplate(win, winID, isCurrent) {
    let items = this.getTabItemsForWindow(win);
    if (this.searchQuery) {
      items = searchTabList(this.searchQuery, items);
    }
    const pinnedTabItems = items.filter(item =>
      item.indicators?.includes("pinned")
    );
    const unpinnedTabItems = items.filter(
      item => !item.indicators?.includes("pinned")
    );
    const headerL10nId = isCurrent
      ? "sidebar-opentabs-current-window-header"
      : "sidebar-opentabs-window-header";
    const windowId = win.__SSi;
    const expanded = !lazy.SidebarCollapsedWindows.isCollapsed(win);
    return html`
      <moz-card
        type="accordion"
        ?expanded=${expanded}
        class="window-card"
        data-inner-id=${win.windowGlobalChild.innerWindowId}
        data-window-id=${windowId}
        data-l10n-id=${headerL10nId}
        data-l10n-args=${JSON.stringify({ winID })}
        @toggle=${this.#onCardToggle}
        @keydown=${this.keydownHandler}
      >
        ${when(pinnedTabItems.length, () =>
          this.#pinnedTabsTemplate(pinnedTabItems, isCurrent)
        )}
        <sidebar-tab-list
          maxTabsLength="-1"
          secondaryActionClass="dismiss-button"
          .multiSelect=${false}
          .searchQuery=${this.searchQuery}
          .mediumView=${true}
          .inactiveWindow=${!isCurrent}
          .dateTimeFormat=${"time"}
          .tabItems=${unpinnedTabItems}
          @fxview-tab-list-primary-action=${this.onPrimaryAction}
          @fxview-tab-list-secondary-action=${this.onSecondaryAction}
        ></sidebar-tab-list>
      </moz-card>
    `;
  }

  #windowCardsTemplate() {
    const topWindow = this.topWindow;
    let currentCard;
    const otherCards = [];
    let index = 1;
    for (const win of this.windows) {
      const winID = index++;
      if (
        this.searchQuery &&
        !searchTabList(this.searchQuery, this.getTabItemsForWindow(win)).length
      ) {
        continue;
      }
      const isCurrent = win === topWindow;
      const card = this.#windowCardTemplate(win, winID, isCurrent);
      if (isCurrent) {
        currentCard = card;
      } else {
        otherCards.push(card);
      }
    }
    return html`${currentCard}${otherCards}`;
  }

  #searchResultsTemplate() {
    const count = this.windows.reduce(
      (total, win) =>
        total +
        searchTabList(this.searchQuery, this.getTabItemsForWindow(win)).length,
      0
    );
    if (!count) {
      return html`
        <moz-card>
          <p
            class="no-results"
            data-l10n-id="firefoxview-search-results-empty"
            data-l10n-args=${JSON.stringify({ query: this.searchQuery })}
          ></p>
        </moz-card>
      `;
    }
    return html`
      <moz-card
        data-l10n-id="sidebar-search-results-header"
        data-l10n-args=${JSON.stringify({ query: this.searchQuery })}
      >
        <div>
          <h3
            slot="secondary-header"
            data-l10n-id="firefoxview-search-results-count"
            data-l10n-args=${JSON.stringify({ count })}
          ></h3>
          ${this.#windowCardsTemplate()}
        </div>
      </moz-card>
    `;
  }

  handleSidebarFocusedEvent() {
    this.searchTextbox?.focus();
  }

  onSearchQuery(e) {
    this.searchQuery = e.detail.query;
    this.treeView.resetActiveNode();
  }

  render() {
    return html`
      ${this.stylesheet()}
      <link
        rel="stylesheet"
        href="chrome://browser/content/sidebar/sidebar-opentabs.css"
      />
      <div class="sidebar-panel">
        <sidebar-panel-header
          data-l10n-id="sidebar-menu-open-tabs-header"
          data-l10n-attrs="heading"
          view="viewOpenTabsSidebar"
        >
          <div class="options-container">
            <moz-input-search
              data-l10n-id="firefoxview-search-text-box-tabs"
              data-l10n-attrs="placeholder"
              @MozInputSearch:search=${this.onSearchQuery}
            ></moz-input-search>
            <moz-button
              class="menu-button"
              @click=${this.openMenu}
              data-l10n-id="sidebar-options-menu-button"
              aria-haspopup="menu"
              aria-expanded="false"
              type="icon ghost"
              iconsrc="chrome://global/skin/icons/more.svg"
            ></moz-button>
          </div>
        </sidebar-panel-header>
        <div class="sidebar-panel-scrollable-content">
          ${this.searchQuery
            ? this.#searchResultsTemplate()
            : this.#windowCardsTemplate()}
        </div>
      </div>
    `;
  }
}

customElements.define("sidebar-opentabs", SidebarOpenTabs);
