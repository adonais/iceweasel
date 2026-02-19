/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

export const AIWINDOW_URL = "chrome://browser/content/aiwindow/aiWindow.html";
const AIWINDOW_URI = Services.io.newURI(AIWINDOW_URL);
const FIRSTRUN_URL = "chrome://browser/content/aiwindow/firstrun.html";
const FIRSTRUN_URI = Services.io.newURI(FIRSTRUN_URL);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWindowMenu:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindowMenu.sys.mjs",

  SearchUIUtils: "moz-src:///browser/components/search/SearchUIUtils.sys.mjs",
  ChatStore:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs",
  PanelMultiView:
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

/**
 * AI Window Service
 */

export const AIWindow = {
  _initialized: false,
  _windowStates: new WeakMap(),
  _aiWindowMenu: null,

  /**
   * Handles startup tasks
   */

  init(win) {
    if (!this._windowStates.has(win)) {
      this._windowStates.set(win, {});
      this.initializeAITabsToolbar(win);
    }

    if (this._initialized) {
      return;
    }

    ChromeUtils.defineLazyGetter(
      AIWindow,
      "chatStore",
      () => new lazy.ChatStore()
    );
    this._initialized = true;
  },

  _onAIWindowEnabledPrefChange() {
    ChromeUtils.nondeterministicGetWeakMapKeys(this._windowStates).forEach(
      win => {
        this._updateButtonVisibility(win);
      }
    );
  },

  _updateButtonVisibility(win) {
    const isPrivateWindow = lazy.PrivateBrowsingUtils.isWindowPrivate(win);
    const modeSwitcherButton = win.document.getElementById("ai-window-toggle");
    if (modeSwitcherButton) {
      modeSwitcherButton.hidden = !this.isAIWindowEnabled() || isPrivateWindow;
    }
  },

  /**
   * Sets options for new AI Window if new or inherited conditions are met
   *
   * @param {object} options Used in BrowserWindowTracker.openWindow
   * @param {object} options.openerWindow Window making the BrowserWindowTracker.openWindow call
   * @param {object} options.args Array of arguments to pass to new window
   * @param {boolean} [options.aiWindow] Should new window be AI Window (true), Classic Window (false), or inherited from opener (undefined, default)
   * @param {boolean} [options.private] Should new window be Private Window
   * @param {boolean} [options.restoreSession] Should previous AI Window session be restored
   *
   * @returns {object} Modified arguments appended to the options object
   */
  handleAIWindowOptions({
    openerWindow,
    args,
    aiWindow = undefined,
    private: isPrivate = false,
    restoreSession = false,
  } = {}) {
    // Indicates whether the new window should inherit AI Window state from opener window
    const canInheritAIWindow =
      this.isAIWindowActiveAndEnabled(openerWindow) &&
      !isPrivate &&
      typeof aiWindow === "undefined";

    const willOpenAIWindow =
      (aiWindow && this.isAIWindowEnabled()) || canInheritAIWindow;

    if (!willOpenAIWindow) {
      return args;
    }

    args ??= Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

    if (!args.length) {
      const aiWindowURI = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      aiWindowURI.data = restoreSession ? "" : AIWINDOW_URL;
      args.appendElement(aiWindowURI);

      const aiOption = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
        Ci.nsIWritablePropertyBag2
      );
      aiOption.setPropertyAsBool("ai-window", aiWindow);
      args.appendElement(aiOption);
    }

    return args;
  },

  /**
   * Show Window Switcher button in tabs toolbar
   *
   * @param {object} win caller window
   */
  handleAIWindowSwitcher(win) {
    let view = lazy.PanelMultiView.getViewNode(
      win.document,
      "ai-window-toggle-view"
    );

    const isPrivateWindow = lazy.PrivateBrowsingUtils.isWindowPrivate(win);

    if (!isPrivateWindow) {
      view.querySelector("#ai-window-switch-classic").hidden = false;
      view.querySelector("#ai-window-switch-ai").hidden = false;
    }

    let windowState = this._windowStates.get(win);
    if (!windowState) {
      windowState = {};
      this._windowStates.set(win, windowState);
    }

    if (windowState.viewInitialized) {
      return;
    }

    view.addEventListener("command", event => {
      switch (event.target.id) {
        case "ai-window-switch-classic":
          this.toggleAIWindow(win, false);
          break;
        case "ai-window-switch-ai":
          this.toggleAIWindow(win, true);
          break;
      }
    });

    windowState.viewInitialized = true;
  },

  /**
   * Show Window Switcher button in tabs toolbar
   *
   * @param {Window} win caller window
   */
  initializeAITabsToolbar(win) {
    const modeSwitcherButton = win.document.getElementById("ai-window-toggle");
    if (!modeSwitcherButton) {
      return;
    }

    this._updateButtonVisibility(win);

    modeSwitcherButton.addEventListener("command", event => {
      if (win.PanelUI.panel.state == "open") {
        win.PanelUI.hide();
      } else if (win.PanelUI.panel.state == "closed") {
        this.handleAIWindowSwitcher(win);
        win.PanelUI.showSubView("ai-window-toggle-view", event.target, event);
      }
    });
  },

  /**
   * Is current window an AI Window
   *
   * @param {Window} win current Window
   * @returns {boolean} whether current Window is an AI Window
   */
  isAIWindowActive(win) {
    return !!win && win.document.documentElement.hasAttribute("ai-window");
  },

  /**
   * Is AI Window enabled
   *
   * @returns {boolean} whether AI Window is enabled
   */
  isAIWindowEnabled() {
    return this.AIWindowEnabled;
  },

  isAIWindowActiveAndEnabled(win) {
    return this.isAIWindowActive(win) && this.AIWindowEnabled;
  },

  /**
   * Check if window is being opened as an AI Window.
   *
   * @param {Window} win - The window to check
   * @returns {boolean} whether the window is being opened as an AI Window
   */
  isOpeningAIWindow(win) {
    const windowArgs = win?.arguments?.[1];
    if (!(windowArgs instanceof Ci.nsIPropertyBag2)) {
      return false;
    }

    return windowArgs.hasKey("ai-window");
  },

  /**
   * Is AI Window content page active
   *
   * @param {nsIURI} uri current URI
   * @returns {boolean} whether AI Window content page is active
   */
  isAIWindowContentPage(uri) {
    return (
      AIWINDOW_URI.equalsExceptRef(uri) || FIRSTRUN_URI.equalsExceptRef(uri)
    );
  },

  /**
   * Adds the AI Window app menu options
   *
   * @param {Event} event - History menu click event
   * @param {Window} win - current Window reference
   *
   * @returns {Promise} - Resolves when menu is done being added
   */
  appMenu(event, win) {
    if (!this._aiWindowMenu) {
      this._aiWindowMenu = new lazy.AIWindowMenu();
    }

    return this._aiWindowMenu.addMenuitems(event, win);
  },

  get newTabURL() {
    return AIWINDOW_URL;
  },

  /**
   * Performs a search in the default search engine with
   * passed query in the current tab.
   *
   * @param {string} query
   * @param {Window} window
   */
  async performSearch(query, window) {
    let engine = null;
    try {
      engine = await Services.search.getDefault();
    } catch (error) {
      console.error(`Failed to get default search engine:`, error);
    }

    const triggeringPrincipal =
      Services.scriptSecurityManager.getSystemPrincipal();

    await lazy.SearchUIUtils.loadSearch({
      window,
      searchText: query,
      where: "current",
      usePrivate: false,
      triggeringPrincipal,
      policyContainer: null,
      engine,
      searchUrlType: null,
      sapSource: "aiwindow_assistant",
    });
  },

  async toggleAIWindow(win, isTogglingToAIWindow) {
    let isActive = this.isAIWindowActive(win);
    if (isActive != isTogglingToAIWindow) {
      win.document.documentElement.toggleAttribute("ai-window");
      Services.obs.notifyObservers(win, "ai-window-state-changed");
    }
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  AIWindow,
  "AIWindowEnabled",
  "browser.aiwindow.enabled",
  false,
  AIWindow._onAIWindowEnabledPrefChange.bind(AIWindow)
);
