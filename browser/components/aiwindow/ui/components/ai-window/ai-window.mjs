/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Chat: "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs",
  generateChatTitle:
    "moz-src:///browser/components/aiwindow/models/TitleGeneration.sys.mjs",
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  ChatConversation:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs",
  MESSAGE_ROLE:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs",
  AssistantRoleOpts:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs",
  getRoleLabel:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", function () {
  return console.createInstance({
    prefix: "ChatStore",
    maxLogLevelPref: "browser.aiwindow.chatStore.loglevel",
  });
});

const FULLPAGE = "fullpage";
const SIDEBAR = "sidebar";

/**
 * A custom element for managing AI Window
 */
export class AIWindow extends MozLitElement {
  static properties = {
    userPrompt: { type: String },
    mode: { type: String }, // sidebar | fullpage
  };

  #browser;
  #conversation;

  #detectModeFromContext() {
    return window.browsingContext?.embedderElement?.id === "ai-window-browser"
      ? SIDEBAR
      : FULLPAGE;
  }

  constructor() {
    super();

    this.userPrompt = "";
    this.#browser = null;
    this.#conversation = new lazy.ChatConversation({});
    this.mode = this.#detectModeFromContext();
  }

  connectedCallback() {
    super.connectedCallback();
  }

  firstUpdated() {
    // Create a real XUL <browser> element from the chrome document
    const doc = this.ownerDocument; // browser.xhtml
    const browser = doc.createXULElement("browser");

    browser.setAttribute("id", "aichat-browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("maychangeremoteness", "true");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("src", "about:aichatcontent");
    browser.setAttribute("transparent", true);

    const container = this.renderRoot.querySelector("#browser-container");
    container.appendChild(browser);

    this.#browser = browser;
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
    if (this.#conversation.title) {
      return;
    }

    const firstUserMessage = this.#conversation.messages.find(
      m => m.role === lazy.MESSAGE_ROLE.USER
    );

    const title = await lazy.generateChatTitle(
      firstUserMessage?.content?.body,
      {
        url: firstUserMessage?.pageUrl?.href || "",
        title: this.#conversation.pageMeta?.title || "",
        description: this.#conversation.pageMeta?.description || "",
      }
    );

    this.#conversation.title = title;
    this.#updateConversation();
  }

  /**
   * Fetches an AI response based on the current user prompt.
   * Validates the prompt, updates conversation state, streams the response,
   * and dispatches updates to the browser actor.
   *
   * @private
   */

  #fetchAIResponse = async () => {
    const formattedPrompt = (this.userPrompt || "").trim();
    if (!formattedPrompt) {
      return;
    }

    // Handle User Prompt
    this.#dispatchMessageToChatContent({
      role: lazy.MESSAGE_ROLE.USER,
      content: {
        body: this.userPrompt,
      },
    });

    const nextTurnIndex = this.#conversation.currentTurnIndex() + 1;
    try {
      const stream = lazy.Chat.fetchWithHistory(
        await this.#conversation.generatePrompt(this.userPrompt)
      );
      this.#updateConversation();
      this.#addConversationTitle();

      this.userPrompt = "";

      // @todo
      // fill out these assistant message flags
      const assistantRoleOpts = new lazy.AssistantRoleOpts();
      this.#conversation.addAssistantMessage(
        "text",
        "",
        nextTurnIndex,
        assistantRoleOpts
      );

      for await (const chunk of stream) {
        const currentMessage = this.#conversation.messages.at(-1);
        currentMessage.content.body += chunk;

        this.#updateConversation();
        this.#dispatchMessageToChatContent(currentMessage);

        this.requestUpdate?.();
      }
    } catch (e) {
      // TODO - handle error properly
      this.requestUpdate?.();
    }
  };

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

  #dispatchMessageToChatContent(message) {
    const actor = this.#getAIChatContentActor();

    if (typeof message.role !== "string") {
      const roleLabel = lazy.getRoleLabel(message.role).toLowerCase();
      message.role = roleLabel;
    }

    return actor.dispatchMessageToChatContent(message);
  }

  /**
   * Handles input events from the prompt textarea.
   * Updates the userPrompt property with the current input value.
   *
   * @param {Event} e - The input event.
   * @private
   */

  #handlePromptInput = async e => {
    const value = e.target.value;
    this.userPrompt = value;
  };

  /**
   * Handles the submit action for the user prompt.
   * Triggers the AI response fetch process.
   */

  #handleSubmit() {
    this.#fetchAIResponse();
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-window.css"
      />
      <div>
        <div id="browser-container"></div>
        <!-- TODO : Remove place holder submit button, prompt will come from ai-input -->
        <textarea
          .value=${this.userPrompt}
          @input=${e => this.#handlePromptInput(e)}
        ></textarea>
        <moz-button type="primary" size="small" @click=${this.#handleSubmit}>
          Submit mock prompt
        </moz-button>

        <!-- TODO : Example of mode-based rendering -->
        ${this.mode === FULLPAGE
          ? html`<div>Fullpage Footer Content</div>`
          : ""}
      </div>
    `;
  }
}

customElements.define("ai-window", AIWindow);
