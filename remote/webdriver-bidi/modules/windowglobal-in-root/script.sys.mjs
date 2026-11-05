/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Module } from "chrome://remote/content/shared/messagehandler/Module.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NavigableManager: "chrome://remote/content/shared/NavigableManager.sys.mjs",
  processExtraData:
    "chrome://remote/content/webdriver-bidi/modules/Intercept.sys.mjs",
  TabManager: "chrome://remote/content/shared/TabManager.sys.mjs",
  UserContextManager:
    "chrome://remote/content/shared/UserContextManager.sys.mjs",
  WindowGlobalMessageHandler:
    "chrome://remote/content/shared/messagehandler/WindowGlobalMessageHandler.sys.mjs",
});

class ScriptModule extends Module {
  #delayedMessageEvents;

  constructor(messageHandler) {
    super(messageHandler);

    lazy.NavigableManager.on("navigableId-created", this.#onNavigableIdCreated);

    // The weak map between a browsing context object and a list of
    // a "script.message" event payloads to send when a related navigable id is created.
    this.#delayedMessageEvents = new WeakMap();
  }

  destroy() {
    lazy.NavigableManager.off(
      "navigableId-created",
      this.#onNavigableIdCreated
    );

    this.#delayedMessageEvents = new WeakMap();
  }

  interceptEvent(name, payload) {
    if (name == "script.message") {
      const browsingContext = payload.source.context;
      if (!lazy.TabManager.isValidCanonicalBrowsingContext(browsingContext)) {
        // Discard events for invalid browsing contexts.
        return null;
      }

      const contextId =
        lazy.NavigableManager.getIdForBrowsingContext(browsingContext);

      // If contextId is not created yet we have to delay all events until it's ready.
      if (contextId === null) {
        this.#delayedMessageEvents
          .getOrInsert(browsingContext, [])
          .push(payload);

        return null;
      }

      payload = this.#prepareMessageEventPayload(
        browsingContext,
        payload,
        contextId
      );
    }

    return payload;
  }

  #onNavigableIdCreated = (_, data = {}) => {
    const { browsingContext, navigableId } = data;

    if (this.#delayedMessageEvents.has(browsingContext)) {
      const eventList = this.#delayedMessageEvents.get(browsingContext);

      for (const event of eventList) {
        const payload = this.#prepareMessageEventPayload(
          browsingContext,
          event,
          navigableId
        );

        this.emitEvent("script.message", payload, [
          {
            contextId: browsingContext.id,
            type: lazy.WindowGlobalMessageHandler.type,
          },
        ]);
      }

      this.#delayedMessageEvents.delete(browsingContext);
    }
  };

  #prepareMessageEventPayload(browsingContext, payload, navigableId) {
    // Resolve browsing context to a Navigable id.
    payload.source.context = navigableId;

    // Resolve the user context id for the browsing context.
    payload.source.userContext =
      lazy.UserContextManager.getIdByBrowsingContext(browsingContext);

    payload = lazy.processExtraData(
      this.messageHandler.internalSessionId,
      payload
    );

    return payload;
  }
}

export const script = ScriptModule;
