/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "ClipboardHelper",
  "@mozilla.org/widget/clipboardhelper;1",
  Ci.nsIClipboardHelper
);

/**
 * Represents a child actor for getting page data from the browser.
 */
export class AIChatContentChild extends JSWindowActorChild {
  static #EVENT_MAPPINGS_FROM_PARENT = {
    "AIChatContent:DispatchMessage": {
      event: "aiChatContentActor:message",
    },
    "AIChatContent:TruncateConversation": {
      event: "aiChatContentActor:truncate",
    },
    "AIChatContent:RemoveAppliedMemory": {
      event: "aiChatContentActor:remove-applied-memory",
    },
  };

  static #VALID_EVENTS_FROM_CONTENT = new Set([
    "AIChatContent:DispatchSearch",
    "AIChatContent:DispatchFollowUp",
    "AIChatContent:Ready",
    "AIChatContent:DispatchAction",
    "AIChatContent:OpenLink",
    "AIChatContent:DispatchNewChat",
    "AIChatContent:AccountSignIn",
  ]);

  /**
   * Trusted URLs pushed from parent for synchronous validation.
   * Stored as array for Xray wrapper compatibility.
   *
   * @type {string[]}
   */
  #trustedUrls = [];

  /**
   *  Receives event from the content process and sends to the parent.
   *
   * @param {CustomEvent} event
   */
  handleEvent(event) {
    if (!AIChatContentChild.#VALID_EVENTS_FROM_CONTENT.has(event.type)) {
      console.warn(`AIChatContentChild received unknown event: ${event.type}`);
      return;
    }

    switch (event.type) {
      case "AIChatContent:DispatchSearch":
        this.#handleSearchDispatch(event);
        break;

      case "AIChatContent:DispatchAction":
        this.#handleActionDispatch(event);
        break;

      case "AIChatContent:DispatchFollowUp":
        this.#handleFollowUpDispatch(event);
        break;

      case "AIChatContent:DispatchNewChat":
        /*
         * This message round-trips:
         * child
         * -> parent (to reset conversation state in ai-window)
         * -> child (to clear the UI via "clear-conversation").
         * The parent owns the conversation state, so we must go through it to start a new chat.
         */
        this.sendAsyncMessage("AIChatContent:DispatchNewChat");
        break;

      case "AIChatContent:Ready":
        this.sendAsyncMessage("AIChatContent:Ready");

        // Flush any trusted URLs that arrived before chatContent existed.
        // Parent also re-pushes on Ready via #notifyContentReady
        if (this.#trustedUrls.length) {
          this.#dispatchToChatContent("aiChatContentActor:trustedUrlsUpdated", {
            trustedUrls: this.#trustedUrls,
          });
          this.#trustedUrls = [];
        }

        break;

      case "AIChatContent:OpenLink":
        this.sendAsyncMessage("AIChatContent:OpenLink", event.detail);
        break;

      case "AIChatContent:AccountSignIn":
        this.sendAsyncMessage("AIChatContent:AccountSignIn", event.detail);
        break;

      default:
        console.warn(
          `AIChatContentChild received unknown event: ${event.type}`
        );
    }
  }

  #handleSearchDispatch(event) {
    this.sendAsyncMessage("aiChatContentActor:search", event.detail);
  }

  #handleActionDispatch(event) {
    const { action, text } = event.detail ?? {};
    // Copy is handled in the child actor since it depends on content-side
    // selection and clipboard context.
    if (action === "copy") {
      if (text) {
        lazy.ClipboardHelper.copyString(text, this.windowContext);
      }
    }
    this.sendAsyncMessage("aiChatContentActor:footer-action", event.detail);
  }

  #handleFollowUpDispatch(event) {
    this.sendAsyncMessage("aiChatContentActor:followUp", event.detail);
  }

  async receiveMessage(message) {
    if (message.name === "AIChatContent:TrustedUrlsUpdated") {
      this.#handleTrustedUrlsUpdated(message.data);
      return undefined;
    }

    const mapping =
      AIChatContentChild.#EVENT_MAPPINGS_FROM_PARENT[message.name];

    if (!mapping) {
      console.warn(
        `AIChatContentChild received unknown message: ${message.name}`
      );
      return undefined;
    }

    const payload = message.data;
    return this.#dispatchToChatContent(mapping.event, payload);
  }

  /**
   * Handles trusted URLs pushed from parent.
   *
   * Normalizes URLs: canonicalizes via URL.parse().href and strips fragments
   * to ensure "example.com/page" and "example.com/page#section" match.
   *
   * @param {object} data - Message data
   * @param {string[]} data.trustedUrls - Array of trusted URLs from parent
   */
  #handleTrustedUrlsUpdated(data) {
    const { trustedUrls } = data;
    const list = Array.isArray(trustedUrls) ? trustedUrls : [];

    const normalized = list
      .map(url => {
        const parsed = URL.parse(url);
        if (!parsed) {
          return null;
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return null;
        }
        parsed.hash = "";
        return parsed.href;
      })
      .filter(Boolean);

    this.#trustedUrls = normalized;

    this.#dispatchToChatContent("aiChatContentActor:trustedUrlsUpdated", {
      trustedUrls: normalized,
    });
  }

  #dispatchToChatContent(eventName, payload) {
    try {
      const chatContent = this.document.querySelector("ai-chat-content");

      if (!chatContent) {
        console.error(`No ai-chat-content element found for ${eventName}`);
        return false;
      }

      const clonedPayload = Cu.cloneInto(payload, this.contentWindow);

      const event = new this.contentWindow.CustomEvent(eventName, {
        detail: clonedPayload,
        bubbles: true,
      });

      chatContent.dispatchEvent(event);
      return true;
    } catch (error) {
      console.error(`Error dispatching ${eventName} to chat content:`, error);
      return false;
    }
  }
}
