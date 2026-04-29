/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import MozButton from "chrome://global/content/elements/moz-button.mjs";
 * @import { SearchEngine } from "moz-src:///toolkit/components/search/SearchEngine.sys.mjs"
 * @import { PanelItem, PanelList } from "chrome://global/content/elements/panel-list.mjs"
 */
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
  OpenSearchManager:
    "moz-src:///browser/components/search/OpenSearchManager.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  SearchUIUtils: "moz-src:///browser/components/search/SearchUIUtils.sys.mjs",
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
  UrlbarSearchUtils:
    "moz-src:///browser/components/urlbar/UrlbarSearchUtils.sys.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "SearchModeSwitcherL10n", () => {
  return new Localization(["browser/browser.ftl"]);
});

// Default icon used for engines that do not have icons loaded.
const DEFAULT_ENGINE_ICON =
  "chrome://browser/skin/search-engine-placeholder@2x.png";

/**
 * Implements the SearchModeSwitcher in the urlbar.
 */
export class SearchModeSwitcher {
  static DEFAULT_ICON = lazy.UrlbarUtils.ICON.SEARCH_GLASS;
  static DEFAULT_ICON_KEYWORD_DISABLED = lazy.UrlbarUtils.ICON.GLOBE;
  /**
   * The maximum number of openSearch engines available to install
   * to display.
   */
  static MAX_OPENSEARCH_ENGINES = 3;

  /** @type {PanelList} */
  #panelList;
  /** @type {UrlbarInput} */
  #input;
  /** @type {MozButton} */
  #button;
  /** @type {HTMLButtonElement} */
  #closebutton;

  /**
   * @param {UrlbarInput} input
   */
  constructor(input) {
    this.#input = input;

    this.QueryInterface = ChromeUtils.generateQI([
      "nsIObserver",
      "nsISupportsWeakReference",
    ]);

    lazy.UrlbarPrefs.addObserver(this);

    this.#panelList = input.querySelector(".searchmode-switcher-panel-list");
    this.#button = input.querySelector(".searchmode-switcher");
    this.#closebutton = input.querySelector(".searchmode-switcher-close");

    // MozButton and PanelList have to be hooked up via id.
    this.#panelList.id = "searchmode-switcher-panel-list-" + input.sapName;
    this.#button.setAttribute("menuid", this.#panelList.id);

    // In XUL documents, wrap in a XUL panel to make sure it's
    // on top of the overflow panel and catches all keypresses.
    let document = this.#panelList.ownerDocument;
    if (document.createXULElement) {
      let panel = document.createXULElement("panel");
      panel.setAttribute("level", "top");
      panel.setAttribute("consumeoutsideclicks", "false");
      panel.classList.add("searchmode-switcher-panel", "toolbar-menupopup");
      this.#panelList.replaceWith(panel);
      panel.appendChild(this.#panelList);
    }

    if (this.#isEnabled) {
      this.#enableObservers();
    }
  }

  #isEnabled() {
    return (
      lazy.UrlbarPrefs.get("scotchBonnet.enableOverride") ||
      this.#input.sapName == "searchbar"
    );
  }

  async #onPopupShowing() {
    await this.#buildSearchModeList();
    this.#input.view.close({ showFocusBorder: false });

    if (this.#input.sapName == "urlbar") {
      Glean.urlbarUnifiedsearchbutton.opened.add(1);
    }
  }

  /**
   * Close the SearchSwitcher popup.
   */
  closePanel() {
    this.#panelList.hide(null, { force: true });
  }

  #openPreferences(event) {
    if (event.type == "click" && event.button != 0) {
      return; // Left click only
    }

    event.preventDefault();
    event.stopPropagation();

    this.#input.window.openPreferences("paneSearch");
    this.closePanel();

    if (this.#input.sapName == "urlbar") {
      Glean.urlbarUnifiedsearchbutton.picked.settings.add(1);
    }
  }

  /**
   * Exit the engine specific searchMode.
   *
   * @param {Event} event
   *        The event that triggered the searchMode exit.
   */
  exitSearchMode(event) {
    event.preventDefault();
    this.#input.searchMode = null;
    // Update the result by the default engine.
    this.#input.startQuery();
  }

  /**
   * Called when the value of the searchMode attribute on UrlbarInput is changed.
   */
  onSearchModeChanged() {
    if (!this.#input.window || this.#input.window.closed) {
      return;
    }

    if (this.#isEnabled()) {
      this.updateSearchIcon();

      let engine = lazy.UrlbarSearchUtils.getEngineByName(
        this.#input.searchMode?.engineName
      );
      if (engine && engine.isConfigEngine && !engine.hasBeenUsed) {
        engine.markAsUsed();
      }
    }
  }

  handleEvent(event) {
    if (event.currentTarget.localName == "panel-item") {
      this.#handlePanelItemEvent(event);
      return;
    }
    if (event.currentTarget == this.#closebutton) {
      // Prevent click and mousedown from bubbling up
      // to #button which would open the popup.
      event.stopPropagation();
      if (event.type == "click") {
        this.#input.focus();
        this.exitSearchMode(event);
      }
      return;
    }
    if (event.type == "focus") {
      this.#input.setUnifiedSearchButtonAvailability(true);
      return;
    }
    if (event.type == "showing") {
      this.#onPopupShowing();
      return;
    }
    if (event.type == "hidden") {
      if (this.#input.document.activeElement == this.#button) {
        // This moves the focus to the urlbar when the popup is closed.
        this.#input.focus();
      }
      return;
    }
    if (event.type == "keydown") {
      if (this.#input.view.isOpen) {
        // The urlbar view is open, which means the unified search button got
        // focus by tab key from urlbar.
        switch (event.keyCode) {
          case KeyEvent.DOM_VK_TAB: {
            // Move the focus to urlbar view to make cyclable.
            this.#input.focus();
            this.#input.view.selectBy(1, {
              reverse: event.shiftKey,
              userPressedTab: true,
            });
            event.preventDefault();
            return;
          }
          case KeyEvent.DOM_VK_ESCAPE: {
            this.#input.view.close();
            this.#input.focus();
            event.preventDefault();
            return;
          }
        }
      }

      // Manually open the popup on down.
      if (event.keyCode == KeyEvent.DOM_VK_DOWN) {
        this.#panelList.show(event);
      }
    }
  }

  /**
   * @param {MouseEvent|KeyboardEvent} event
   *  A mouseup, click or keydown event.
   *  Click is used for regular mouse clicks.
   *  Keydown is used for keyboard clicks (bug 1245292).
   *  Auxclick is used for middle clicks.
   */
  #handlePanelItemEvent(event) {
    switch (event.type) {
      case "click": {
        let mouseEvent = /** @type {MouseEvent} */ (event);
        // Prevent the panel from closing. We handle that manually.
        mouseEvent.stopPropagation();

        if (mouseEvent.inputSource == MouseEvent.MOZ_SOURCE_KEYBOARD) {
          // Keyboard clicks always have shiftKey=false due to bug 1245292.
          // For now, we handle them on keydown instead.
          return;
        }
        break;
      }
      case "keydown": {
        let keyboardEvent = /** @type {KeyboardEvent} */ (event);
        if (
          keyboardEvent.keyCode != KeyEvent.DOM_VK_SPACE &&
          keyboardEvent.keyCode != KeyEvent.DOM_VK_RETURN
        ) {
          return;
        }
        break;
      }
      case "auxclick": {
        let mouseEvent = /** @type {MouseEvent} */ (event);
        if (mouseEvent.button != 1) {
          // Ignore non-middle-auxclicks.
          return;
        }
        break;
      }
    }

    let panelItem = /** @type {PanelItem} */ (event.currentTarget);
    switch (panelItem.dataset.action) {
      case "openpreferences": {
        this.#openPreferences(event);
        break;
      }
      case "searchmode": {
        let engineId = panelItem.dataset.engineId;
        this.#remoteSearch(lazy.SearchService.getEngineById(engineId), event);
        break;
      }
      case "localsearchmode": {
        let restrict = panelItem.dataset.restrict;
        this.#localSearch(restrict);
        break;
      }
      case "installopensearch": {
        // @ts-expect-error
        let engine = panelItem._engine;
        this.#installOpenSearchEngine(event, engine);
        break;
      }
    }
  }

  /**
   * @param {PanelItem} panelItem
   */
  #addCommandListeners(panelItem) {
    panelItem.addEventListener("click", this);
    panelItem.addEventListener("keydown", this);
    panelItem.addEventListener("auxclick", this);
  }

  observe(_subject, topic, data) {
    if (
      !this.#input.window ||
      this.#input.window.closed ||
      // TODO bug 2005783 stop observing when input is disconnected.
      !this.#input.isConnected
    ) {
      return;
    }

    switch (topic) {
      case "browser-search-engine-modified": {
        if (
          data === "engine-default" ||
          data === "engine-default-private" ||
          data === "engine-icon-changed"
        ) {
          this.updateSearchIcon();
        }
        break;
      }
    }
  }

  /**
   * Called when a urlbar pref changes.
   *
   * @param {string} pref
   *   The name of the pref relative to `browser.urlbar`.
   */
  onPrefChanged(pref) {
    if (!this.#input.window || this.#input.window.closed) {
      return;
    }

    if (this.#input.sapName == "searchbar") {
      // The searchbar cares about neither of the two prefs.
      return;
    }

    switch (pref) {
      case "scotchBonnet.enableOverride": {
        if (lazy.UrlbarPrefs.get("scotchBonnet.enableOverride")) {
          this.#enableObservers();
          this.updateSearchIcon();
        } else {
          this.#disableObservers();
        }
        break;
      }
      case "keyword.enabled": {
        if (lazy.UrlbarPrefs.get("scotchBonnet.enableOverride")) {
          this.updateSearchIcon();
        }
        break;
      }
    }
  }

  /**
   * If the user presses Option+Up or Option+Down we open the engine list.
   *
   * @param {KeyboardEvent} event
   *   The key down event.
   */
  handleKeyDown(event) {
    if (
      (event.keyCode == KeyEvent.DOM_VK_UP ||
        event.keyCode == KeyEvent.DOM_VK_DOWN) &&
      event.altKey
    ) {
      this.#panelList.show(event, this.#button);
      event.stopPropagation();
      event.preventDefault();
      return true;
    }
    return false;
  }

  async updateSearchIcon() {
    let searchMode = this.#input.searchMode;

    try {
      await lazy.UrlbarSearchUtils.init();
    } catch {
      console.error("Search service failed to init");
    }

    let { label, icon } = await this.#getDisplayedEngineDetails(
      this.#input.searchMode
    );

    if (searchMode?.source != this.#input.searchMode?.source) {
      return;
    }

    const inSearchMode = this.#input.searchMode;
    if (!lazy.UrlbarPrefs.get("unifiedSearchButton.always")) {
      const keywordEnabled = lazy.UrlbarPrefs.get("keyword.enabled");
      if (
        this.#input.sapName != "searchbar" &&
        !keywordEnabled &&
        !inSearchMode
      ) {
        icon = SearchModeSwitcher.DEFAULT_ICON_KEYWORD_DISABLED;
      }
    } else if (!inSearchMode) {
      icon = SearchModeSwitcher.DEFAULT_ICON;
    }

    this.#button.setAttribute("iconsrc", icon);

    if (label) {
      this.#input.document.l10n.setAttributes(
        this.#button,
        "urlbar-searchmode-button3",
        { engine: label }
      );
    } else {
      this.#input.document.l10n.setAttributes(
        this.#button,
        "urlbar-searchmode-button-no-engine2"
      );
    }

    let labelEl = this.#input.querySelector(".searchmode-switcher-title");
    if (!inSearchMode) {
      labelEl.replaceChildren();
    } else {
      labelEl.textContent = label;
    }

    if (
      !lazy.UrlbarPrefs.get("keyword.enabled") &&
      this.#input.sapName != "searchbar"
    ) {
      this.#input.document.l10n.setAttributes(
        this.#button,
        "urlbar-searchmode-no-keyword2"
      );
    }
  }

  async #getSearchModeLabel(source) {
    let mode = lazy.UrlbarUtils.LOCAL_SEARCH_MODES.find(
      m => m.source == source
    );
    let [str] = await lazy.SearchModeSwitcherL10n.formatMessages([
      { id: mode.uiLabel },
    ]);
    return str.value;
  }

  async #getDisplayedEngineDetails(searchMode = null) {
    if (!lazy.SearchService.hasSuccessfullyInitialized) {
      return { label: null, icon: SearchModeSwitcher.DEFAULT_ICON };
    }

    if (!searchMode || searchMode.engineName) {
      let engine = searchMode
        ? lazy.UrlbarSearchUtils.getEngineByName(searchMode.engineName)
        : lazy.UrlbarSearchUtils.getDefaultEngine(
            lazy.PrivateBrowsingUtils.isWindowPrivate(this.#input.window)
          );
      if (!engine) {
        return { label: null, icon: SearchModeSwitcher.DEFAULT_ICON };
      }
      let icon = (await engine.getIconURL()) ?? SearchModeSwitcher.DEFAULT_ICON;
      return { label: engine.name, icon };
    }

    let mode = lazy.UrlbarUtils.LOCAL_SEARCH_MODES.find(
      m => m.source == searchMode.source
    );
    return {
      label: await this.#getSearchModeLabel(searchMode.source),
      icon: mode.icon,
    };
  }

  /**
   * Builds the popup and dispatches a rebuild event on the popup when finished.
   */
  async #buildSearchModeList() {
    for (let item of this.#panelList.querySelectorAll("panel-item")) {
      item.remove();
    }

    let browser = this.#input.window.gBrowser;
    let installedEngineSeparator = this.#panelList.querySelector(
      ".searchmode-switcher-panel-installed-engine-separator"
    );
    let footerSeparator = this.#panelList.querySelector(
      ".searchmode-switcher-panel-footer-separator"
    );

    // Add installed engines.
    /** @type {SearchEngine[]} */
    let engines = [];
    try {
      engines = await lazy.SearchService.getVisibleEngines();
    } catch {
      console.error("Failed to fetch engines");
    }

    for (let engine of engines) {
      if (engine.hideOneOffButton) {
        continue;
      }
      let icon = await engine.getIconURL();
      let menuitem = this.#createButton(icon, engine.name);
      menuitem.classList.add("searchmode-switcher-installed");
      menuitem.setAttribute("label", engine.name);
      menuitem.setAttribute("title", engine.name);
      menuitem.setAttribute("closemenu", "none");

      if (engine.isNew() && engine.isAppProvided) {
        menuitem.setAttribute("badge-type", "new");
      }

      menuitem.dataset.engineId = engine.id;
      // This attribute is for testing.
      menuitem.dataset.engineName = engine.name;
      menuitem.dataset.action = "searchmode";
      this.#addCommandListeners(menuitem);
      installedEngineSeparator.before(menuitem);
    }

    await this.#buildLocalSearchModeList(footerSeparator);
    this.#buildSettingsButton();

    // Add engines that can be installed.
    let openSearchEngines = lazy.OpenSearchManager.getEngines(
      browser.selectedBrowser
    );
    openSearchEngines = openSearchEngines.slice(
      0,
      SearchModeSwitcher.MAX_OPENSEARCH_ENGINES
    );

    for (let engine of openSearchEngines) {
      let menuitem = this.#createButton(engine.icon);
      this.#input.document.l10n.setAttributes(
        menuitem,
        "urlbar-searchmode-popup-add-engine",
        {
          engineName: engine.title,
        }
      );
      menuitem.classList.add("searchmode-switcher-addEngine");
      menuitem.dataset.action = "installopensearch";
      // This attribute is for testing.
      menuitem.dataset.engineName = engine.title;
      this.#addCommandListeners(menuitem);
      // @ts-expect-error
      menuitem._engine = engine;

      footerSeparator.after(menuitem);
    }

    if (this.#panelList.wasOpenedByKeyboard) {
      // Focus will not be on first item anymore because new
      // items were added after the panel list was shown.
      this.#panelList.focusWalker.currentNode = this.#panelList;
      this.#panelList.focusWalker.nextNode();
    }
    this.#panelList.dispatchEvent(new Event("rebuild"));
  }

  /**
   * @param {MouseEvent|KeyboardEvent} event
   * @returns {string}
   *   Where the search engine result page should be opened.
   */
  #whereToOpenSerp(event) {
    let where = lazy.BrowserUtils.whereToOpenLink(event, false, true);
    // Usually, shift means "open in new window", but in the search
    // mode switcher it means "open SERP even if urlbar is empty",
    // so we just return tab, tabshifted or current but never window.
    if (where.startsWith("tab")) {
      return where;
    }
    return "current";
  }

  /**
   * Adds local options to the popup.
   *
   * @param {Element} separator
   */
  async #buildLocalSearchModeList(separator) {
    if (this.#input.sapName != "urlbar") {
      return;
    }

    for (let { source, pref, restrict } of lazy.UrlbarUtils
      .LOCAL_SEARCH_MODES) {
      if (!lazy.UrlbarPrefs.get(pref)) {
        continue;
      }
      let name = lazy.UrlbarUtils.getResultSourceName(source);
      let { icon } = await this.#getDisplayedEngineDetails({
        source,
        pref,
        restrict,
      });
      let menuitem = this.#createButton(icon);
      menuitem.classList.add(
        "searchmode-switcher-local",
        `search-button-${name}`
      );
      menuitem.dataset.action = "localsearchmode";
      menuitem.dataset.restrict = restrict;
      this.#addCommandListeners(menuitem);
      this.#input.document.l10n.setAttributes(
        menuitem,
        `urlbar-searchmode-${name}2`
      );

      separator.before(menuitem);
    }
  }

  /**
   * Ideally the settings button would be in the markup because it never
   * changes but that causes an an assertion error in BindingUtils.cpp.
   */
  #buildSettingsButton() {
    // Icon is set via css based on the class.
    let menuitem = this.#createButton(undefined);
    menuitem.classList.add("searchmode-switcher-panel-search-settings-button");
    menuitem.dataset.action = "openpreferences";
    this.#input.document.l10n.setAttributes(
      menuitem,
      Services.prefs.getBoolPref("browser.nova.enabled", false)
        ? "urlbar-searchmode-popup-settings-panelitem"
        : "urlbar-searchmode-popup-search-settings-panelitem"
    );
    this.#addCommandListeners(menuitem);
    this.#panelList.appendChild(menuitem);
  }

  /**
   * Enables a local search mode based on the restrict token.
   *
   * @param {string} restrict
   *   The restrict token
   */
  #localSearch(restrict) {
    this.closePanel();

    this.#input.search(restrict + " " + this.#getSearchString(), {
      searchModeEntry: "searchbutton",
    });

    if (this.#input.sapName == "urlbar") {
      Glean.urlbarUnifiedsearchbutton.picked.local_search.add(1);
    }
  }

  /**
   * Enters searchmode in the urlbar or opens a SERP, depending
   * on whether the urlbar is empty.
   * Shift can also be used to force the SERP.
   *
   * @param {SearchEngine} searchEngine
   *   The engine to search with.
   * @param {KeyboardEvent|MouseEvent} event
   *   The event that triggered the search.
   */
  #remoteSearch(searchEngine, event) {
    let whereToOpenSerp = this.#whereToOpenSerp(event);
    let searchString = this.#getSearchString();
    if (!searchString && !event.shiftKey && whereToOpenSerp == "current") {
      // Go into searchmode.
      this.closePanel();
      this.#input.search("", {
        searchEngine,
        searchModeEntry: "searchbutton",
      });
    } else {
      // Go directly to SERP.
      if (whereToOpenSerp == "current") {
        this.closePanel();
      }

      this.#input.openSearchEnginePage(searchString, {
        event,
        searchEngine,
        where: whereToOpenSerp,
        inBackground: true,
      });
    }

    if (this.#input.sapName == "urlbar") {
      // TODO do we really need to distinguish here?
      Glean.urlbarUnifiedsearchbutton.picked[
        searchEngine.isConfigEngine ? "builtin_search" : "addon_search"
      ].add(1);
    }
  }

  /**
   * The string to use when starting a search via the search mode switcher.
   *
   * @returns {string}
   */
  #getSearchString() {
    if (this.#input.getAttribute("pageproxystate") == "valid") {
      return "";
    }
    return this.#input.value;
  }

  /**
   * Returns whether the event's target is an item
   * in the search mode switcher popup.
   *
   * @param {Event|null|undefined} event
   * @returns {boolean}
   */
  eventTargetIsPanelItem(event) {
    let target = event?.target;
    if (!target || !("classList" in target)) {
      return false;
    }
    let classList = /** @type {DOMTokenList}*/ (target.classList);

    return (
      classList.contains("searchmode-switcher-addEngine") ||
      classList.contains("searchmode-switcher-installed") ||
      classList.contains("searchmode-switcher-local")
    );
  }

  #enableObservers() {
    Services.obs.addObserver(this, "browser-search-engine-modified", true);

    this.#button.addEventListener("focus", this);
    this.#button.addEventListener("keydown", this);

    this.#panelList.addEventListener("showing", this);
    this.#panelList.addEventListener("hidden", this);

    this.#closebutton.addEventListener("click", this);
    this.#closebutton.addEventListener("mousedown", this);
  }

  #disableObservers() {
    Services.obs.removeObserver(this, "browser-search-engine-modified");

    this.#button.removeEventListener("focus", this);
    this.#button.removeEventListener("keydown", this);

    this.#panelList.removeEventListener("showing", this);
    this.#panelList.removeEventListener("hidden", this);

    this.#closebutton.removeEventListener("click", this);
    this.#closebutton.removeEventListener("mousedown", this);
  }

  /**
   * @param {string|undefined} icon
   *   The icon. Pass undefined to use the default engine icon.
   * @param {string} [label]
   *   The label. Can be omitted when setting it via fluent.
   */
  #createButton(icon, label) {
    let panelitem = /**@type {PanelItem} */ (
      this.#input.document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "panel-item"
      )
    );
    if (label) {
      panelitem.textContent = label;
    }
    panelitem.style.setProperty(
      "--icon-url",
      `url(${icon ?? DEFAULT_ENGINE_ICON})`
    );

    return panelitem;
  }

  async #installOpenSearchEngine(event, engine) {
    let topic = "browser-search-engine-modified";

    let observer = engineObj => {
      Services.obs.removeObserver(observer, topic);
      this.#remoteSearch(engineObj.wrappedJSObject, event);
    };
    Services.obs.addObserver(observer, topic);

    await lazy.SearchUIUtils.addOpenSearchEngine(
      engine.uri,
      engine.icon,
      this.#input.window.gBrowser.selectedBrowser.browsingContext
    );
  }
}
