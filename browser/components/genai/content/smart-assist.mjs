/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/sidebar/sidebar-panel-header.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  SmartAssistEngine:
    "moz-src:///browser/components/genai/SmartAssistEngine.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

const FULL_PAGE_URL = "chrome://browser/content/genai/smartAssistPage.html";
const ACTION_CHAT = "chat";
const ACTION_SEARCH = "search";

/**
 * A custom element for managing the smart assistant sidebar.
 */
export class SmartAssist extends MozLitElement {
  static properties = {
    userPrompt: { type: String },
    aiResponse: { type: String },
    conversationState: { type: Array },
    logState: { type: Array },
    mode: { type: String }, // "tab" | "sidebar"
    overrideNewTab: { type: Boolean },
    showLog: { type: Boolean },
    actionKey: { type: String }, // "chat" | "search"
  };

  constructor() {
    super();
    this.userPrompt = "";
    // TODO the conversation state will evenually need to be stored in a "higher" location
    // then just the state of this lit component. This is a Stub to get the convo started for now
    this.conversationState = [
      { role: "system", content: "You are a helpful assistant" },
    ];
    this.logState = [];
    this.showLog = false;
    this.mode = "sidebar";
    this.overrideNewTab = Services.prefs.getBoolPref(
      "browser.ml.smartAssist.overrideNewTab"
    );
    this.actionKey = ACTION_CHAT;
    this._actions = {
      [ACTION_CHAT]: {
        label: "Submit",
        icon: "chrome://global/skin/icons/arrow-right.svg",
        run: this._actionChat,
      },
      [ACTION_SEARCH]: {
        label: "Search",
        icon: "chrome://global/skin/icons/search-glass.svg",
        run: this._actionSearch,
      },
    };
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.mode === "sidebar" && this.overrideNewTab) {
      this._applyNewTabOverride(true);
    }
  }

  /**
   * Adds a new message to the conversation history.
   *
   * @param {object} chatEntry - A message object to add to the conversation
   * @param {("system"|"user"|"assistant")} chatEntry.role - The role of the message sender
   * @param {string} chatEntry.content - The text content of the message
   */
  _updateConversationState = chatEntry => {
    this.conversationState = [...this.conversationState, chatEntry];
  };

  _updatelogState = chatEntry => {
    const entryWithDate = { ...chatEntry, date: new Date().toLocaleString() };
    this.logState = [...this.logState, entryWithDate];
  };

  _handlePromptInput = async e => {
    try {
      const value = e.target.value;
      this.userPrompt = value;

      const intent = await lazy.SmartAssistEngine.getPromptIntent(value);
      this.actionKey = [ACTION_CHAT, ACTION_SEARCH].includes(intent)
        ? intent
        : ACTION_CHAT;
    } catch (error) {
      // Default to chat on error
      this.actionKey = ACTION_CHAT;
      console.error("Error determining prompt intent:", error);
    }
  };

  /**
   * Returns the current action object based on the actionKey
   */

  get inputAction() {
    return this._actions[this.actionKey];
  }

  _actionSearch = async () => {
    const searchTerms = (this.userPrompt || "").trim();
    if (!searchTerms) {
      return;
    }

    const isPrivate = lazy.PrivateBrowsingUtils.isWindowPrivate(window);
    const engine = isPrivate
      ? await Services.search.getDefaultPrivate()
      : await Services.search.getDefault();

    const submission = engine.getSubmission(searchTerms); // default to SEARCH (text/html)

    // getSubmission can return null if the engine doesn't have a URL
    // with a text/html response type. This is unlikely (since
    // SearchService._addEngineToStore() should fail for such an engine),
    // but let's be on the safe side.
    if (!submission) {
      return;
    }

    const triggeringPrincipal =
      Services.scriptSecurityManager.createNullPrincipal({});

    window.browsingContext.topChromeWindow.openLinkIn(
      submission.uri.spec,
      "current",
      {
        private: isPrivate,
        postData: submission.postData,
        inBackground: false,
        relatedToCurrent: true,
        triggeringPrincipal,
        policyContainer: null,
        targetBrowser: null,
        globalHistoryOptions: {
          triggeringSearchEngine: engine.name,
        },
      }
    );
  };

  _actionChat = async () => {
    const formattedPrompt = (this.userPrompt || "").trim();
    if (!formattedPrompt) {
      return;
    }

    // Push user prompt
    this._updateConversationState({ role: "user", content: formattedPrompt });
    this.userPrompt = "";

    // Create an empty assistant placeholder.
    this._updateConversationState({ role: "assistant", content: "" });
    const latestAssistantMessageIndex = this.conversationState.length - 1;

    let acc = "";
    try {
      const stream = lazy.SmartAssistEngine.fetchWithHistory(
        this.conversationState
      );

      for await (const chunk of stream) {
        // Check to see if chunk is special tool calling log and add to logState
        if (chunk.type === "tool_call_log") {
          this._updatelogState({
            content: chunk.content,
            result: chunk.result || "No result",
          });
          continue;
        }
        acc += chunk;
        // append to the latest assistant message

        this.conversationState[latestAssistantMessageIndex] = {
          ...this.conversationState[latestAssistantMessageIndex],
          content: acc,
        };
        this.requestUpdate?.();
      }
    } catch (e) {
      this.conversationState[latestAssistantMessageIndex] = {
        role: "assistant",
        content: `There was an error`,
      };
      this.requestUpdate?.();
    }
  };

  /**
   * Mock Functionality to open full page UX
   *
   * @param {boolean} enable
   * Whether or not to override the new tab page.
   */
  _applyNewTabOverride(enable) {
    try {
      enable
        ? (lazy.AboutNewTab.newTabURL = FULL_PAGE_URL)
        : lazy.AboutNewTab.resetNewTabURL();
    } catch (e) {
      console.error("Failed to toggle new tab override:", e);
    }
  }

  _onToggleFullPage(e) {
    const isChecked = e.target.checked;
    Services.prefs.setBoolPref(
      "browser.ml.smartAssist.overrideNewTab",
      isChecked
    );
    this.overrideNewTab = isChecked;
    this._applyNewTabOverride(isChecked);
  }

  /**
   * Initiates the Firefox Account sign-in flow for MLPA authentication.
   */

  _signIn() {
    lazy.SpecialMessageActions.handleAction(
      {
        type: "FXA_SIGNIN_FLOW",
        data: {
          entrypoint: "aiwindow",
          extraParams: {
            service: "aiwindow",
          },
        },
      },
      window.browsingContext.topChromeWindow.gBrowser.selectedBrowser
    );
  }

  /**
   * Helper method to get the chrome document
   *
   * @returns {Document} The top-level chrome window's document
   */

  _getChromeDocument() {
    return window.browsingContext.topChromeWindow.document;
  }

  /**
   * Helper method to find an element in the chrome document
   *
   * @param {string} id - The element ID to find
   * @returns {Element|null} The found element or null
   */

  _getChromeElement(id) {
    return this._getChromeDocument().getElementById(id);
  }

  /**
   * Helper method to get or create the AI window browser element
   *
   * @param {Document} chromeDoc - The chrome document
   * @param {Element} box - The AI window box element
   * @returns {Element} The AI window browser element
   */

  _getOrCreateBrowser(chromeDoc, box) {
    // Find existing browser, or create it the first time we open the sidebar.
    let browser = chromeDoc.getElementById("ai-window-browser");

    if (!browser) {
      const stack =
        box.querySelector(".ai-window-browser-stack") ||
        chromeDoc.createXULElement("stack");

      stack.className = "ai-window-browser-stack";
      stack.setAttribute("flex", "1");
      box.appendChild(stack);

      browser = chromeDoc.createXULElement("browser");
      browser.setAttribute("id", "ai-window-browser");
      browser.setAttribute("flex", "1");
      browser.setAttribute("disablehistory", "true");
      browser.setAttribute("disablefullscreen", "true");
      browser.setAttribute("tooltip", "aHTMLTooltip");

      browser.setAttribute(
        "src",
        "chrome://browser/content/genai/smartAssist.html"
      );

      stack.appendChild(browser);
    }
  }

  _toggleAIWindowSidebar() {
    const chromeDoc = this._getChromeDocument();
    const box = chromeDoc.getElementById("ai-window-box");
    const splitter = chromeDoc.getElementById("ai-window-splitter");

    if (!box || !splitter) {
      return;
    }

    this._getOrCreateBrowser(chromeDoc, box);

    // Toggle visibility
    const opening = box.hidden;

    box.hidden = !opening;
    splitter.hidden = !opening;

    // Make sure parent container is also visible
    if (box.parentElement && box.parentElement.hidden) {
      box.parentElement.hidden = false;
    }
  }

  render() {
    const iconSrc = this.showLog
      ? "chrome://global/skin/icons/arrow-down.svg"
      : "chrome://global/skin/icons/arrow-up.svg";

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/genai/content/smart-assist.css"
      />
      <div class="wrapper">
        ${
          this.mode === "sidebar"
            ? html` <sidebar-panel-header
                data-l10n-id="genai-smart-assist-sidebar-title"
                data-l10n-attrs="heading"
                view="viewGenaiSmartAssistSidebar"
              ></sidebar-panel-header>`
            : ""
        }

        <div>

          <!-- Conversation Panel -->
          <div>
            ${this.conversationState
              .filter(msg => msg.role !== "system")
              .map(
                msg =>
                  html`<div class="message ${msg.role}">
                    <strong>${msg.role}:</strong> ${msg.content}
                    ${msg.role === "assistant" && msg.content.length === 0
                      ? html`<span>Thinking</span>`
                      : ""}
                  </div>`
              )}
          </div>

          <!-- Log Panel -->
          ${
            this.logState.length !== 0
              ? html` <div class="log-panel">
                  <div class="log-header">
                    <span class="log-title">Log</span>
                    <moz-button
                      type="ghost"
                      iconSrc=${iconSrc}
                      @click=${() => {
                        this.showLog = !this.showLog;
                      }}
                    >
                    </moz-button>
                  </div>
                  ${this.showLog
                    ? html` <div class="log-entries">
                        ${this.logState.map(
                          data =>
                            html`<div class="log-entry">
                              <div><b>Message</b> : ${data.content}</div>
                              <div><b>Date</b> : ${data.date}</div>
                              <div>
                                <b>Tool Response</b> :
                                ${JSON.stringify(data.result)}
                              </div>
                            </div>`
                        )}
                      </div>`
                    : html``}
                </div>`
              : html``
          }
          </div>

          <!-- User Input -->
          <textarea
            .value=${this.userPrompt}
            class="prompt-textarea"
            @input=${e => this._handlePromptInput(e)}
          ></textarea>
          <moz-button
            iconSrc=${this.inputAction.icon}
            id="submit-user-prompt-btn"
            type="primary"
            size="small"
            @click=${this.inputAction.run}
            iconPosition="end"
          >
            ${this.inputAction.label}
          </moz-button>
          <hr/>
          <h3>The following Elements are for testing purposes</h3>

          <p>Sign in for MLPA authentication.</p>
          <moz-button
            type="primary"
            size="small"
            @click=${this._signIn}
          >
            Sign in
          </moz-button>
          <!-- Footer - New Tab Override -->
          ${
            this.mode === "sidebar"
              ? html`<div class="footer">
                  <moz-checkbox
                    type="checkbox"
                    label="Mock Full Page Experience"
                    @change=${e => this._onToggleFullPage(e)}
                    ?checked=${this.overrideNewTab}
                  ></moz-checkbox>
                </div>`
              : ""
          }

          ${
            this.mode === "tab"
              ? html`
                  <div class="footer">
                    <moz-button
                      type="primary"
                      size="small"
                      @click=${this._toggleAIWindowSidebar}
                    >
                      Open AI Window Sidebar
                    </moz-button>
                  </div>
                `
              : ""
          }
        </div>
      </div>
    `;
  }
}

customElements.define("smart-assist", SmartAssist);
