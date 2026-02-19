/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {});

/**
 * Represents a child actor for getting page data from the browser.
 */
export class AIChatContentChild extends JSWindowActorChild {
  static #EVENT_MAPPINGS_FROM_PARENT = {
    "AIChatContent:DispatchMessage": {
      event: "aiChatContentActor:message",
    },
  };

  static #VALID_EVENTS_FROM_CONTENT = new Set(["AIChatContent:DispatchSearch"]);

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

      default:
        console.warn(
          `AIChatContentChild received unknown event: ${event.type}`
        );
    }
  }

  #handleSearchDispatch(event) {
    this.sendAsyncMessage("aiChatContentActor:search", event.detail);
  }

  async receiveMessage(message) {
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
