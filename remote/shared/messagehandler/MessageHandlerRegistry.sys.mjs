/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Log: "chrome://remote/content/shared/Log.sys.mjs",
  readSessionData:
    "chrome://remote/content/shared/messagehandler/sessiondata/SessionDataReader.sys.mjs",
  RootMessageHandler:
    "chrome://remote/content/shared/messagehandler/RootMessageHandler.sys.mjs",
  WindowGlobalMessageHandler:
    "chrome://remote/content/shared/messagehandler/WindowGlobalMessageHandler.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "logger", () => lazy.Log.get());

/**
 * Map of MessageHandler type to MessageHandler subclass.
 */
ChromeUtils.defineLazyGetter(
  lazy,
  "MessageHandlerClasses",
  () =>
    new Map([
      [lazy.RootMessageHandler.type, lazy.RootMessageHandler],
      [lazy.WindowGlobalMessageHandler.type, lazy.WindowGlobalMessageHandler],
    ])
);

/**
 * Get the MessageHandler subclass corresponding to the provided type.

 * @param {string} type
 *     MessageHandler type, one of MessageHandler.type.
 * @returns {Class}
 *     A MessageHandler subclass
 * @throws {Error}
 *      Throws if no MessageHandler subclass is found for the provided type.
 */
export function getMessageHandlerClass(type) {
  if (!lazy.MessageHandlerClasses.has(type)) {
    throw new Error(`No MessageHandler class available for type "${type}"`);
  }
  return lazy.MessageHandlerClasses.get(type);
}

/**
 * The MessageHandlerRegistry allows to create and retrieve MessageHandler
 * instances for different MessageHandler networks.
 *
 * A MessageHandlerRegistry instance is bound to a specific MessageHandler type
 * and context. All MessageHandler instances created by the same registry will
 * use the type and context of the registry, but each will be associated to a
 * different internal session id.
 *
 * The registry is useful to retrieve the appropriate MessageHandler instance
 * after crossing a technical boundary (eg process, thread...).
 */
export class MessageHandlerRegistry extends EventEmitter {
  /**
   * @param {string} type
   *     MessageHandler type, one of MessageHandler.type.
   * @param {object} context
   *     The context object, which depends on the type.
   */
  constructor(type, context) {
    super();

    this._messageHandlerClass = getMessageHandlerClass(type);
    this._context = context;
    this._type = type;

    /**
     * Map of internal session id to MessageHandler instance
     */
    this._messageHandlersMap = new Map();

    this._onMessageHandlerDestroyed =
      this._onMessageHandlerDestroyed.bind(this);
    this._onMessageHandlerEvent = this._onMessageHandlerEvent.bind(this);
  }

  /**
   * Create all message handlers for the current context, based on the content
   * of the session data.
   * This should typically be called when the context is ready to be used and
   * to receive/send commands.
   */
  createAllMessageHandlers() {
    const data = lazy.readSessionData();
    for (const [internalSessionId, sessionDataItems] of data) {
      // Create a message handler for this context for each active
      // MessageHandler network.
      // TODO: In the future, to support debugging use cases we might want to
      // only create a message handler if there is relevant data.
      // For automation scenarios, this is less critical.
      this._createMessageHandler(internalSessionId, sessionDataItems);
    }
  }

  destroy() {
    this._messageHandlersMap.forEach(messageHandler => {
      messageHandler.destroy();
    });
  }

  /**
   * Retrieve all MessageHandler instances held in this registry, for all
   * internal session ids.
   *
   * @returns {Iterable.<MessageHandler>}
   *     Iterator of MessageHandler instances
   */
  getAllMessageHandlers() {
    return this._messageHandlersMap.values();
  }

  /**
   * Retrieve an existing MessageHandler instance matching the provided
   * internal session id. Returns null if no MessageHandler was found.
   *
   * @param {string} internalSessionId
   *     ID of the MessageHandler network the handler is part of.
   * @returns {MessageHandler=}
   *     A MessageHandler instance, null if not found.
   */
  getExistingMessageHandler(internalSessionId) {
    return this._messageHandlersMap.get(internalSessionId);
  }

  /**
   * Retrieve the MessageHandler instance registered for the provided internal
   * session id. Will create and register a MessageHander if no instance was
   * found.
   *
   * @param {string} internalSessionId
   *     ID of the MessageHandler network the handler is part of.
   * @returns {MessageHandler}
   *     A MessageHandler instance.
   */
  getOrCreateMessageHandler(internalSessionId) {
    let messageHandler = this.getExistingMessageHandler(internalSessionId);
    if (!messageHandler) {
      messageHandler = this._createMessageHandler(internalSessionId);
    }

    return messageHandler;
  }

  toString() {
    return `[object ${this.constructor.name}]`;
  }

  /**
   * Create a new MessageHandler instance.
   *
   * @param {string} internalSessionId
   *     ID of the MessageHandler network the handler will be part of.
   * @param {Array<SessionDataItem>=} sessionDataItems
   *     Optional array of session data items to be applied automatically to the
   *     MessageHandler.
   * @returns {MessageHandler}
   *     A new MessageHandler instance.
   */
  _createMessageHandler(internalSessionId, sessionDataItems) {
    const messageHandler = new this._messageHandlerClass(
      internalSessionId,
      this._context,
      this
    );

    messageHandler.on(
      "message-handler-destroyed",
      this._onMessageHandlerDestroyed
    );
    messageHandler.on("message-handler-event", this._onMessageHandlerEvent);

    messageHandler.initialize(sessionDataItems);

    this._messageHandlersMap.set(internalSessionId, messageHandler);

    lazy.logger.trace(
      `Created MessageHandler ${this._type} ${internalSessionId}`
    );

    return messageHandler;
  }

  // Event handlers

  _onMessageHandlerDestroyed(eventName, messageHandler) {
    messageHandler.off(
      "message-handler-destroyed",
      this._onMessageHandlerDestroyed
    );
    messageHandler.off("message-handler-event", this._onMessageHandlerEvent);
    this._messageHandlersMap.delete(messageHandler.internalSessionId);

    lazy.logger.trace(
      `Unregistered MessageHandler ${messageHandler.constructor.type} ${messageHandler.internalSessionId}`
    );
  }

  _onMessageHandlerEvent(eventName, messageHandlerEvent) {
    // The registry simply re-emits MessageHandler events so that consumers
    // don't have to attach listeners to individual MessageHandler instances.
    this.emit("message-handler-registry-event", messageHandlerEvent);
  }
}
