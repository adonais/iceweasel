/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/smartwindow-prompts.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Chat: "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs",
  MODEL_FEATURES: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  openAIEngine: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  generateChatTitle:
    "moz-src:///browser/components/aiwindow/models/TitleGeneration.sys.mjs",
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  ChatConversation:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs",
  MEMORIES_FLAG_SOURCE:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs",
  MESSAGE_ROLE:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs",
  AssistantRoleOpts:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs",
  UserRoleOpts:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs",
  getRoleLabel:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatUtils.sys.mjs",
  NewTabStarterGenerator:
    "moz-src:///browser/components/aiwindow/models/ConversationSuggestions.sys.mjs",
  generateConversationStartersSidebar:
    "moz-src:///browser/components/aiwindow/models/ConversationSuggestions.sys.mjs",
  MemoriesManager:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", function () {
  return console.createInstance({
    prefix: "ChatStore",
    maxLogLevelPref: "browser.smartwindow.chatStore.loglevel",
  });
});

/**
 * @typedef {{
 *   input: string,
 *   mode: string,
 *   pageUrl: URL,
 *   conversationId: string,
 *   tab: MozTabbrowserTab
 * }} TabStateEventDetail
 */

/**
 * @typedef {{
 *   bubbles: true,
 *   detail: TabStateEventDetail
 * }} TabStateEventOptions
 */

/**
 * @typedef {CustomEvent & {
 *   detail: TabStateEventDetail
 * }} TabStateEvent
 */

const MODE = {
  FULLPAGE: "fullpage",
  SIDEBAR: "sidebar",
  URLBAR: "urlbar",
};

const ACTION = {
  CHAT: "chat",
  SEARCH: "search",
  NAVIGATE: "navigate",
};

const PREF_MEMORIES_CONVERSATION =
  "browser.smartwindow.memories.generateFromConversation";
const PREF_MEMORIES_HISTORY =
  "browser.smartwindow.memories.generateFromHistory";
const TAB_FAVICON_CHAT =
  "chrome://browser/content/aiwindow/assets/ask-icon.svg";
const PREF_CHAT_INTERACTION_COUNT = "browser.smartwindow.chat.interactionCount";
const MAX_INTERACTION_COUNT = 1000;

/**
 * A custom element for managing AI Window
 *
 * @todo Bug2007583
 * Tests follow up for re-opening conversations
 */
export class AIWindow extends MozLitElement {
  static properties = {
    mode: { type: String, reflect: true }, // sidebar | fullpage
    showStarters: { type: Boolean, state: true },
    showFooter: { type: Boolean, state: true },
    showDisclaimer: { type: Boolean, state: true },
  };

  #browser;
  #smartbar;
  #smartbarToggleButton;
  #conversation = null;
  #memoriesButton = null;
  #memoriesToggled = null;

  get #memoriesIconShown() {
    return this.memoriesConversationPref || this.memoriesHistoryPref;
  }
  #visibilityChangeHandler;
  #starters = [];
  #smartbarResizeObserver = null;
  #windowModeObserver = null;
  #addedContextWebsites = []; // TODO: replace once Bug 2016760 lands

  /**
   * Flags whether the #conversation reference has been updated but the messages
   * have not been delivered via the actor.
   *
   * @type {bool}
   */
  #pendingMessageDelivery;

  /**
   * Gets the host browser element that embeds this AI window.
   *
   * @returns {Element|null} The host browser element, or null if not found
   * @private
   */
  get #hostBrowser() {
    return window.browsingContext?.embedderElement || null;
  }

  #detectModeFromContext() {
    return this.#hostBrowser?.id === "ai-window-browser"
      ? MODE.SIDEBAR
      : MODE.FULLPAGE;
  }

  /**
   * Stamps the current conversation ID into the fullpage history entry via
   * replaceState, enabling conversation recovery after back navigation and
   * serving as a fallback for session restore / undo-close when the
   * data-conversation-id attribute on the host <browser> is unavailable.
   *
   */
  #syncHistoryState() {
    if (!this.isConnected || this.mode !== MODE.FULLPAGE) {
      return;
    }
    window.history.replaceState(
      {
        ...window.history.state,
        conversationId: this.#conversation?.id ?? null,
      },
      ""
    );
  }

  /**
   * Checks if there's a pending conversation ID to load.
   *
   * @returns {string|null} The conversation ID or null if none exists
   * @private
   */
  #getPendingConversationId() {
    const findId =
      this.#hostBrowser?.getAttribute("data-conversation-id") ??
      window.history.state?.conversationId ??
      null;

    return findId;
  }

  /**
   * Gets the browser container element from the shadow DOM.
   *
   * @returns {Element|null} The browser container element, or null if not found
   * @private
   */
  #getBrowserContainer() {
    return this.renderRoot.querySelector("#browser-container");
  }

  #syncSmartbarMemoriesStateFromConversation() {
    if (!this.#smartbar) {
      return;
    }

    const lastUserMessage =
      this.#conversation?.messages?.findLast?.(m => m.role === "user") ?? null;
    if (
      lastUserMessage?.memoriesFlagSource ===
      lazy.MEMORIES_FLAG_SOURCE.CONVERSATION
    ) {
      this.#memoriesToggled = lastUserMessage.memoriesEnabled;
    }
    this.#syncMemoriesButtonUI();
  }

  #syncMemoriesButtonUI() {
    if (!this.#memoriesButton) {
      return;
    }

    this.#memoriesButton.show = this.#memoriesIconShown;
    this.#memoriesButton.pressed =
      this.#memoriesIconShown &&
      (this.#memoriesToggled ?? this.#memoriesIconShown);
  }

  /**
   * Records a user chat interaction by incrementing the interaction
   * counter when users submit messages or click starter prompts.
   *
   * @private
   */
  #recordChatInteraction() {
    let interactionCount = Services.prefs.getIntPref(
      PREF_CHAT_INTERACTION_COUNT,
      0
    );

    if (interactionCount < MAX_INTERACTION_COUNT) {
      Services.prefs.setIntPref(
        PREF_CHAT_INTERACTION_COUNT,
        interactionCount + 1
      );
    }
  }

  constructor() {
    super();

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "memoriesConversationPref",
      PREF_MEMORIES_CONVERSATION,
      true,
      () => this.#syncMemoriesButtonUI()
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "memoriesHistoryPref",
      PREF_MEMORIES_HISTORY,
      true,
      () => this.#syncMemoriesButtonUI()
    );

    this.userPrompt = "";
    this.#browser = null;
    this.#smartbar = null;
    this.#swapConversation(new lazy.ChatConversation({}));

    this.mode = this.#detectModeFromContext();
    this.showStarters = false;
    this.showFooter = this.mode === MODE.FULLPAGE;
    this.showDisclaimer = this.mode !== MODE.FULLPAGE;

    // Apply chat-active immediately if restoring a conversation
    if (this.#hostBrowser?.getAttribute("data-conversation-id")) {
      this.classList.add("chat-active");
    }
  }

  #attachConversationListeners() {
    if (!this.#conversation) {
      return;
    }

    this.#conversation.on(
      "chat-conversation:message-update",
      this.#onMessageUpdate
    );
  }

  #removeConversationListeners() {
    if (!this.#conversation) {
      return;
    }

    this.#conversation.off(
      "chat-conversation:message-update",
      this.#onMessageUpdate
    );
  }

  #onMessageUpdate = (event, message) => {
    this.#dispatchMessageToChatContent(message);
  };

  /**
   * Gets the conversation id from data-conversation-id attribute
   *
   * @private
   */
  #getDataConvId() {
    if (this.#conversation) {
      return this.#conversation.id;
    }

    return this.#hostBrowser?.getAttribute("data-conversation-id");
  }

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("mode", this.mode);

    this.ownerDocument.addEventListener("OpenConversation", this);
    this.ownerDocument.addEventListener(
      "smartbar-commit",
      this.#handleSmartbarCommit,
      true
    );

    this.#loadPendingConversation();
    this.#setupWindowModeObserver();

    this.#dispatchChromeEvent(
      "ai-window:connected",
      this.#getAIWindowEventOptions()
    );

    // Ensure disconnectedCallback gets called to clean up listeners
    this.ownerGlobal.addEventListener("unload", () => this.remove(), {
      once: true,
    });
  }

  get conversationId() {
    return this.#conversation?.id;
  }

  handleEvent(event) {
    if (event.detail) {
      this.openConversation(event.detail);
    } else {
      // Handle a null conversation reference by starting a new empty conversation
      this.onCreateNewChatClick();
    }
  }

  #setupWindowModeObserver() {
    this.#windowModeObserver = (subject, topic) => {
      if (topic === "ai-window-state-changed") {
        if (subject == window.browsingContext?.topChromeWindow) {
          this.#updateSmartbarVisibility();
        }
      }
    };

    Services.obs.addObserver(
      this.#windowModeObserver,
      "ai-window-state-changed"
    );
  }

  #updateSmartbarVisibility() {
    if (!this.#smartbar || !this.#smartbarToggleButton) {
      return;
    }

    const isSmartWindow = lazy.AIWindow.isAIWindowActive(
      window.browsingContext.topChromeWindow
    );

    this.#smartbar.hidden = !isSmartWindow;
    this.#smartbarToggleButton.hidden = isSmartWindow;
  }

  disconnectedCallback() {
    // Clean up visibility change handler
    if (this.#visibilityChangeHandler) {
      this.ownerDocument.removeEventListener(
        "visibilitychange",
        this.#visibilityChangeHandler
      );
      this.#visibilityChangeHandler = null;
    }

    // Clean up window mode observer
    if (this.#windowModeObserver) {
      Services.obs.removeObserver(
        this.#windowModeObserver,
        "ai-window-state-changed"
      );
      this.#windowModeObserver = null;
    }

    // Clean up smartbar toggle button
    if (this.#smartbarToggleButton) {
      this.#smartbarToggleButton.remove();
      this.#smartbarToggleButton = null;
    }

    // Clean up smartbar
    this.ownerDocument.removeEventListener(
      "smartbar-commit",
      this.#handleSmartbarCommit,
      true
    );
    if (this.#smartbar) {
      this.#smartbar.removeEventListener(
        "aiwindow-memories-toggle:on-change",
        this.#handleMemoriesToggle
      );
      this.#smartbar.remove();
      this.#smartbar = null;
      this.#memoriesButton = null;
    }

    // Clean up resize observer
    if (this.#smartbarResizeObserver) {
      this.#smartbarResizeObserver.disconnect();
      this.#smartbarResizeObserver = null;
    }

    // Clean up browser
    if (this.#browser) {
      this.#browser.remove();
      this.#browser = null;
    }

    // Clean up conversation
    this.#removeConversationListeners();
    this.#conversation = null;

    this.ownerDocument.removeEventListener("OpenConversation", this);

    super.disconnectedCallback();
  }

  /**
   * Loads a conversation if one is set on the data-conversation-id attribute
   * on firstUpdated()
   */
  async #loadPendingConversation() {
    const conversationId = this.#getPendingConversationId();
    if (!conversationId) {
      // No externally-provided ID — stamp the fresh constructor conversation
      // onto the host browser so navigating away and back can recover it,
      // and record it in history.state for session/undo-close restore.
      this.#hostBrowser?.setAttribute(
        "data-conversation-id",
        this.#conversation.id
      );
      this.#syncHistoryState();
      return;
    }

    const conversation =
      await lazy.AIWindow.chatStore.findConversationById(conversationId);

    conversation
      ? this.openConversation(conversation)
      : this.#resetConversationState();

    if (this.#hostBrowser?.hasAttribute("data-continue-streaming")) {
      this.#hostBrowser.removeAttribute("data-continue-streaming");
      this.#continueAfterToolResult();
    }
  }

  async firstUpdated() {
    // Create a real XUL <browser> element from the chrome document
    const doc = this.ownerDocument; // browser.xhtml
    const browser = doc.createXULElement("browser");

    browser.setAttribute("id", "aichat-browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("maychangeremoteness", "true");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("transparent", "true");
    browser.setAttribute("src", "about:aichatcontent");

    const container = this.#getBrowserContainer();
    container.appendChild(browser);

    this.#browser = browser;

    await this.#loadPendingConversation().catch(error => {
      console.error(
        `loadPendingConversation() error: ${error.toString()}, \nstack: ${error.stack}`
      );
    });

    // Defer Smartbar and conversation starters for preloaded documents
    if (doc.hidden) {
      this.#visibilityChangeHandler = () => {
        if (!doc.hidden && !this.#smartbar) {
          this.#getOrCreateSmartbar(doc, container);
          this.loadStarterPrompts();
        }
      };
      doc.addEventListener("visibilitychange", this.#visibilityChangeHandler, {
        once: true,
      });
    } else {
      this.#getOrCreateSmartbar(doc, container);
      this.loadStarterPrompts();
    }
  }

  /**
   * Update the smartbar input
   *
   * @param {string} value The value to update the input with
   */
  updateInput(value) {
    if (!this.#smartbar) {
      return;
    }

    this.#smartbar.value = value;
  }

  /**
   * Loads conversation starter prompts from the generator and renders them.
   * In sidebar mode, uses LLM-generated prompts based on tab context and memories.
   * In fullpage mode, uses static prompts based on tab count.
   *
   * @param {boolean} [clear=false] Clear current starter prompts?
   */
  async loadStarterPrompts(clear = false) {
    if (clear) {
      this.#renderStarterPrompts([]);
    }

    if (!this.isConnected) {
      return;
    }

    if (this.#conversation?.messages?.length) {
      return;
    }

    let starters = [];
    try {
      const gBrowser = window.browsingContext?.topChromeWindow.gBrowser;
      const tabCount = gBrowser?.tabs.length || 0;
      starters = await lazy.NewTabStarterGenerator.getPrompts(tabCount).catch(
        e => {
          lazy.log.error("[Prompts] Failed to load initial starters:", e);
          return [];
        }
      );

      if (this.mode === MODE.SIDEBAR && gBrowser) {
        // Get tab context for LLM-generated prompts
        // @todo bug 2015919 to use same context as visualized in smartbar
        const contextTabs = [gBrowser.selectedTab].map(tab => ({
          title: tab.label,
          url: tab.linkedBrowser.currentURI.spec,
        }));

        // Get memories setting from user preferences
        const memoriesEnabled =
          this.#memoriesToggled ?? this.#memoriesIconShown;

        const sidebarStarters = await lazy
          .generateConversationStartersSidebar(contextTabs, 2, memoriesEnabled)
          .catch(e => {
            lazy.log.error("[Prompts] Failed to generate sidebar starters:", e);
            return null;
          });

        if (sidebarStarters?.length) {
          starters = sidebarStarters;
        }
      }
    } catch (e) {
      lazy.log.error("[Prompts] Failed to load initial starters:", e);
    }

    this.#renderStarterPrompts(starters);
  }

  /**
   * Renders conversation starter prompts in the UI.
   * Sets the starters data and shows the prompts element.
   *
   * @param {Array<{text: string, type: string}>} starters - Array of starter prompt objects
   * @private
   */
  #renderStarterPrompts(starters) {
    if (!this.isConnected) {
      return;
    }

    this.#starters = this.#conversation?.messages?.length ? [] : starters;
    this.showStarters = !!starters.length;

    if (this.showStarters) {
      this.onQuickPromptDisplayed(this.#starters.length);
    }
    this.requestUpdate();
  }

  /**
   * Helper method to get or create the smartbar element
   *
   * @param {Document} doc - The document
   * @param {Element} container - The container element
   */
  #getOrCreateSmartbar(doc, container) {
    // Find existing Smartbar or create it when we init the AI Window.
    let smartbar = container.querySelector("#ai-window-smartbar");

    if (!smartbar) {
      // The Smartbar can't be initialized in the shadow DOM and needs
      // to be created from the chrome document.
      smartbar = doc.createElement("moz-smartbar");
      smartbar.id = "ai-window-smartbar";
      smartbar.setAttribute("sap-name", "smartbar");
      smartbar.setAttribute("pageproxystate", "invalid");
      smartbar.setAttribute("popover", "manual");
      smartbar.classList.add("smartbar", "urlbar");

      // Listen before appending to DOM since the event fires synchronously
      // during connectedCallback.
      smartbar.addEventListener(
        "smartbar-initialized",
        () => this.#setupSmartbarFocus(smartbar),
        { once: true }
      );

      const smartbarWrapper = doc.createElement("div");
      smartbarWrapper.id = "smartbar-wrapper";
      smartbarWrapper.appendChild(smartbar);
      container.append(smartbarWrapper);

      // Always show the list of suggestions above input in sidebar mode and
      // below when in fullpage mode.
      smartbar.setAttribute(
        "suggestions-position",
        this.mode === MODE.SIDEBAR ? "top" : "bottom"
      );
      smartbar.setAndUpdateContextWebsites(this.#addedContextWebsites);
      smartbar.isSidebarMode = this.mode == MODE.SIDEBAR;

      smartbar.addEventListener("input", this.#handleSmartbarInput);
      smartbar.addEventListener(
        "aiwindow-memories-toggle:on-change",
        this.#handleMemoriesToggle
      );
    }
    this.#smartbar = smartbar;
    this.#memoriesButton = smartbar.querySelector("memories-icon-button");
    this.#syncSmartbarMemoriesStateFromConversation();
    this.#observeSmartbarHeight();

    // Create toggle button, like with Smartbar above
    let toggleButton = container.querySelector("#smartbar-toggle-button");

    if (!toggleButton) {
      toggleButton = doc.createElement("moz-button");
      toggleButton.id = "smartbar-toggle-button";
      toggleButton.type = "primary";
      toggleButton.iconSrc =
        "chrome://browser/skin/smart-window-simplified.svg";
      toggleButton.setAttribute(
        "data-l10n-id",
        "smartwindow-switch-to-smart-window"
      );
      toggleButton.addEventListener("click", () => {
        const chromeWindow = window.browsingContext?.topChromeWindow;
        if (chromeWindow) {
          lazy.AIWindow.toggleAIWindow(chromeWindow, true);
        }
      });
      container.appendChild(toggleButton);
    }
    this.#smartbarToggleButton = toggleButton;
    this.#updateSmartbarVisibility();
  }

  #setupSmartbarFocus(smartbar) {
    let hasAutoFocused = false;
    let isMouseClick = false;

    smartbar.addEventListener("mousedown", () => {
      isMouseClick = true;
      smartbar.toggleAttribute("suppress-focus-border", true);
    });

    smartbar.inputField.addEventListener("focus", () => {
      if (!hasAutoFocused) {
        smartbar.toggleAttribute("suppress-focus-border", true);
        hasAutoFocused = true;
      } else if (!isMouseClick) {
        smartbar.removeAttribute("suppress-focus-border");
      }
      isMouseClick = false;
    });

    smartbar.focus();
  }

  #observeSmartbarHeight() {
    const updateSmartbarHeight = () => {
      const urlbarView = this.#smartbar.querySelector(".urlbarView");
      // The height calculation for the Smartbar assumes that `.urlbarView`
      // is the only dynamically-sized child element.
      const smartbarHeightClosed =
        this.#smartbar.offsetHeight - urlbarView.offsetHeight;

      this.style.setProperty("--smartbar-height", `${smartbarHeightClosed}px`);
    };
    updateSmartbarHeight();

    this.#smartbarResizeObserver = new ResizeObserver(updateSmartbarHeight);
    this.#smartbarResizeObserver.observe(this.#smartbar);
  }

  /**
   * Handles input event from the Smartbar and dispatches
   * a ai-window:smartbar-input event to the window for
   * AIWindowTabStatesManager.sys.mjs to manage the input
   * state of the sidebar chat window.
   *
   * @param {Event} event
   *
   * @private
   */
  #handleSmartbarInput = event => {
    this.#dispatchChromeEvent(
      "ai-window:smartbar-input",
      this.#getAIWindowEventOptions(event.target.value)
    );
  };

  /**
   * Dispatches a TabStateEvent on the chrome window for the
   * AIWindowTabStatesManager.sys.mjs to catch state updates
   * for the ai-window.
   *
   * @param {string} eventName Name of the event
   * @param {TabStateEventOptions} [options={}] Event options/detail
   *
   * @private
   */
  #dispatchChromeEvent(eventName, options = {}) {
    const topChromeWindow = window?.browsingContext?.topChromeWindow;
    topChromeWindow?.dispatchEvent(
      new topChromeWindow.CustomEvent(eventName, options)
    );
  }

  /**
   * Handles the smartbar-commit action for the user prompt
   *
   * @param {CustomEvent} event - The smartbar-commit event
   * @private
   */
  #handleSmartbarCommit = event => {
    Glean.smartWindow.chatSubmit.record({
      chat_id: this.conversationId,
    });

    lazy.log.debug(
      "chatId[%s]: %s",
      this.#handleSmartbarCommit.name,
      this.conversationId
    );

    const { value, action, contextMentions, contextPageUrl } = event.detail;
    if (action === ACTION.CHAT) {
      // Seed @mentioned URLs into security ledger at submission time.
      // URLs come from two sources:
      // 1. contextMentions: "+" button mentions + implicit current tab (sidebar)
      // 2. Inline "@" mentions from the editor's mentions plugin
      const mentionUrls = new Set();

      if (contextMentions?.length) {
        for (const mention of contextMentions) {
          if (mention.url) {
            mentionUrls.add(mention.url);
          }
        }
      }

      const inlineMentions = this.#getInlineMentions();
      for (const mention of inlineMentions) {
        if (mention.id) {
          mentionUrls.add(mention.id);
        }
      }

      if (mentionUrls.size) {
        const actor = this.#getAIChatContentActor();
        if (actor && this.#conversation?.id) {
          for (const url of mentionUrls) {
            actor.seedMentionedUrl(this.#conversation.id, url);
          }
        }
      }
      this.submitChatMessage(value, contextMentions, contextPageUrl);
    } else if (
      this.mode === MODE.SIDEBAR &&
      (action === ACTION.NAVIGATE || action === ACTION.SEARCH)
    ) {
      this.#dispatchChromeEvent(
        "ai-window:sidebar-navigating",
        this.#getAIWindowEventOptions()
      );
    }
  };

  /**
   * Returns inline @mention data from the editor's mentions plugin.
   *
   * Inline "@" mentions are not included in the smartbar-commit
   * contextMentions, so we read them directly from the editor.
   *
   * @returns {Array<object>} Mention nodes from the editor
   */
  #getInlineMentions() {
    const editor = this.#smartbar?.inputField;
    if (!editor?.plugins) {
      return [];
    }

    const mentionsPlugin = editor.plugins.find(p => p.mentions);
    if (!mentionsPlugin) {
      return [];
    }

    return mentionsPlugin.mentions.getAll();
  }

  /**
   * @param {string} text
   * @param {ContextWebsite[]} [contextMentions]
   * @param {string|null} [contextPageUrl] - Page URL string from the smartbar
   * commit event. null means the user removed page context; undefined means
   * fall back to the current tab URL.
   */
  submitChatMessage(text, contextMentions, contextPageUrl) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      return;
    }

    let pageUrl;
    if (contextPageUrl === undefined) {
      pageUrl = this.#getCurrentPageUrl();
    } else {
      pageUrl = contextPageUrl ? URL.parse(contextPageUrl) : null;
    }

    this.#recordChatInteraction();
    this.#fetchAIResponse(trimmed, {
      ...this.#createUserRoleOpts(contextMentions),
      pageUrl,
    });
    this.#dispatchChromeEvent(
      "ai-window:smartbar-input",
      this.#getAIWindowEventOptions("")
    );
  }

  #handleMemoriesToggle = event => {
    Glean.smartWindow.memoriesToggle.record({
      chat_id: this.conversationId,
      toggle: event.detail.pressed,
    });

    lazy.log.debug(
      "chatId[%s]: %s",
      this.#handleMemoriesToggle.name,
      this.conversationId
    );

    this.#memoriesToggled = event.detail.pressed;
    this.#syncMemoriesButtonUI();
  };

  /**
   * Handles the prompt selection event from smartwindow-prompts.
   *
   * @param {CustomEvent} event - The prompt-selected event
   * @private
   */
  #handlePromptSelected = event => {
    this.onQuickPromptClicked(event.detail.text, true);
  };

  /**
   * Records a quick_prompt_displayed Glean event.
   * Called for both conversation starters and follow-up suggestions.
   *
   * @param {number} prompts - Number of prompts shown
   */
  onQuickPromptDisplayed = prompts => {
    Glean.smartWindow.quickPromptDisplayed.record({
      location: this.mode,
      chat_id: this.conversationId,
      message_seq: this.#conversation.messages.length,
      prompts,
    });
  };

  /**
   * Records a quick_prompt_clicked Glean event and submits the prompt.
   * Called for both conversation starters and follow-up suggestions.
   *
   * @param {string} text - The prompt text to submit
   * @param {boolean} starter - Whether this is a conversation starter
   */
  onQuickPromptClicked(text, starter) {
    Glean.smartWindow.quickPromptClicked.record({
      location: this.mode,
      chat_id: this.conversationId,
      message_seq: this.#conversation.messages.length,
      starter,
    });
    this.submitChatMessage(text);
  }

  /**
   * Creates a UserRoleOpts object with current memories settings.
   *
   * @param {ContextWebsite[]} [contextMentions]
   * @returns {UserRoleOpts} Options object with memories configuration
   * @private
   */
  #createUserRoleOpts(contextMentions) {
    return new lazy.UserRoleOpts({
      memoriesEnabled: this.#memoriesToggled ?? this.#memoriesIconShown,
      memoriesFlagSource:
        this.#memoriesToggled == null
          ? lazy.MEMORIES_FLAG_SOURCE.GLOBAL
          : lazy.MEMORIES_FLAG_SOURCE.CONVERSATION,
      contextMentions,
    });
  }

  /**
   * Persists the current conversation state to the database.
   *
   * @private
   */
  async #updateConversation() {
    await lazy.AIWindow.chatStore
      .updateConversation(this.#conversation)
      .catch(updateError => {
        lazy.log.error(`Error updating conversation: ${updateError.message}`);
      });
  }

  /**
   * Generates and sets a title for the conversation if one doesn't exist.
   *
   * @private
   */
  async #addConversationTitle() {
    if (this.#conversation.title || this.#conversation.titlePromise) {
      return;
    }

    const firstUserMessage = this.#conversation.messages.find(
      m => m.role === lazy.MESSAGE_ROLE.USER
    );

    this.#conversation.titlePromise = lazy.generateChatTitle(
      firstUserMessage?.content?.body,
      {
        url: firstUserMessage?.pageUrl?.href || "",
        title: this.#conversation.pageMeta?.title || "",
        description: this.#conversation.pageMeta?.description || "",
      }
    );
    const title = await this.#conversation.titlePromise;
    delete this.#conversation.titlePromise;

    this.#conversation.title = title;
    document.title = title;
    this.#updateConversation();
  }

  #updateTabFavicon() {
    if (this.classList.contains("chat-active") || this.mode !== MODE.FULLPAGE) {
      return;
    }
    const link = document.getElementById("tabIcon");
    link.href = TAB_FAVICON_CHAT;
  }

  /**
   * Processes tokens from the AI response stream and updates the message.
   * Adds all tokens to their respective arrays in the tokens object and
   * builds the _pendingMemoryIds array for existing_memory tokens.
   * IDs are resolved to full memory objects after streaming ends.
   *
   * @param {Array<{key: string, value: string}>} tokens - Array of parsed tokens from the stream
   * @param {ChatMessage} currentMessage - The message object being updated
   */
  handleTokens = (tokens, currentMessage) => {
    tokens.forEach(({ key, value }) => {
      currentMessage.tokens[key].push(value);

      if (key === "existing_memory") {
        currentMessage._pendingMemoryIds ??= [];
        currentMessage._pendingMemoryIds.push(value);
      }

      // Build web search queries
      if (key === "search") {
        currentMessage.webSearchQueries ??= [];
        currentMessage.webSearchQueries.push(value);
      }
    });
  };

  #resetConversationState() {
    this.classList.remove("chat-active");
    this.#hostBrowser?.setAttribute(
      "data-conversation-id",
      this.#conversation.id
    );
    this.#syncHistoryState();
  }

  #setBrowserContainerActiveState(isActive) {
    if (isActive) {
      this.classList.add("chat-active");
      this.#smartbar?.suppressStartQuery({ permanent: true });
      this.#smartbar?.view.close();
      return;
    }

    this.classList.remove("chat-active");
    this.#smartbar?.unsuppressStartQuery();
  }

  /**
   * Gets the current url of the loaded page.
   *
   * @returns {URL} The page URL
   *
   * @private
   */
  #getCurrentPageUrl() {
    return URL.fromURI(
      window.browsingContext.topChromeWindow.gBrowser.currentURI
    );
  }

  /**
   * Fetches an AI response based on the current user prompt.
   * Validates the prompt, updates conversation state, streams the response,
   * and dispatches updates to the browser actor.
   *
   * @private
   *
   * @param {string} inputText
   * @param {object} [options]
   * @param {boolean} [options.skipUserDispatch=false] - If true, do not dispatch
   * a user message into chat content (used for retries to avoid duplicate
   * user messages).
   * @param {boolean} [options.memoriesEnabled] - Optional per-call override for
   * memory injection; undefined falls back to use global/default behavior.
   * @param {URL|null} [options.pageUrl] - Page URL to associate with the
   * message, or null if the user removed page context.
   */
  #fetchAIResponse = async (
    inputText = false,
    { skipUserDispatch = false, pageUrl, ...userOpts } = {}
  ) => {
    const formattedPrompt = (inputText || "").trim();
    if (!formattedPrompt && inputText !== false) {
      return;
    }

    this.showStarters = false;
    this.showFooter = false;
    this.showDisclaimer = true;
    this.#updateTabFavicon();
    this.#setBrowserContainerActiveState(true);

    try {
      const engineInstance = await lazy.openAIEngine.build(
        lazy.MODEL_FEATURES.CHAT
      );

      if (formattedPrompt) {
        if (pageUrl === undefined) {
          pageUrl = this.#getCurrentPageUrl();
        }

        await this.#conversation.generatePrompt(
          formattedPrompt,
          pageUrl,
          engineInstance,
          userOpts
        );

        if (!skipUserDispatch) {
          this.#dispatchMessageToChatContent(
            this.#conversation.messages.at(-1)
          );
        }

        // @todo
        // fill out these assistant message flags
        const assistantRoleOpts = new lazy.AssistantRoleOpts();
        this.#conversation.addAssistantMessage("text", "", assistantRoleOpts);
      }

      this.#addConversationTitle();

      await lazy.Chat.fetchWithHistory(this.#conversation, engineInstance, {
        inputText,
        browsingContext: this.#getBrowsingContext(),
      });

      const lastMsg = this.#conversation.messages.at(-1);
      const followupCount = lastMsg?.tokens?.followup?.length;
      if (followupCount) {
        this.onQuickPromptDisplayed(followupCount);
      }
    } catch (e) {
      this.showSearchingIndicator(false, null);
      this.#handleError(e);
      this.requestUpdate?.();
    }
  };

  #getBrowsingContext() {
    // Use the adjacent tab's browsing context for sidebar or current for
    // fullpage for tools that need context.
    return this.mode === MODE.SIDEBAR
      ? window.browsingContext.topChromeWindow.gBrowser.selectedBrowser
          .browsingContext
      : window.browsingContext;
  }

  #handleError(error) {
    const errorMessage = error.error ?? error.metadata?.errorMessage;
    const newErrorMessage = {
      role: "",
      content: {
        isError: true,
        error: errorMessage,
      },
    };
    this.#dispatchMessageToChatContent(newErrorMessage);
  }

  /**
   * Retrieves the AIChatContent actor from the browser's window global.
   *
   * @returns {Promise<object|null>} The AIChatContent actor, or null if unavailable.
   * @private
   */

  #getAIChatContentActor() {
    if (!this.#browser) {
      lazy.log.warn("AI browser not set, cannot get AIChatContent actor");
      return null;
    }

    const windowGlobal = this.#browser.browsingContext?.currentWindowGlobal;

    if (!windowGlobal) {
      lazy.log.warn("No window global found for AI browser");
      return null;
    }
    try {
      return windowGlobal.getActor("AIChatContent");
    } catch (error) {
      lazy.log.error("Failed to get AIChatContent actor:", error);
      return null;
    }
  }

  /**
   * Dispatches a message to the AIChatContent actor.
   *
   * @param {ChatMessage} message - message to dispatch to chat content actor
   * @returns
   */

  #dispatchMessageToActor(actor, message) {
    const newMessage = { ...message };
    if (typeof message.role !== "string") {
      const roleLabel = lazy.getRoleLabel(newMessage.role).toLowerCase();
      newMessage.role = roleLabel;
    }

    return actor.dispatchMessageToChatContent(newMessage);
  }

  #dispatchMessageToChatContent(message) {
    const actor = this.#getAIChatContentActor();
    return actor ? this.#dispatchMessageToActor(actor, message) : null;
  }

  /**
   * Delivers messages to the child process if there are some pending when the
   * parent actor receives AIChatContent:Ready event from the child process.
   */
  onContentReady() {
    const actor = this.#getAIChatContentActor();

    if (actor) {
      this.#deliverConversationMessages(actor);
    }
  }

  /**
   * Delivers all of the messages of a conversation to the child process
   *
   * @param {JSActor} actor
   */
  #deliverConversationMessages(actor) {
    // Notify actor of current conversation for security ledger access.
    if (this.#conversation?.id) {
      actor.setConversation(this.#conversation.id);
    }

    if (!this.#pendingMessageDelivery) {
      return;
    }

    this.#pendingMessageDelivery = false;

    if (!this.#conversation || !this.#conversation.messages.length) {
      return;
    }

    this.#setBrowserContainerActiveState(true);

    // @todo Bug2013096
    // Add way to batch these messages to the actor in one message
    this.#conversation.renderState().forEach(message => {
      this.#dispatchMessageToActor(actor, {
        ...message,
        isPreviousMessage: true,
      });
    });
  }

  /**
   * Gets event options for a TabStateEvent
   *
   * @param {false|string} [input=false] The latest input contents
   *
   * @returns {TabStateEventOptions}
   *
   * @private
   */
  #getAIWindowEventOptions(input = false) {
    const topChromeWindow = window?.browsingContext?.topChromeWindow;

    return {
      bubbles: true,
      detail: {
        input,
        mode: this.mode,
        pageUrl: this.#getCurrentPageUrl(),
        conversationId: this.#getDataConvId(),
        tab: topChromeWindow?.gBrowser?.selectedTab,
        conversation: this.#conversation,
      },
    };
  }

  /**
   * Remove the event listeners from the current conversation, update the
   * conversation reference, and attach chat-conversation event listeners.
   *
   * @param {ChatConversation} conversation
   *
   * @private
   */
  #swapConversation(conversation) {
    this.#removeConversationListeners();
    this.#conversation = conversation;
    this.#attachConversationListeners();
  }

  /**
   * Opens a new conversation and renders the conversation in the child process.
   *
   * @param {ChatConversation} conversation
   */
  openConversation(conversation) {
    if (conversation?.messages?.length) {
      this.#swapConversation(conversation);

      this.#syncHistoryState();

      if (this.#conversation.title) {
        document.title = this.#conversation.title;
      }
      this.#updateTabFavicon();
      this.hostBrowser?.setAttribute(
        "data-conversation-id",
        this.#conversation.id
      );

      // Update smartbar chips to reflect the current tab when sidebar reopens
      if (this.#smartbar && this.mode === MODE.SIDEBAR) {
        this.#smartbar.updateContextChips();
      }

      // This assumes "openConversation" opens an active conversation, possible todo to see
      // if convo has messages before hiding the footer element.
      this.showFooter = false;

      this.showDisclaimer = true;
      this.showStarters = false;
      const actor = this.#getAIChatContentActor();

      this.#pendingMessageDelivery = true;

      if (this.#browser && actor) {
        this.#deliverConversationMessages(actor);
      }
    } else {
      this.onCreateNewChatClick();
    }

    this.#dispatchChromeEvent(
      "ai-window:opened-conversation",
      this.#getAIWindowEventOptions()
    );
  }

  onCreateNewChatClick() {
    // Clear conversation state. The new conversation's ID is persisted to the
    // host browser attribute and history.state so back navigation can restore it.
    this.#swapConversation(new lazy.ChatConversation({}));

    this.#syncHistoryState();

    const hostBrowser = window.browsingContext?.embedderElement;
    hostBrowser?.setAttribute("data-conversation-id", this.#conversation.id);

    // Reset memories toggle state
    this.#memoriesToggled = null;
    this.#syncMemoriesButtonUI();

    // Show Smartbar suggestions for cleared chats
    this.#smartbar?.unsuppressStartQuery();

    // Clear the conversation ID from the tab state manager
    this.#dispatchChromeEvent(
      "ai-window:clear-conversation",
      this.#getAIWindowEventOptions()
    );

    // Submitting a message with a new convoId here.
    // This will clear the chat content area in the child process via side effect.
    this.#dispatchMessageToChatContent({
      role: "clear-conversation",
      content: { body: "" },
    });

    // Hide chat-active state
    this.#setBrowserContainerActiveState(false);

    this.showStarters = false;

    this.loadStarterPrompts();
  }

  showSearchingIndicator(isSearching, searchQuery) {
    this.#dispatchMessageToChatContent({
      role: "loading",
      isSearching,
      searchQuery,
      convId: this.conversationId,
      content: { body: "" },
    });
  }

  async reloadAndContinue(conversation) {
    if (!conversation) {
      return;
    }
    this.openConversation(conversation);
    this.#continueAfterToolResult();
  }

  async #continueAfterToolResult() {
    // Show searching indicator if the last tool was run_search
    const lastToolCall = this.#conversation.messages
      .filter(
        m =>
          m.role === lazy.MESSAGE_ROLE.ASSISTANT &&
          m?.content?.type === "function"
      )
      .at(-1);
    const lastToolName =
      lastToolCall?.content?.body?.tool_calls?.[0]?.function?.name;
    if (lastToolName === "run_search") {
      const args = lastToolCall.content.body.tool_calls[0].function.arguments;
      try {
        const { query } = JSON.parse(args || "{}");
        if (query) {
          this.showSearchingIndicator(true, query);
        }
      } catch {}
    }

    this.#dispatchChromeEvent(
      "ai-window:opened-conversation",
      this.#getAIWindowEventOptions()
    );

    this.#fetchAIResponse();
  }

  handleFooterAction(data) {
    const { action, messageId, memory } = data ?? {};

    switch (action) {
      case "retry":
        this.#retryFromAssistantMessageId(messageId, undefined);
        break;

      case "retry-without-memories":
        this.#retryFromAssistantMessageId(messageId, false);
        break;

      case "retry-after-error":
        this.#retryAfterError();
        break;

      case "remove-applied-memory":
        this.#removeAppliedMemory(messageId, memory);
        break;
    }
  }

  #getMessageById(id) {
    return this.#conversation.messages.find(m => m.id === id) ?? null;
  }

  #getUserMessageForAssistantId(assistantMessageId) {
    const assistantMsg = this.#getMessageById(assistantMessageId);
    if (!assistantMsg?.parentMessageId) {
      return null;
    }

    return this.#getMessageById(assistantMsg.parentMessageId) ?? null;
  }

  #retryAfterError() {
    if (this._isRetrying) {
      console.warn("ai-window: retry already in progress");
      return;
    }

    this._isRetrying = true;
    this.#fetchAIResponse(false)
      .catch(error => {
        console.error("Error retrying after error:", error);
      })
      .finally(() => {
        this._isRetrying = false;
      });
  }

  async #retryFromAssistantMessageId(assistantMessageId, withMemories) {
    if (this._isRetrying) {
      console.warn("ai-window: retry already in progress");
      return;
    }

    const userMsg = this.#getUserMessageForAssistantId(assistantMessageId);
    if (!userMsg) {
      return;
    }

    this._isRetrying = true;
    try {
      const actor = this.#getAIChatContentActor();

      // Truncate to the retried turn so retry regenerates only that response.
      actor?.dispatchTruncateToChatContent({ messageId: assistantMessageId });

      // Retry is delete-only here; generation happens via fetchAIResponse below.
      const messagesToDelete = await this.#conversation.retryMessage(userMsg);
      await lazy.AIWindow.chatStore.deleteMessages(messagesToDelete);
      await this.#updateConversation();
      await this.#fetchAIResponse(userMsg.content.body, {
        skipUserDispatch: true,
        memoriesEnabled:
          withMemories ?? this.#memoriesToggled ?? this.#memoriesIconShown,
      });
    } catch (e) {
      console.error("ai-window: retry failed", e);
    } finally {
      this._isRetrying = false;
    }
  }

  async #removeAppliedMemory(messageId, memory) {
    try {
      const memoryId = memory.id;
      const deleted = await lazy.MemoriesManager.hardDeleteMemoryById(memoryId);
      if (!deleted) {
        console.warn("hardDeleteMemory returned false", memoryId);
      }

      const actor = this.#getAIChatContentActor();
      actor?.dispatchRemoveAppliedMemoryToChatContent({
        messageId,
        memoryId,
      });
    } catch (e) {
      console.error("Failed to delete memory", memory, e);
    }
  }

  render() {
    return html`
      <link rel="stylesheet" href="chrome://global/content/widgets.css" />
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-window.css"
      />
      <!-- TODO (Bug 2008938): Make in-page Smartbar styling not dependent on chrome styles -->
      <link rel="stylesheet" href="chrome://browser/skin/smartbar.css" />
      ${this.mode === MODE.SIDEBAR
        ? html`<div class="sidebar-header">
            <moz-button
              data-l10n-id="aiwindow-new-chat"
              data-l10n-attrs="tooltiptext,aria-label"
              class="new-chat-icon-button"
              size="default"
              iconsrc="chrome://browser/content/aiwindow/assets/new-chat.svg"
              @click=${this.onCreateNewChatClick}
            ></moz-button>
          </div>`
        : ""}
      ${this.mode === MODE.FULLPAGE
        ? html`<smartwindow-heading></smartwindow-heading>`
        : ""}
      <div id="browser-container"></div>
      ${this.showStarters
        ? html`
            <smartwindow-prompts
              .prompts=${this.#starters}
              .mode=${this.mode}
              @SmartWindowPrompt:prompt-selected=${this.#handlePromptSelected}
            ></smartwindow-prompts>
          `
        : ""}
      ${this.showDisclaimer
        ? html`<div
            data-l10n-id="smartwindow-disclaimer"
            class="disclaimer"
          ></div>`
        : ""}
      ${this.showFooter ? html`<smartwindow-footer></smartwindow-footer>` : ""}
    `;
  }
}

customElements.define("ai-window", AIWindow);
