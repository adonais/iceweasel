/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Generic LLM message — a single turn in a Conversation. Holds the wire-shape
 * fields any consumer needs (role, content, ordinal, turnIndex) plus
 * lightweight metadata for replay/telemetry (id, createdDate, parentMessageId,
 * modelId, params, usage). Tool-call linkage (toolCallId, toolName) lives here
 * too so the base can serialize tool messages in the OpenAI chat-completions
 * format.
 */
export class Message {
  id;
  createdDate;
  ordinal;
  role;
  content;
  turnIndex;
  parentMessageId;
  modelId;
  params;
  usage;
  toolCallId;
  toolName;

  /**
   * @param {object} param
   * @param {number} param.ordinal
   * @param {string} param.role
   * @param {*} param.content
   * @param {number} param.turnIndex
   * @param {string} [param.id]
   * @param {number} [param.createdDate]
   * @param {?string} [param.parentMessageId]
   * @param {?string} [param.modelId]
   * @param {?object} [param.params]
   * @param {?object} [param.usage]
   * @param {?string} [param.toolCallId]
   * @param {?string} [param.toolName]
   */
  constructor({
    ordinal,
    role,
    content,
    turnIndex,
    id = crypto.randomUUID(),
    createdDate = Date.now(),
    parentMessageId = null,
    modelId = null,
    params = null,
    usage = null,
    toolCallId = null,
    toolName = null,
  } = {}) {
    this.id = id;
    this.createdDate = createdDate;
    this.ordinal = ordinal;
    this.role = role;
    this.content = content;
    this.turnIndex = turnIndex;
    this.parentMessageId = parentMessageId;
    this.modelId = modelId;
    this.params = params;
    this.usage = usage;
    this.toolCallId = toolCallId;
    this.toolName = toolName;
  }

  /**
   * Hook for token-stream side effects (e.g., URL/search/memory tokens parsed
   * out of the model output). Base does nothing; chat overrides on ChatMessage.
   *
   * @param {object} _tokens
   */
  // eslint-disable-next-line no-unused-vars
  addTokens(_tokens) {}
}
