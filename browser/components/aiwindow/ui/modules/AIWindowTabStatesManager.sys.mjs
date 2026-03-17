/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWINDOW_URL:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  AIWindowUI:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindowUI.sys.mjs",
  ChatStore:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs",
});

/**
 * @typedef {{
 *   input: string,
 *   mode: string,
 *   pageUrl: URL,
 *   conversationId: string,
 *   keepSidebarOpen: boolean,
 *   conversation: ChatConversation,
 * }} TabState
 */

/**
 * Manages state changes of the tabs in AIWindow to keep both the
 * fullwindow and sidebar chats in sync as tabs are created/selected.
 *
 * @todo Bug 2016599
 * Handle close tab event to manage tabState in case of undo close tab
 */
export class AIWindowTabStatesManager {
  /**
   * The browser window instance that this manager operates on
   */
  #window;
  /**
   * The currently selected browser tab
   *
   * @type {MozTabbrowserTab}
   */
  #selectedTab;
  /**
   * A map of tabs and their states
   *
   * @type {WeakMap<MozTabbrowserTab, TabState>}
   */
  #tabStates;
  /**
   * Global progress listener for all tabs
   */
  #tabsListener;

  constructor(win) {
    this.#init(win);
  }

  /**
   * Get the tab associated with a particular conversation, if there is one.
   *
   * @param {string} conversationId
   *
   * @returns {?MozTabbrowserTab}
   */
  getConversationTab(conversationId) {
    const tabs = [...this.#window.gBrowser.tabs];
    const tab = tabs.find(t => {
      const tabState = this.#tabStates.get(t);

      return tabState && tabState.state.conversationId === conversationId;
    });

    return tab;
  }

  /**
   * Adds event listeners needed to manage tab states
   *
   * @param {ChromeWindow} win
   *
   * @private
   */
  #init(win) {
    this.#window = win;
    this.#tabStates = new WeakMap();

    const tabContainer = this.#window.gBrowser.tabContainer;
    tabContainer.addEventListener("TabOpen", this);
    tabContainer.addEventListener("TabSelect", this);
    tabContainer.addEventListener("TabClose", this);

    this.#tabsListener = this.#getTabsListener();
    this.#window.gBrowser.addTabsProgressListener(this.#tabsListener);

    this.#setUpInitialTabs();
    this.#addWindowEventListeners();
  }

  /**
   * Removes all event listeners and cleans up state.
   */
  uninit() {
    const tabContainer = this.#window.gBrowser.tabContainer;
    tabContainer.removeEventListener("TabOpen", this);
    tabContainer.removeEventListener("TabSelect", this);
    tabContainer.removeEventListener("TabClose", this);

    this.#window.gBrowser.removeTabsProgressListener(this.#tabsListener);
    this.#removeWindowEventListeners();
    this.#tabsListener = null;
    this.#tabStates = null;
    this.#selectedTab = null;
    this.#window = null;
  }

  /**
   * Add event listeners to the window for ai-window:* events
   */
  #addWindowEventListeners() {
    this.#window.addEventListener(
      "ai-window:smartbar-input",
      this.#onSmartbarInput
    );

    this.#window.addEventListener(
      "ai-window:connected",
      this.#onAIWindowConnected
    );

    this.#window.addEventListener(
      "ai-window:opened-conversation",
      this.#onConversationOpened
    );

    this.#window.addEventListener(
      "ai-window:clear-conversation",
      this.#onConversationCleared
    );

    this.#window.addEventListener(
      "ai-window:sidebar-toggle",
      this.#onSidebarToggle
    );

    this.#window.addEventListener(
      "ai-window:sidebar-navigating",
      this.#onSidebarNavigating
    );
  }

  /**
   * Remove event listeners from the window for ai-window:* events
   */
  #removeWindowEventListeners() {
    this.#window.removeEventListener(
      "ai-window:smartbar-input",
      this.#onSmartbarInput
    );

    this.#window.removeEventListener(
      "ai-window:connected",
      this.#onAIWindowConnected
    );

    this.#window.removeEventListener(
      "ai-window:opened-conversation",
      this.#onConversationOpened
    );

    this.#window.removeEventListener(
      "ai-window:clear-conversation",
      this.#onConversationCleared
    );

    this.#window.removeEventListener(
      "ai-window:sidebar-toggle",
      this.#onSidebarToggle
    );

    this.#window.removeEventListener(
      "ai-window:sidebar-navigating",
      this.#onSidebarNavigating
    );
  }

  /**
   * Adds event listeners for any tabs that are present when the window opens.
   * The TabOpen event does not fire for the initial tab of a new window, for example.
   *
   * @private
   */
  #setUpInitialTabs() {
    this.#window.gBrowser.tabs.forEach(tab => {
      if (this.#tabStates.has(tab)) {
        return;
      }

      this.#addTabState(tab);
    });
  }

  /**
   * Handles tab events
   *
   * @param {Event} event
   *
   * @private
   */
  handleEvent(event) {
    switch (event.type) {
      case "TabOpen":
        this.#onTabOpen(event);
        break;

      case "TabSelect":
        this.#onTabSelect(event);
        break;

      case "TabClose":
        this.#onTabClose(event);
        break;
    }
  }

  /**
   * Handles TabOpen events from a new browser tab to add
   * event listeners to it.
   *
   * @param {Event} event
   *
   * @private
   */
  #onTabOpen(event) {
    this.#addTabState(event.target);
  }

  /**
   * Handles TabSelect events from a new browser tab to
   * update the state of the sidebar.
   *
   * Sidebar behavior logic:
   * - shouldOpenSidebar defaults to true when no explicit state is set
   * - keepSidebarOpen can be explicitly set to false to close sidebar
   * - When shouldOpenSidebar is true, openSidebar is called with the tab's conversation
   * - If conversation is null/undefined, openSidebar will kick off creating a new conversation
   * - AI Window tabs (AIWINDOW_URL) always close the sidebar regardless of state
   *
   * @param {Event} event
   *
   * @private
   */
  async #onTabSelect(event) {
    if (!this.#window) {
      return;
    }

    this.#selectedTab = event.target;

    const tabState = this.#getTabState(this.#selectedTab);
    const tabUrl = this.#selectedTab.linkedBrowser.currentURI.spec;
    const isAIWindowTab = tabUrl === lazy.AIWINDOW_URL;
    const keepSidebarOpen = tabState?.state?.keepSidebarOpen;
    const shouldOpenSidebar = keepSidebarOpen !== false;
    const conversation = tabState?.state?.conversation;

    // AI Window tab doesn't need sidebar
    if (isAIWindowTab) {
      lazy.AIWindowUI.closeSidebar(this.#window);
      return;
    }

    // Regular tab - open sidebar if we should keep it open
    if (shouldOpenSidebar) {
      lazy.AIWindowUI.openSidebar(this.#window, conversation);
      lazy.AIWindowUI.updateSidebarInput(
        this.#window,
        tabState.state.input ?? ""
      );
    } else {
      lazy.AIWindowUI.closeSidebar(this.#window);
    }
  }

  /**
   * Handles TabClose events from a new browser tab to
   * clean up after the tab is gone.
   *
   * @param {Event} event
   *
   * @private
   */
  #onTabClose(event) {
    this.#removeEventListeners(event.target);
  }

  /**
   * Adds a tab to the state map.
   *
   * @param {MozTabbrowserTab} tab
   *
   * @private
   */
  #addTabState(tab) {
    this.#tabStates.set(tab, { state: {} });
  }

  /**
   * Removes necessary event listeners from a tab.
   *
   * @param {MozTabbrowserTab} tab
   *
   * @private
   */
  #removeEventListeners(tab) {
    this.#tabStates.delete(tab);
  }

  /**
   * Listens for ai-window:connected events from ai-window.mjs instances
   *
   * @param {AIWindowStateEvent} event
   *
   * @private
   */
  #onAIWindowConnected = async event => {
    if (!this.#window) {
      return;
    }

    const { mode, pageUrl, conversationId, tab } = event.detail;
    const tabState = this.#getTabState(tab, { mode, pageUrl, conversationId });
    const { input } = tabState.state;

    const conversation = await lazy.ChatStore.findConversationById(
      conversationId || event.detail.conversationId
    );
    const isAIWindow = pageUrl === lazy.AIWINDOW_URL;

    const needsSidebar =
      this.#selectedTab === event.detail.tab &&
      mode === "fullpage" &&
      !isAIWindow &&
      input &&
      conversation &&
      conversation.messages.length;

    // NOTE: Don't need to fire open/close sidebar from here, the location change
    // event handler is taking care of that logic.
    if (needsSidebar) {
      lazy.AIWindowUI.updateSidebarInput(
        this.#window,
        tabState.state.input ?? ""
      );
    }

    // Update the sidebar input when the sidebar ai-window connects
    if (mode === "sidebar" && this.#selectedTab === tab) {
      lazy.AIWindowUI.updateSidebarInput(
        this.#window,
        tabState.state.input ?? ""
      );
    }
  };

  /**
   * Gets the state for the specified tab. Will update the state
   * if a newState is passed in.
   *
   * @param {*} tab The browser tab to get state for
   * @param {*} [newState=null] New state to update the tab with
   *
   * @returns {TabState}
   *
   * @private
   */
  #getTabState(tab, newState = null) {
    if (!this.#tabStates) {
      return {};
    }

    const tabState = this.#tabStates.get(tab) ?? {};

    if (newState) {
      // Remove tab reference so a strong reference to the
      // tab is not stored in the value of the WeakMap
      delete newState.tab;

      const oldState = tabState.state ?? { input: "" };
      // Set input to "" if oldState.mode is fullpage so the input
      // is empty when the fullpage mode swaps to sidebar mode. We
      // don't need to track the input state for fullpage mode so
      // it stays empty until it's in sidebar mode.
      const oldInput = oldState.mode === "fullpage" ? "" : oldState.input;

      // Overlay the newState to override the oldState values
      tabState.state = {
        ...oldState,
        input: oldInput,
        ...newState,
      };

      this.#tabStates.set(tab, tabState);
    }

    return tabState;
  }

  /**
   * Handles input events from the Smartbar, updates the state
   * with the latest input
   *
   * @param {TabStateEvent} event
   */
  #onSmartbarInput = event => {
    this.#getTabState(event.detail.tab, event.detail);
  };

  /**
   * Handles ai-window:opened-conversation events from the ai-window.mjs,
   * updates the state with conversation info
   *
   * @param {TabStateEvent} event
   */
  #onConversationOpened = event => {
    const { mode, conversationId, tab, conversation } = event.detail;

    this.#getTabState(tab, {
      mode,
      conversation,
      conversationId,
      keepSidebarOpen: true,
    });
  };

  /**
   * Handles ai-window:clear-conversation events from the ai-window.mjs,
   * clears the conversation ID from the tab state but preserves other state
   *
   * @param {TabStateEvent} event
   */
  #onConversationCleared = event => {
    const { tab } = event.detail;
    const currentTabState = this.#getTabState(tab);

    // Preserve existing state but clear only the conversationId.
    // keepSidebarOpen is preserved as-is; it is only modified by explicit
    // user actions (sidebar toggle) or conversation open, not by clear.
    if (currentTabState?.state) {
      this.#getTabState(tab, {
        ...currentTabState.state,
        conversationId: null,
      });
    }
  };

  /**
   * Handles ai-window:sidebar-toggle events from the AIWindowUI.sys.mjs,
   * updates sidebar state flags based on toggle action
   *
   * @param {TabStateEvent} event
   */
  #onSidebarToggle = event => {
    const { tab, isOpen } = event.detail;
    const currentTabState = this.#getTabState(tab);

    if (currentTabState?.state) {
      this.#getTabState(tab, {
        ...currentTabState.state,
        keepSidebarOpen: isOpen,
      });
    }
  };

  /**
   * Handles ai-window:sidebar-navigating events dispatched when the
   * sidebar's smartbar commits a navigate or search action.
   * Clears the stored input for the current tab.
   *
   * @param {Event} event
   */
  #onSidebarNavigating = event => {
    const tab = event.detail.tab;
    if (!tab) {
      return;
    }

    this.#getTabState(tab, { input: "" });
  };

  /**
   * Gets a global progress listener for all tabs. The callbacks from
   * addTabsProgressListener prepend a browser argument.
   */
  #getTabsListener() {
    return {
      QueryInterface: ChromeUtils.generateQI([
        "nsIWebProgressListener",
        "nsISupportsWeakReference",
      ]),

      onLocationChange: async (
        _browser,
        webProgress,
        _request,
        locationURI,
        _flags
      ) => {
        if (!webProgress.isTopLevel || !this.#tabStates) {
          return;
        }

        const browser = webProgress.browsingContext?.embedderElement;
        const tab = this.#window.gBrowser.getTabForBrowser(browser);
        let tabState = this.#tabStates.get(tab);

        lazy.AIWindowUI.updateStarterPrompts(this.#window);

        if (!tabState || !tabState?.state?.conversationId) {
          return;
        }

        const isAiWindowUrl = locationURI.spec === lazy.AIWINDOW_URL;
        const isSidebarOpen = lazy.AIWindowUI.isSidebarOpen(this.#window);
        const isFullPageMode = tabState.state.mode === "fullpage";
        const shouldKeepSidebarOpen = tabState.state.keepSidebarOpen ?? true;

        if (isFullPageMode && isAiWindowUrl && isSidebarOpen) {
          lazy.AIWindowUI.closeSidebar(this.#window);
        } else if (
          isFullPageMode &&
          !isAiWindowUrl &&
          !isSidebarOpen &&
          shouldKeepSidebarOpen
        ) {
          lazy.AIWindowUI.openSidebar(
            this.#window,
            tabState.state.conversation
          );
          tabState = this.#getTabState(tab, { input: "" });
        }

        if (!isAiWindowUrl && lazy.AIWindowUI.isSidebarOpen(this.#window)) {
          lazy.AIWindowUI.updateSidebarInput(
            this.#window,
            tabState.state.input ?? ""
          );
        }
      },

      onStateChange() {},
      onProgressChange() {},
      onStatusChange() {},
      onSecurityChange() {},
      onContentBlockingEvent() {},
    };
  }
}
