/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  AIWINDOW_URL,
  AIWindow,
} from "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs";

export const AIWindowUI = {
  BOX_ID: "ai-window-box",
  SPLITTER_ID: "ai-window-splitter",
  BROWSER_ID: "ai-window-browser",
  STACK_CLASS: "ai-window-browser-stack",
  AI_WINDOW_ELEMENT_TIMEOUT: 1500,

  /**
   * @param {Window} win
   * @returns {{ chromeDoc: Document, box: Element, splitter: Element } | null}
   */
  _getSidebarElements(win) {
    if (!win) {
      return null;
    }
    const chromeDoc = win.document;
    const box = chromeDoc.getElementById(this.BOX_ID);
    const splitter = chromeDoc.getElementById(this.SPLITTER_ID);

    if (!box || !splitter) {
      return null;
    }
    return { chromeDoc, box, splitter };
  },

  /**
   * Ensure the aiwindow <browser> exists under the sidebar box.
   *
   * @param {Document} chromeDoc
   * @param {Element} box
   * @returns {XULElement} browser
   */
  ensureBrowserIsAppended(chromeDoc, box) {
    const existingBrowser = chromeDoc.getElementById(this.BROWSER_ID);
    if (existingBrowser) {
      return existingBrowser;
    }

    const stack = box.querySelector(`.${this.STACK_CLASS}`);

    if (!stack.isConnected) {
      stack.className = this.STACK_CLASS;
      stack.setAttribute("flex", "1");
      box.appendChild(stack);
    }

    const browser = chromeDoc.createXULElement("browser");
    browser.id = this.BROWSER_ID;
    browser.setAttribute("transparent", "true");
    browser.setAttribute("flex", "1");
    browser.setAttribute("disablehistory", "true");
    browser.setAttribute("disablefullscreen", "true");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    browser.setAttribute("src", AIWINDOW_URL);
    browser.setAttribute("type", "content");
    stack.appendChild(browser);
    return browser;
  },

  /**
   * @param {Window} win
   * @returns {boolean} whether the sidebar is open (visible)
   */
  isSidebarOpen(win) {
    const nodes = this._getSidebarElements(win);
    if (!nodes) {
      return false;
    }
    return !nodes.box.collapsed;
  },

  _showSidebarElements(box, splitter) {
    box.collapsed = false;
    splitter.collapsed = false;
    box.parentElement.collapsed = false;
  },

  /**
   * Open the AI Window in full window mode
   *
   * @param {Browser} browser
   * @param {ChatConversation} conversation The conversation to open
   */
  openInFullWindow(browser, conversation) {
    this.closeSidebar(browser.ownerGlobal);

    browser.setAttribute("data-conversation-id", conversation.id);

    const { contentDocument } = browser;
    contentDocument.dispatchEvent(
      new browser.contentWindow.CustomEvent("OpenConversation", {
        detail: conversation,
      })
    );
  },

  /**
   * Open the AI Window sidebar
   *
   * @param {Window} win
   * @param {ChatConversation} conversation The conversation to open in the sidebar
   */
  async openSidebar(win, conversation) {
    const nodes = this._getSidebarElements(win);
    if (!nodes) {
      return;
    }

    const { box, splitter } = nodes;
    const aiBrowser = this.ensureBrowserIsAppended(win.document, box);

    this._showSidebarElements(box, splitter);
    this._setAskButtonStyle(win, true);

    if (conversation) {
      aiBrowser.setAttribute("data-conversation-id", conversation.id);
    } else {
      aiBrowser.removeAttribute("data-conversation-id");
    }

    if (!aiBrowser.contentDocument || !aiBrowser.contentWindow) {
      return;
    }

    const aiWindowElement = await this.getAiWindowElement(win, aiBrowser);
    if (!aiWindowElement) {
      return;
    }

    if (conversation) {
      aiWindowElement.openConversation(conversation);
      return;
    }

    aiWindowElement.onCreateNewChatClick();
  },

  /**
   * Gets the ai-window element from the sidebar browser. Polls until the
   * custom element is defined or the timeout is reached.
   *
   * @param {Window} win
   * @param {XULElement} aiBrowser
   *
   * @returns {Promise<AIWindow>} The sidebar AIWindow component
   */
  async getAiWindowElement(win, aiBrowser) {
    const deadline = Date.now() + AIWindowUI.AI_WINDOW_ELEMENT_TIMEOUT;
    while (Date.now() < deadline) {
      const el = aiBrowser.contentDocument?.querySelector("ai-window:defined");
      if (el) {
        return el;
      }
      await new Promise(resolve => win.setTimeout(resolve, 50));
    }
    return null;
  },

  /**
   * Close the AI Window sidebar.
   *
   * @param {Window} win
   */
  closeSidebar(win) {
    if (!this.isSidebarOpen(win)) {
      return;
    }
    const { box, splitter } = this._getSidebarElements(win);

    box.collapsed = true;
    splitter.collapsed = true;
    this._setAskButtonStyle(win, false);

    // Dispatch event to notify tab state manager that sidebar was toggled
    win.dispatchEvent(
      new win.CustomEvent("ai-window:sidebar-toggle", {
        detail: {
          tab: win.gBrowser?.selectedTab,
          isOpen: false,
        },
      })
    );
  },

  /**
   * Toggle the AI Window sidebar
   *
   * @param {Window} win
   * @returns {boolean} true if now open, false if now closed
   */
  toggleSidebar(win) {
    const nodes = this._getSidebarElements(win);
    if (!nodes) {
      return false;
    }
    const { chromeDoc, box, splitter } = nodes;

    if (!box.collapsed) {
      box.collapsed = true;
      splitter.collapsed = true;
      this._setAskButtonStyle(win, false);

      // Dispatch event to notify tab state manager that sidebar was toggled
      win.dispatchEvent(
        new win.CustomEvent("ai-window:sidebar-toggle", {
          detail: {
            tab: win.gBrowser?.selectedTab,
            isOpen: false,
          },
        })
      );
      return false;
    }

    this.ensureBrowserIsAppended(chromeDoc, box);
    this._showSidebarElements(box, splitter);
    this._setAskButtonStyle(win, true);

    // Dispatch event to notify tab state manager that sidebar was toggled
    win.dispatchEvent(
      new win.CustomEvent("ai-window:sidebar-toggle", {
        detail: {
          tab: win.gBrowser?.selectedTab,
          isOpen: true,
        },
      })
    );
    return true;
  },

  /**
   * Update the Ask Button style based on the sidebar state.
   *
   * @param {Window} win
   * @param {boolean} sidebarIsOpen
   */
  _setAskButtonStyle(win, sidebarIsOpen) {
    const askBtn = win.document.querySelector("#smartwindow-ask-button-inner");
    if (!askBtn) {
      return;
    }
    askBtn.classList.toggle("sidebar-is-open", sidebarIsOpen);
  },

  /**
   * Moves a full-page AI Window conversation into the sidebar.
   *
   * @param {Window} win
   * @param {object} tab - The tab containing the full-page AI Window
   * @returns {XULElement|null} The sidebar browser element
   */
  async moveFullPageToSidebar(win, tab) {
    const fullPageBrowser = tab.linkedBrowser;
    if (
      !fullPageBrowser?.currentURI ||
      !AIWindow.isAIWindowContentPage(fullPageBrowser.currentURI)
    ) {
      return null;
    }

    let conversationId = null;
    try {
      const aiWindowEl =
        fullPageBrowser.contentDocument?.querySelector("ai-window");
      conversationId = aiWindowEl?.conversationId ?? null;
    } catch {
      // Content may not be accessible
    }

    let conversation = null;
    if (conversationId) {
      conversation =
        await AIWindow.chatStore.findConversationById(conversationId);
    }

    this.openSidebar(win, conversation);

    const nodes = this._getSidebarElements(win);
    return nodes ? nodes.chromeDoc.getElementById(this.BROWSER_ID) : null;
  },

  /**
   * Updates the sidebar input with the specified value.
   *
   * @param {Window} win
   * @param {string} value The new input value
   */
  updateSidebarInput(win, value) {
    if (!this.isSidebarOpen(win)) {
      return;
    }

    const aiWindowEl = this._getSidebarAiWindow(win);
    if (!aiWindowEl?.updateInput) {
      return;
    }

    aiWindowEl.updateInput(value);
  },

  /**
   * Triggers updating the starter prompts in the sidebar window if it
   * is already opened.
   *
   * @param {Window} win
   */
  updateStarterPrompts(win) {
    const sidebarAiWindow = this._getSidebarAiWindow(win);
    if (!sidebarAiWindow) {
      return;
    }

    sidebarAiWindow.loadStarterPrompts(true);
  },

  /**
   * Gets the sidebar instance of the ai-window component
   *
   * @param {Window} win
   *
   * @private
   */
  _getSidebarAiWindow(win) {
    if (!this.isSidebarOpen(win)) {
      return null;
    }

    const aiWindowBrowser = win.document.getElementById(this.BROWSER_ID);
    return aiWindowBrowser?.contentDocument?.querySelector("ai-window:defined");
  },
};
