/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UrlbarInputBase } from "chrome://browser/content/urlbar/UrlbarInputBase.mjs";
import UrlbarPrefs from "chrome://browser/content/urlbar/UrlbarContentPrefs.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarSearchUtils:
    "moz-src:///browser/components/urlbar/UrlbarSearchUtils.sys.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

/**
 * The search bar input, backing the `moz-searchbar` custom element.
 */
export class SearchbarInput extends UrlbarInputBase {
  /**
   * The new searchbar only initializes when its pref is enabled; otherwise the
   * legacy XUL searchbar is shown instead.
   *
   * @returns {boolean}
   */
  #shouldConnect() {
    return UrlbarPrefs.get("browser.search.widget.new");
  }

  connectedCallback() {
    if (!this.#shouldConnect()) {
      return;
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    if (!this.#shouldConnect()) {
      return;
    }
    super.disconnectedCallback();
  }

  sapInit() {
    // Add a native clear button.
    this.inputField.setAttribute("type", "search");
  }

  sapConnectedCallback() {
    if (document.documentElement.hasAttribute("customizing")) {
      return;
    }
    // Ensure we get persisted widths back, if we've been in the palette.
    let storedWidth = Services.xulStore.getValue(
      document.documentURI,
      this.parentElement.id,
      "width"
    );
    if (storedWidth) {
      this.parentElement.setAttribute("width", storedWidth);
      /** @type {XULElement} */ (this.parentElement).style.width =
        storedWidth + "px";
    }
  }

  sapDisconnectedCallback() {
    // Exit search mode to make sure it doesn't become stale while the
    // searchbar is invisible. Otherwise, the engine might get deleted but we
    // don't notice because the search service observer is inactive.
    this.searchMode = null;
  }

  initSapContextMenuItems() {
    // The clear-search-history item is only shown on the searchbar.
    this.addContextMenuItems({
      after: "edit-contextmenu-select-all",
      createItems: () => {
        let fragment = this.document.createDocumentFragment();
        let separator = this.document.createXULElement("menuseparator");

        let clearHistory = this.document.createXULElement("menuitem");
        clearHistory.setAttribute("anonid", "clear-search-history");
        this.document.l10n.setAttributes(clearHistory, "clear-search-history");
        clearHistory.addEventListener("command", () => {
          lazy.UrlbarUtils.clearFormHistory();
          this.handleRevert();
        });

        fragment.append(separator, clearHistory);
        return fragment;
      },
    });
  }

  onPrefChanged(pref) {
    super.onPrefChanged(pref);
    if (pref == "browser.search.widget.new" && this.isConnected) {
      if (UrlbarPrefs.get("browser.search.widget.new")) {
        // The connectedCallback was skipped. Init now.
        super.connectedCallback();
      } else {
        // Uninit now, the disconnectedCallback will be skipped.
        super.disconnectedCallback();
      }
    }
  }

  handleEmptyValueNavigation(event) {
    // Open the search engine page for the active or default engine.
    let searchEngine = this.searchMode
      ? lazy.UrlbarSearchUtils.getEngineByName(this.searchMode.engineName)
      : lazy.UrlbarSearchUtils.getDefaultEngine(this.isPrivate);
    this.openSearchEnginePage("", {
      searchEngine,
      event,
      where: this.controller.whereToOpen(event),
    });
  }
}

customElements.define("moz-searchbar", SearchbarInput);
