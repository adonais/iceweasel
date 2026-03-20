/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  getSecurityOrchestrator:
    "chrome://global/content/ml/security/SecurityOrchestrator.sys.mjs",
  SmartWindowTelemetry:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartWindowTelemetry.sys.mjs",
  AIWindowUI:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindowUI.sys.mjs",
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
  URILoadingHelper: "resource:///modules/URILoadingHelper.sys.mjs",
});

/**
 * JSWindowActor to pass data between AIChatContent singleton and content pages.
 *
 * Handles:
 * - Message routing between ai-window and ai-chat-content
 * - Conversation ID tracking for security ledger access
 * - Push-based trusted URL updates to child
 */
export class AIChatContentParent extends JSWindowActorParent {
  /**
   * The session ledger for the current conversation.
   * Stored for EventTarget listener management and direct access.
   *
   * @type {SessionLedger|null}
   */
  #sessionLedger = null;

  /**
   * Counter to detect superseded #setConversation calls.
   * Prevents stale async calls from attaching listeners to wrong ledgers.
   *
   * @type {number}
   */
  #setConversationGeneration = 0;

  /**
   * Bound handler for ledger "change" events.
   * Stable reference needed for addEventListener/removeEventListener.
   */
  #onLedgerChange = () => this.#pushTrustedUrlsToChild();

  dispatchMessageToChatContent(message) {
    // Ideally we should allowlist or use a schema to validate what we send to
    // the child process, that is bug 2022057.
    // We can't send URL objects through IPC, so we need to remove the pageUrl
    // property before sending the message to the child process. We don't want
    // to change the original message object which is used elsewhere, so we
    // do a shallow clone first:
    message = Object.assign({}, message);
    delete message.pageUrl;
    this.sendAsyncMessage("AIChatContent:DispatchMessage", message);
  }

  dispatchTruncateToChatContent(payload) {
    this.sendAsyncMessage("AIChatContent:TruncateConversation", payload);
  }

  dispatchRemoveAppliedMemoryToChatContent(payload) {
    this.sendAsyncMessage("AIChatContent:RemoveAppliedMemory", payload);
  }

  /**
   * Sets the current conversation for security ledger tracking.
   *
   * Called directly by ai-window when a conversation is opened or changed.
   * Subscribes to ledger changes and pushes initial trusted URLs to child.
   *
   * @param {string|null} conversationId - The conversation identifier
   */
  setConversation(conversationId) {
    this.#setConversation(conversationId);
  }

  /**
   * Seeds a mentioned URL into the security ledger.
   *
   * Called by ai-window at submission time when the user's message
   * includes @mentioned tabs. This represents explicit user consent
   * to trust the URL.
   *
   * @param {string} conversationId - Conversation to seed into
   * @param {string} url - URL to seed as trusted
   */
  seedMentionedUrl(conversationId, url) {
    this.#handleSeedMentionedUrl({ conversationId, url });
  }

  receiveMessage({ data, name }) {
    switch (name) {
      case "aiChatContentActor:search":
        this.#handleSearchFromChild(data);
        break;

      case "aiChatContentActor:followUp":
        this.#handleFollowUpFromChild(data);
        break;

      case "AIChatContent:Ready":
        this.#notifyContentReady();
        break;

      case "AIChatContent:DispatchNewChat":
        this.#handleNewChat();
        break;

      case "aiChatContentActor:footer-action":
        this.#handleFooterActionFromChild(data);
        break;

      case "AIChatContent:OpenLink":
        this.#handleOpenLink(data);
        break;

      case "AIChatContent:AccountSignIn":
        this.#handleAccountSignIn();
        break;

      default:
        console.warn(`AIChatContentParent received unknown message: ${name}`);
        break;
    }
    return undefined;
  }

  /**
   * Cleans up ledger subscription and state on actor destruction.
   */
  didDestroy() {
    this.#unsubscribeLedger();
  }

  /**
   * Removes the ledger change listener and clears the ledger reference.
   * Called when conversation changes or actor is destroyed.
   */
  #unsubscribeLedger() {
    if (this.#sessionLedger) {
      this.#sessionLedger.removeEventListener("change", this.#onLedgerChange);
      this.#sessionLedger = null;
    }
  }

  #notifyContentReady() {
    const aiWindow = this.#getAIWindowElement();
    aiWindow?.onContentReady();

    // If the ledger is already bound (setConversation completed before child
    // was ready), push trusted URLs now that the child can receive messages.
    if (this.#sessionLedger) {
      this.#pushTrustedUrlsToChild();
    }
  }

  #handleSearchFromChild(data) {
    try {
      const { topChromeWindow } = this.browsingContext;
      lazy.AIWindow.performSearch(data, topChromeWindow);
    } catch (e) {
      console.warn("Could not perform search from AI Window chat", e);
    }
  }

  #handleFooterActionFromChild(data) {
    try {
      const aiWindow = this.#getAIWindowElement();
      aiWindow.handleFooterAction(data);
    } catch (e) {
      console.warn("Could not handle footer action from AI Window chat", e);
    }
  }

  #handleOpenLink(data) {
    const aiWindow = this.#getAIWindowElement();
    aiWindow?.onOpenLink();

    try {
      const { url } = data;
      if (!url) {
        return;
      }

      const uri = Services.io.newURI(url);
      if (uri.scheme !== "http" && uri.scheme !== "https") {
        return;
      }

      const window = this.browsingContext.topChromeWindow;

      if (!window) {
        return;
      }

      lazy.SmartWindowTelemetry.recordUriLoad();
      const currentPageURL = window.gBrowser.selectedBrowser.currentURI.spec;

      // Only treat it as "same link" if the URL is identical.
      // If anything differs (hash/query/path), let normal navigation proceed.
      if (url === currentPageURL) {
        lazy.AIWindowUI.handleSameLinkClick(window);
        return;
      }

      const { userContextId } =
        window.gBrowser.selectedBrowser.browsingContext.originAttributes;
      const triggeringPrincipal =
        Services.scriptSecurityManager.createNullPrincipal({ userContextId });
      const where = lazy.BrowserUtils.whereToOpenLink(data);

      if (where === "current") {
        const tabFound = lazy.URILoadingHelper.switchToTabHavingURI(
          window,
          url,
          false,
          {}
        );
        if (tabFound) {
          return;
        }
      }

      lazy.URILoadingHelper.openWebLinkIn(window, url, where, {
        triggeringPrincipal,
        userContextId,
        forceForeground: false,
      });
    } catch (e) {
      console.warn("Could not open link from AI Window chat", e);
    }
  }

  async #handleAccountSignIn() {
    const browser = this.browsingContext.topChromeWindow.gBrowser;
    const success = await lazy.AIWindow.launchSignInFlow(browser);
    if (success) {
      this.#handleRetryAfterError();
    }
  }

  #handleRetryAfterError() {
    try {
      const aiWindow = this.#getAIWindowElement();
      aiWindow.handleFooterAction({ action: "retry-after-error" });
    } catch (e) {
      console.warn("Could not handle Retry from AI Window chat", e);
    }
  }

  #handleNewChat() {
    try {
      const aiWindow = this.#getAIWindowElement();
      aiWindow.onCreateNewChatClick();
    } catch (e) {
      console.warn("Could not open new Smart Window chat", e);
    }
  }

  #getAIWindowElement() {
    const browser = this.browsingContext.embedderElement;
    const root = browser?.getRootNode?.();
    if (root?.host?.localName === "ai-window") {
      return root.host;
    }
    return browser?.ownerDocument?.querySelector("ai-window") ?? null;
  }

  #handleFollowUpFromChild(data) {
    try {
      const aiWindow = this.#getAIWindowElement();
      aiWindow.onQuickPromptClicked(data.text, false);
    } catch (e) {
      console.warn("Could not submit follow-up from AI Window chat", e);
    }
  }

  /**
   * Sets the current conversation and subscribes to ledger changes.
   *
   * Unsubscribes from previous ledger before subscribing to new one.
   * Uses a generation counter to discard stale calls after await.
   * Pushes initial trusted URL state after subscribing to cover any
   * change events missed during the async gap.
   *
   * @param {string|null} conversationId - The conversation identifier
   */
  async #setConversation(conversationId) {
    this.#unsubscribeLedger();
    const generation = ++this.#setConversationGeneration;

    if (!conversationId) {
      return;
    }

    try {
      const orchestrator = await lazy.getSecurityOrchestrator();

      if (generation !== this.#setConversationGeneration) {
        return;
      }

      this.#sessionLedger = orchestrator.registerSession(conversationId);
      this.#sessionLedger.addEventListener("change", this.#onLedgerChange);
      this.#pushTrustedUrlsToChild();
    } catch (e) {
      console.warn("Failed to set conversation for security ledger:", e);
    }
  }

  /**
   * Handles seeding a mentioned URL into the conversation ledger.
   *
   * Called at submission time when the user's message includes @mentions.
   * The "change" event triggers a push automatically if subscribed.
   * If not yet subscribed, URLs will be pushed once setConversation binds the ledger.
   *
   * @param {object} data - Seed request data
   * @param {string} data.conversationId - Conversation to seed into
   * @param {string} data.url - URL to seed
   */
  async #handleSeedMentionedUrl({ conversationId, url }) {
    if (!conversationId || !url) {
      return;
    }

    try {
      const orchestrator = await lazy.getSecurityOrchestrator();
      const sessionLedger = orchestrator.registerSession(conversationId);
      sessionLedger.seedConversation([url]);
    } catch (e) {
      console.warn("Failed to seed mentioned URL:", e);
    }
  }

  /**
   * Pushes the current trusted URL list to the child process.
   *
   * Uses the locally-held session ledger to build the trusted URL set.
   * Returns early if no ledger is bound (e.g., before setConversation).
   */
  #pushTrustedUrlsToChild() {
    if (!this.#sessionLedger) {
      return;
    }

    // Security validation is gated behind this pref. When disabled,
    // skip pushing trusted URLs so links render without validation.
    if (
      !Services.prefs.getBoolPref(
        "browser.smartwindow.checkSecurityFlags",
        true
      )
    ) {
      return;
    }

    try {
      const merged = this.#sessionLedger.mergeAll();
      const trustedUrls = merged.getAllUrls();
      this.sendAsyncMessage("AIChatContent:TrustedUrlsUpdated", {
        trustedUrls,
      });
    } catch (e) {
      console.warn("Failed to push trusted URLs to child:", e);
    }
  }
}
