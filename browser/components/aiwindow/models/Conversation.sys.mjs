/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Message } from "moz-src:///browser/components/aiwindow/models/Message.sys.mjs";
import { compactMessages } from "moz-src:///browser/components/aiwindow/models/PromptOptimizer.sys.mjs";
import {
  consumeStreamChunk,
  createParserState,
  flushTokenRemainder,
} from "moz-src:///browser/components/aiwindow/models/TokenStreamParser.sys.mjs";

/**
 * @typedef {0 | 1 | 2 | 3} MessageRole
 */

/**
 * @enum {MessageRole}
 */
export const MESSAGE_ROLE = Object.freeze({
  USER: 0,
  ASSISTANT: 1,
  SYSTEM: 2,
  TOOL: 3,
});

const ROLE_LABEL = {
  [MESSAGE_ROLE.SYSTEM]: "system",
  [MESSAGE_ROLE.USER]: "user",
  [MESSAGE_ROLE.ASSISTANT]: "assistant",
  [MESSAGE_ROLE.TOOL]: "tool",
};

/**
 * Base conversation for any LLM-driven flow. Owns a `Message` list plus the
 * engine + parameters needed to call the model, and exposes `run()` /
 * `runWithGenerator()` against its own messages.
 *
 * The system prompt's RS-record version is stored on
 * `messages[0].content.version` at the moment `setSystemMessage()` is called
 * with a `{type, body, version}` object, and exposed via `systemPromptVersion`.
 */
export class Conversation {
  id;
  createdDate;
  updatedDate;
  feature;
  engine;
  parameters;

  /** @type {Message[]} */
  #messages = [];
  // Floor for the next assigned ordinal. Bumped on retry to ensure removed
  // ordinals are never reused. Underscore-prefixed (not `#`-private) so
  // subclasses can read it from their own overrides.
  _minNextOrdinal = 0;

  /**
   * @param {object} [params]
   * @param {string} [params.id]
   * @param {number} [params.createdDate]
   * @param {number} [params.updatedDate]
   * @param {Message[]} [params.messages]
   * @param {string} [params.feature]
   * @param {object} [params.engine]
   * @param {object} [params.parameters]
   */
  constructor({
    id = crypto.randomUUID(),
    createdDate = Date.now(),
    updatedDate = Date.now(),
    messages = [],
    feature = null,
    engine = null,
    parameters = null,
  } = {}) {
    this.id = id;
    this.createdDate = createdDate;
    this.updatedDate = updatedDate;
    this.#messages = messages;
    this.feature = feature;
    this.engine = engine;
    this.parameters = parameters ?? {};
  }

  set messages(value) {
    this.#messages = value;
  }

  get messages() {
    return this.#messages;
  }

  get messageCount() {
    return this.#messages.length;
  }

  /** True when the underlying engineInstance is initialized and ready to serve requests. */
  get isReady() {
    return this.engine?.engineInstance?.engineStatus === "ready";
  }

  /**
   * Highest turnIndex across messages. Subclasses use this to assign
   * monotonically increasing turnIndices to new messages.
   */
  currentTurnIndex() {
    return this.#messages.reduce(
      (turnIndex, message) => Math.max(turnIndex, message.turnIndex ?? 0),
      0
    );
  }

  /**
   * Reads the prompt version off the current system message — written there
   * by `setSystemMessage({type, body, version})`. Returns empty string if no
   * system message or no version field.
   */
  get systemPromptVersion() {
    const sysMsg = this.#messages.find(m => m.role === MESSAGE_ROLE.SYSTEM);
    return sysMsg?.content?.version ?? "";
  }

  /**
   * Appends a Message at the next ordinal.
   *
   * @param {number} role - MESSAGE_ROLE.*
   * @param {*} content
   * @param {number} turnIndex
   * @param {object} [opts]
   * @returns {Message}
   */
  addMessage(role, content, turnIndex, opts = {}) {
    let parentMessageId = null;
    if (this.#messages.length) {
      parentMessageId = this.#messages[this.#messages.length - 1].id;
    }

    const maxOrdinal = Math.max(
      this._minNextOrdinal,
      ...this.#messages.map(m => m.ordinal ?? 0)
    );
    const ordinal = maxOrdinal + 1;

    const newMessage = this._createMessage({
      role,
      content,
      ordinal,
      turnIndex,
      parentMessageId,
      ...opts,
    });
    this.#messages.push(newMessage);
    return newMessage;
  }

  _createMessage(args) {
    return new Message(args);
  }

  addUserMessage(content) {
    return this.addMessage(
      MESSAGE_ROLE.USER,
      content,
      this.currentTurnIndex() + 1
    );
  }

  addAssistantMessage(content, opts = {}) {
    let storedContent = content;
    if (opts.tool_calls) {
      storedContent =
        typeof content === "string"
          ? { body: content, tool_calls: opts.tool_calls }
          : { ...content, tool_calls: opts.tool_calls };
    }
    return this.addMessage(
      MESSAGE_ROLE.ASSISTANT,
      storedContent,
      this.currentTurnIndex(),
      opts
    );
  }

  /**
   * Idempotent upsert of the system message at index 0. Pass either a string
   * (will be wrapped as `{body: content}`) or a content object. The version is
   * captured on the message via the content object's `version` field — that's
   * what `systemPromptVersion` reads back.
   *
   * @param {string|object} content
   */
  setSystemMessage(content) {
    const wrapped = typeof content === "string" ? { body: content } : content;
    if (this.#messages[0]?.role === MESSAGE_ROLE.SYSTEM) {
      this.#messages[0].content = wrapped;
      return this.#messages[0];
    }
    const message = this._createMessage({
      role: MESSAGE_ROLE.SYSTEM,
      content: wrapped,
      ordinal: 0,
      turnIndex: 0,
      parentMessageId: null,
    });
    this.#messages.unshift(message);
    return message;
  }

  addToolMessage({ tool_call_id, content, name }) {
    return this.addMessage(
      MESSAGE_ROLE.TOOL,
      content,
      this.currentTurnIndex(),
      { toolCallId: tool_call_id, toolName: name }
    );
  }

  removeLastMessage() {
    return this.#messages.pop();
  }

  clearMessages() {
    this.#messages = [];
  }

  replaceMessages(messages) {
    this.#messages = messages;
  }

  /**
   * Generic retry: truncate from `message` to the end. Preserves the
   * next-ordinal floor so future messages never reuse one.
   *
   * @param {Message} message
   * @returns {Message[]} removed messages
   */
  retryMessage(message) {
    // Capture the current max ordinal before splicing so future addMessage
    // calls don't reuse ordinals from removed messages (ordinals must be
    // monotonically increasing across the conversation lifetime).
    this._minNextOrdinal = Math.max(
      this._minNextOrdinal,
      ...this.#messages.map(m => m.ordinal ?? 0)
    );
    const idx = this.#messages.findIndex(m => m.id === message.id);
    if (idx === -1) {
      return [];
    }
    return this.#messages.splice(idx);
  }

  /** Returns a compacted chat-completions wire-format snapshot. */
  compactChatCompletions() {
    return compactMessages(this.getMessagesInChatCompletionsFormat());
  }

  /**
   * Snapshot in the OpenAI chat-completions API shape.
   *
   * @returns {object[]}
   */
  getMessagesInChatCompletionsFormat() {
    return this.#messages.map(message => {
      const role = ROLE_LABEL[message.role] ?? message.role;
      const bodyOrContent = message.content?.body ?? message.content;
      const msg = { role, content: bodyOrContent };

      if (
        bodyOrContent &&
        typeof bodyOrContent === "object" &&
        bodyOrContent.tool_calls
      ) {
        msg.tool_calls = bodyOrContent.tool_calls;
        msg.content = "";
      }

      if (msg.role === "tool") {
        msg.tool_call_id =
          message.toolCallId ?? message.content?.tool_call_id ?? null;
        if (message.toolName ?? message.content?.name) {
          msg.name = message.toolName ?? message.content?.name;
        }
        msg.content = JSON.stringify(message.content?.body ?? message.content);
      }
      return msg;
    });
  }

  /**
   * Process one chunk of streaming output: parse, append plain text to the
   * current message body, hand off any tokens to the message's `addTokens`
   * method when present.
   *
   * @param {string} chunk - Raw text chunk from the model stream.
   * @param {Message} currentMessage - Message receiving the body / tokens.
   * @param {object} parserState - State returned by `createParserState()`, threaded across chunks.
   * @returns {boolean} True if anything was extracted (text or tokens).
   */
  handleChunk(chunk, currentMessage, parserState) {
    const { plainText, tokens } = consumeStreamChunk(chunk, parserState);

    if (plainText && currentMessage?.content) {
      currentMessage.content.body =
        (currentMessage.content.body ?? "") + plainText;
    }

    if (tokens) {
      currentMessage?.addTokens(tokens);
    }

    return Boolean(plainText) || Boolean(tokens);
  }

  /**
   * Drain the stream: loop chunks, flush remainder.
   *
   * @param {AsyncIterable} stream
   * @param {Message} currentMessage
   * @returns {Promise<{pendingToolCalls, fullResponseText, usage, currentMessage}>}
   */
  async receiveResponse(stream, currentMessage) {
    const parserState = createParserState();
    let pendingToolCalls = null;
    let fullResponseText = "";
    let usage = null;

    for await (const chunk of stream) {
      usage = chunk?.usage;
      if (chunk.text) {
        fullResponseText += chunk.text;
        this.handleChunk(chunk.text, currentMessage, parserState);
      }
      if (chunk?.toolCalls?.length) {
        pendingToolCalls = chunk.toolCalls;
      }
    }

    const remainder = flushTokenRemainder(parserState);
    if (remainder && currentMessage?.content) {
      currentMessage.content.body =
        (currentMessage.content.body ?? "") + remainder;
    }

    return { pendingToolCalls, fullResponseText, usage, currentMessage };
  }

  /**
   * Execute one LLM call against this conversation's messages + parameters.
   *
   * @param {object} opts - { fxAccountToken, responseFormat?, signal?, ... }
   * @returns {Promise<object>}
   */
  async run(opts = {}) {
    return this.engine.run({
      ...this.parameters,
      args: this.getMessagesInChatCompletionsFormat(),
      ...opts,
    });
  }

  /**
   * Streaming variant — returns an AsyncGenerator.
   *
   * @param {object} opts - { fxAccountToken, signal?, chatId?, tools?, tool_choice?, streamOptions?, args? }
   * @returns {AsyncGenerator}
   */
  runWithGenerator(opts = {}) {
    return this.engine.runWithGenerator({
      ...this.parameters,
      args: this.getMessagesInChatCompletionsFormat(),
      ...opts,
    });
  }

  toJSON() {
    return {
      id: this.id,
      createdDate: this.createdDate,
      updatedDate: this.updatedDate,
      feature: this.feature,
      messages: this.#messages,
    };
  }
}
