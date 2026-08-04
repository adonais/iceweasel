/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  MODEL_FEATURES,
  renderPrompt,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";

import {
  constructRelevantMemoriesContextMessage,
  constructRealTimeInfoInjectionMessage,
  replaceUrlsWithTokens,
  resolveMentionUrls,
  sanitizeUntrustedContent,
  stripUnresolvedUrlTokens,
} from "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs";

import { getRoleLabel } from "./ChatUtils.sys.mjs";
import {
  CONVERSATION_STATUS,
  MESSAGE_ROLE,
  SYSTEM_PROMPT_TYPE,
} from "./AIWindowConstants.sys.mjs";
import {
  AssistantRoleOpts,
  ChatMessage,
  ToolRoleOpts,
  UserRoleOpts,
} from "./ChatMessage.sys.mjs";

import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";
import { Conversation } from "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs";
import { consumeStreamChunk } from "moz-src:///browser/components/aiwindow/models/TokenStreamParser.sys.mjs";
import { SecurityProperties } from "moz-src:///browser/components/aiwindow/models/SecurityProperties.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  convertTimestamp: "chrome://browser/content/firefoxview/helpers.mjs",
  ChatStore:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs",
  MemoriesManager:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs",
  loadPrompt:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  ToolUI: "moz-src:///browser/components/aiwindow/ui/modules/ToolUI.sys.mjs",
  UI_TYPES: "moz-src:///browser/components/aiwindow/ui/modules/ToolUI.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "fluentStrings", () => {
  return new Localization(["browser/firefoxView.ftl"], true);
});

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({
    prefix: "ChatConversation",
  });
});

const CHAT_ROLES = [MESSAGE_ROLE.USER, MESSAGE_ROLE.ASSISTANT];
const RESTORABLE_ROLES = [...CHAT_ROLES, MESSAGE_ROLE.TOOL];

let _savedLoadPromptDescriptor = null;
export function _setLoadPromptForTesting(fn) {
  if (fn !== null) {
    _savedLoadPromptDescriptor = Object.getOwnPropertyDescriptor(
      lazy,
      "loadPrompt"
    );
    lazy.loadPrompt = async (...args) => {
      const result = await fn(...args);
      return typeof result === "string"
        ? { prompt: result, version: "" }
        : result;
    };
  } else if (_savedLoadPromptDescriptor) {
    // eslint-disable-next-line mozilla/valid-lazy
    Object.defineProperty(lazy, "loadPrompt", _savedLoadPromptDescriptor);
    _savedLoadPromptDescriptor = null;
  }
}

/**
 * A chat conversation. Adds chat orchestration (security tracking, URL
 * tokens, branching, realtime + memory injection, system prompt loading)
 * and chat UI (event emits, render filtering, tool UI state) on top of the
 * generic Conversation base.
 */
export class ChatConversation extends Conversation {
  title;
  description;
  pageUrl;
  pageMeta;
  status;
  /** @type {SecurityProperties} */
  securityProperties;
  activeBranchTipMessageId;

  #emitter = new EventEmitter();

  /**
   * Transient (not persisted): the submit_type of the most recent user
   * submission, used to send telemetry to later tool-result events.
   *
   * @type {?string}
   */
  lastSubmitType = null;

  /**
   * Transient (not persisted): cached action_type categorization
   * ("tab_mention", "description", "unsupported") of the most recent browser
   * action request, used to send telemetry to later tool-result events.
   *
   * @type {?string}
   */
  lastBrowserActionType = null;

  /**
   * A mapping of a URL to its unique URL token. URL tokens are used as shortened
   * versions of URLs to help the model deal with very long URLs. Very long URLs are
   * problematic since they are hard for a model to repeat back without making mistakes
   * or hallucinating details about the URL. There is also additional cost for every
   * additional token in the context. Long URLs can also contain prompt injections since
   * they can be of an arbitrary size. URL Tokens help solve all of these issues.
   *
   * URL tokens are only generated while a message is "in flight" to and from the language
   * model. When tool calls are handled, messages rendered, and messages stored they are
   * all done with the URL tokens expanded into full URLs.
   *
   * There are no guarantees that a URL in this list isn't just hallucinated by the model.
   * Any URL the language model invents can be present in this list. The only guarantee
   * is that a token maps to some kind of arbitrary URL.
   *
   * Example mapping:
   * https://github.com/mozilla/ -> GITHUB_COM_MOZILLA_1
   *
   * @type {Map<string, string>}
   */
  urlToToken = new Map();

  /**
   * The reverse mapping for a token back to its original URL.
   *
   * e.g. GITHUB_COM_MOZILLA_1 -> https://github.com/mozilla/
   *
   * @type {Map<string, string>}
   */
  tokenToUrl = new Map();

  /**
   * A mapping of the base URL token to how many counts there are for it. It's
   * used to generate the final number on URL tokens.
   *
   * e.g.
   *
   * https://github.com/mozilla/                  -> GITHUB_COM_MOZILLA_1
   * https://github.com/mozilla#not-part-of-token -> GITHUB_COM_MOZILLA_2
   *
   * @type {Map<string, number>}
   */
  #baseTokenCounts = new Map();

  /**
   * Language models can generate arbitrary URLs. If a conversation has been exposed
   * to untrusted content (such as from summarizing a webpage) then it can be prompt
   * injected to display arbitrary URLs. Language models can also invent plausible URLs
   * for a conversation that do not exist.
   *
   * To mitigate these issues we collect all URLs that have been seen in a conversation
   * so that we can decide how to show them to users in a safe way. If a URL has not
   * been seen before, then it's untrusted in different circumstances.
   *
   * Initialized from the constructor params (restored from DB) or as an empty Set.
   *
   * @type {Set<string>}
   */
  seenUrls;

  /**
   * URLs found in SERP contents from run_search that we are willing to
   * fetch via a anonymous request even when the conversation has
   * been exposed to both private and untrusted content.
   *
   * Initialized from the constructor params (restored from DB) or as an empty Set.
   *
   * @type {Set<string>}
   */
  serpUrlsForAnonymousFetch;

  /**
   * Conversation-level pool of history results keyed by URL, accumulated across
   * every `search_browsing_history` invocation in this conversation. A message
   * snapshots this pool when it completes (see `receiveResponse`), so any
   * assistant message that lists previously-searched URLs renders a history
   * grid — even when the model answered a follow-up from prior results without
   * re-invoking the tool. Not persisted to the database.
   *
   * @type {Map<string, object>}
   */
  #historyResultsPool = new Map();

  /**
   * Dispatcher that forwards the history results pool to the
   * content page. Injected by the owner (ai-window). Called from
   * `addHistoryResults` during tool execution; actor delivers
   * the pool to content before the follow-up answer streams.
   *
   * @type {?function(object): void}
   */
  #historyResultsDispatcher = null;

  /**
   * @param {object} params
   * @param {string} [params.id]
   * @param {string} params.title
   * @param {string} params.description
   * @param {URL} params.pageUrl
   * @param {object} params.pageMeta
   * @param {number} [params.createdDate]
   * @param {number} [params.updatedDate]
   * @param {CONVERSATION_STATUS} [params.status]
   * @param {Array<ChatMessage>} [params.messages]
   * @param {boolean|null} [params.memoriesToggled]
   */
  constructor(params) {
    const {
      id = crypto.randomUUID(),
      title,
      description,
      pageUrl,
      pageMeta,
      createdDate = Date.now(),
      updatedDate = Date.now(),
      messages = [],
      seenUrls,
      serpUrlsForAnonymousFetch,
      memoriesToggled = null,
    } = params;

    super({ id, createdDate, updatedDate, messages, feature: "chat" });

    this.title = title;
    this.description = description;
    this.pageUrl = pageUrl;
    this.pageMeta = pageMeta;
    this.seenUrls = seenUrls ? new Set(seenUrls) : new Set();
    this.serpUrlsForAnonymousFetch = serpUrlsForAnonymousFetch
      ? new Set(serpUrlsForAnonymousFetch)
      : new Set();
    this.memoriesToggled = memoriesToggled;

    // transient: tracks the URL the current starter prompts were generated
    // for. Not persisted, only used while conversation is empty.
    this.transientStarterUrl = null;

    // transient: caches the last set of starter prompts generated for this
    // conversation so a tab switch-back can restore without re-fetching.
    // Not persisted, only meaningful while the conversation is empty.
    this.transientStarters = null;

    // transient: stores information about a cancelled confirmation dialog
    // that can be retried. Set when a website confirmation is auto-cancelled
    // due to a new user prompt. Not persisted.
    this.pendingRetry = null;

    // NOTE: Destructuring params.status causes a linter error
    this.status = params.status || CONVERSATION_STATUS.ACTIVE;
    if (params.securityProperties instanceof SecurityProperties) {
      this.securityProperties = params.securityProperties;
    } else if (params.securityProperties != null) {
      this.securityProperties = SecurityProperties.fromJSON(
        params.securityProperties
      );
    } else {
      this.securityProperties = new SecurityProperties();
    }

    // Seed the branch-tip cache so restored-from-DB conversations have it
    // set before the first turn.
    if (messages.length) {
      this.#updateActiveBranchTipMessageId();
    }
  }

  on(...args) {
    return this.#emitter.on(...args);
  }
  off(...args) {
    return this.#emitter.off(...args);
  }
  emit(...args) {
    return this.#emitter.emit(...args);
  }

  /**
   * Converts a URL into a token. It first computes a base token from
   * the hostname and path parts, then appends a monotonically increasing number on the
   * end to make it unique. This token is cached to the conversation while
   * the conversation is loaded in memory. This token is in-memory only and not
   * serialized to storage.
   *
   * URL token analysis:
   * https://docs.google.com/document/d/1kwf2PH1APyUR4wrvv6lJIhA12bkQoNVV5KFwAPtWubw/edit?tab=t.0#heading=h.yhx5pggnwgne
   *
   * @param {string} url - The full URL to register
   * @returns {string} The short token for the URL (e.g. "GITHUB_COM_1")
   */
  convertUrlToToken(url) {
    const seenToken = this.urlToToken.get(url);
    if (seenToken) {
      return seenToken;
    }

    let baseToken = "";

    // Attempt to convert the URL into a base token.
    const parsedUrl = URL.parse(url);
    if (parsedUrl) {
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        // Go ahead and handle URL tokens for more complicated URLs that
        // aren't probably supported in the chat interface, but would be useful
        // to disambiguate from the HTTP(s) varieties.
        baseToken +=
          // e.g. "ftp:" -> "FTP"
          parsedUrl.protocol.toUpperCase().replace(":", "");
      }

      // Convert the hostname into a token.
      const hostToken = parsedUrl.hostname
        .replace(/^www\./, "")
        .toUpperCase()
        .replace(/[.\-]/g, "_")
        .substring(0, 100);

      if (hostToken) {
        baseToken = baseToken ? `${baseToken}_${hostToken}` : hostToken;
      }

      // Add on the parts of the URL to the token.
      for (let part of parsedUrl.pathname.split("/")) {
        if (!part) {
          continue;
        }
        const partToken = part.toUpperCase().replace(/[^A-Z0-9]/g, "_");

        const nextToken = `${baseToken}_${partToken}`;
        if (nextToken.length > 100) {
          break;
        }
        baseToken = nextToken;
      }
    } else {
      baseToken = "INVALID_URL";
    }

    let count = this.#baseTokenCounts.get(baseToken) ?? 0;
    count += 1;
    this.#baseTokenCounts.set(baseToken, count);

    const tokenFinal = `${baseToken}_${count}`;

    this.urlToToken.set(url, tokenFinal);
    this.tokenToUrl.set(tokenFinal, url);

    return tokenFinal;
  }

  /**
   * @param {string} chunk - Raw text chunk from the model stream.
   * @param {ChatMessage} currentMessage - Message receiving the body / tokens.
   * @param {object} parserState - State returned by `createParserState()`, threaded across chunks.
   */
  handleChunk(chunk, currentMessage, parserState) {
    const { plainText, tokens } = consumeStreamChunk(
      chunk,
      parserState,
      this.tokenToUrl
    );

    if (plainText && currentMessage?.content) {
      currentMessage.content.body =
        (currentMessage.content.body ?? "") + plainText;
    }
    if (tokens) {
      currentMessage?.addTokens(tokens);
    }
    if (plainText || tokens) {
      this.emit("chat-conversation:message-update", currentMessage);
      lazy.ChatStore.updateConversation(this);
    }
  }

  /**
   * @param {AsyncIterable} stream - Model response stream from `runWithGenerator`.
   */
  async receiveResponse(stream) {
    const currentMessage = this.#getCurrentAssistantResponse();

    if (currentMessage?.content?.body) {
      currentMessage.content.body += "\n\n";
    }

    const result = await super.receiveResponse(stream, currentMessage);

    if (result.currentMessage?.content?.body) {
      this.emit("chat-conversation:message-update", result.currentMessage);
    }

    if (currentMessage?.memoriesApplied?.length) {
      currentMessage.memoriesApplied =
        await lazy.MemoriesManager.getMemoriesByID(
          new Set(currentMessage.memoriesApplied)
        );

      this.emit("chat-conversation:message-update", currentMessage);
    }

    // Expand URL tokens and remove any hallucinated ones.
    if (this.urlToToken.size && currentMessage?.content?.body) {
      let body = stripUnresolvedUrlTokens(currentMessage.content.body);
      if (body !== currentMessage.content.body) {
        currentMessage.content.body = body;
        this.emit("chat-conversation:message-update", currentMessage);
      }
    }

    await lazy.ChatStore.updateConversation(this);

    // Only finalize the message when the turn is actually done. When the model
    // requested tool calls, the same assistant message keeps streaming its
    // answer after the tools run (see the loop in Chat.sys.mjs), so emitting
    // completion here would mark a still-streaming message complete mid-turn —
    // e.g. converting a streamed history list into a grid before the answer
    // finishes.
    if (!result.pendingToolCalls?.length) {
      this.emit("chat-conversation:message-complete", currentMessage);
    }

    return {
      pendingToolCalls: result.pendingToolCalls,
      fullResponseText: result.fullResponseText,
      usage: result.usage,
    };
  }

  #getCurrentAssistantResponse() {
    return this.messages
      .filter(
        message =>
          message.role === MESSAGE_ROLE.ASSISTANT &&
          message?.content?.type === "text"
      )
      .at(-1);
  }

  /**
   * Returns a filtered messages array consisting only of the messages
   * that are meant to be rendered as the chat conversation.
   *
   * @returns {Array<ChatMessage>}
   */
  renderState() {
    return this.messages.filter(message => {
      const { role, content } = message;
      if (!RESTORABLE_ROLES.includes(role)) {
        return false;
      }
      const { type, body } = content ?? {};
      if (type === "function") {
        return false;
      }
      if (type === "text" && !body) {
        return false;
      }
      return true;
    });
  }

  _createMessage(args) {
    return new ChatMessage({ ...args, convId: this.id });
  }

  /**
   * Gets any URL mentioned in the conversation. These URLs have heightened security
   * permissions as they have been explicitly added to the conversation by the user.
   *
   * @returns {Set<string>}
   */
  getAllMentionURLs() {
    /** @type {Set<string>} */
    const mentionUrls = new Set();
    for (const message of this.messages) {
      const { contextMentions } = message.content;
      if (contextMentions) {
        for (const { url } of contextMentions) {
          mentionUrls.add(url);
        }
      }
    }
    return mentionUrls;
  }

  /**
   * Add a user message to the conversation
   *
   * @todo Bug 2005424
   * Limit/filter out data uris from message data
   *
   * @param {string} contentBody - The user message content
   * @param {URL?} [pageUrl=null] - The current page url when message was submitted
   * @param {UserRoleOpts} [userOpts=new UserRoleOpts()] - User message options
   * @param {object} [userContext={}] - Contextual information for the user message, such as real time info and relevant memories
   * @returns {ChatMessage} The newly created user message
   */
  addUserMessage(
    contentBody,
    pageUrl = null,
    userOpts = new UserRoleOpts(),
    userContext = {}
  ) {
    const content = {
      type: "text",
      body: contentBody,
      userContext,
    };

    if (userOpts.contextMentions?.length) {
      content.contextMentions = userOpts.contextMentions;
    }

    if (pageUrl) {
      content.contextPageUrl = pageUrl.href;
    }

    let currentTurn = this.currentTurnIndex();
    const newTurnIndex =
      this.messages.length === 1 ? currentTurn : currentTurn + 1;

    this.#dismissPendingUndos();

    return this.addMessage(MESSAGE_ROLE.USER, content, newTurnIndex, {
      pageUrl,
      ...userOpts,
    });
  }

  /**
   * Resolves the pending tool-confirmation message for UI actions.
   * Called by ToolUI when the user confirms or cancels via the UI.
   *
   * @param {object} outcomeBody - The new body for the tool message.
   * @param {string} toolCallId - Only resolve when the message's tool_call_id matches.
   * @returns {boolean} True if a pending message was resolved.
   */
  resolvePendingToolConfirmation(outcomeBody, toolCallId) {
    const message = this.messages.at(-1);

    const isResolvableToolMessage =
      message?.role === MESSAGE_ROLE.TOOL &&
      message.content?.tool_call_id === toolCallId &&
      message.content?.body?.pending;

    if (!isResolvableToolMessage) {
      return false;
    }

    message.content = { ...message.content, body: outcomeBody };
    this.emit("chat-conversation:message-update", message);
    lazy.ChatStore.updateConversation(this).catch(e => {
      lazy.console.error("Failed to persist resolved tool confirmation", e);
    });
    return true;
  }

  /**
   * Mark the most recent ai-action-result toolUIData with
   * properties.undoDismissed: true. Called when a user message
   * is added, signalling the previous action is no longer available.
   *
   * At most one card is non-dismissed at any time, so walk back
   * and stop on first hit.
   *
   * Persistence: emit triggers re-render. The toolUIData mutation
   * is persisted on the next ChatStore.updateConversation call
   * which fires when the assistant turn that follows completes.
   */
  #dismissPendingUndos() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      const td = m.toolUIData;
      if (
        !td ||
        td.uiType !== "ai-action-result" ||
        td.properties?.undoDismissed
      ) {
        continue;
      }

      const operationId = td.properties?.confirmedData?.operationId;
      if (!operationId) {
        continue;
      }

      m.toolUIData = {
        ...td,
        properties: { ...td.properties, undoDismissed: true },
      };
      this.emit("chat-conversation:message-update", m);
      break;
    }
  }

  /**
   * Add an assistant message to the conversation
   *
   * @param {string} type - The assistant message type: text|function
   * @param {string} contentBody - The assistant message content
   * @param {AssistantRoleOpts} [assistantOpts=new AssistantRoleOpts()] - ChatMessage options specific to assistant messages
   * @returns {ChatMessage} The newly created assistant message
   */
  addAssistantMessage(
    type,
    contentBody,
    assistantOpts = new AssistantRoleOpts()
  ) {
    if (assistantOpts.modelId == null) {
      assistantOpts.modelId = this.engine?.model ?? null;
    }
    const content = {
      type,
      body: contentBody,
    };

    return this.addMessage(
      MESSAGE_ROLE.ASSISTANT,
      content,
      this.currentTurnIndex(),
      assistantOpts
    );
  }

  /**
   * Add a tool call message to the conversation
   *
   * @param {object} content - The tool call object to be saved as JSON
   * @param {ToolRoleOpts} [toolOpts=new ToolRoleOpts()] - Message opts for a tool role message
   * @returns {ChatMessage} The newly created tool message
   */
  addToolCallMessage(content, toolOpts = new ToolRoleOpts()) {
    if (toolOpts.modelId == null) {
      toolOpts.modelId = this.engine?.model ?? null;
    }
    const message = this.addMessage(
      MESSAGE_ROLE.TOOL,
      content,
      this.currentTurnIndex(),
      toolOpts
    );
    // Emit tool messages so the renderer can display them
    // in the action log
    if (message) {
      this.emit("chat-conversation:message-update", message);
    }
    return message;
  }

  /**
   * Add a system message to the conversation
   *
   * @param {string} type - The assistant message type: text|injected_memories|injected_real_time_info
   * @param {string} contentBody - The system message object to be saved as JSON
   * @param {string} [version] - Prompt version for SYSTEM_PROMPT_TYPE.TEXT messages
   * @returns {ChatMessage} The newly created system message
   */
  addSystemMessage(type, contentBody, version) {
    const content = { type, body: contentBody, ...(version && { version }) };

    return this.addMessage(
      MESSAGE_ROLE.SYSTEM,
      content,
      this.currentTurnIndex()
    );
  }

  /**
   * Idempotent upsert of the chat system prompt at index 0. Writes the
   * rendered body and the RS-record version onto the system message's
   * `content`.
   *
   * @param {object} [opts]
   * @param {string} [opts.modelChoiceIdOverride]
   */
  async loadSystemPrompt(opts = {}) {
    const { prompt: body, version } = await lazy.loadPrompt(
      MODEL_FEATURES.CHAT,
      opts
    );

    const existing = this.messages.find(
      message =>
        message.role === MESSAGE_ROLE.SYSTEM &&
        message.content?.type === SYSTEM_PROMPT_TYPE.TEXT
    );
    if (existing) {
      existing.content.body = body;
      existing.content.version = version;
      return existing;
    }

    return this.addSystemMessage(SYSTEM_PROMPT_TYPE.TEXT, body, version);
  }

  /**
   * Takes a new prompt and generates LLM context messages before
   * adding new user prompt to messages.
   *
   * @param {string} prompt - new user prompt
   * @param {?URL} pageUrl - The URL of the page when prompt was submitted
   * @param {UserRoleOpts} [userOpts]
   * @param {boolean} [skipUserDispatch=false] - If true, do not emit the
   *   message-update event after adding the user message (used for retries
   *   to avoid duplicate user messages in the child process).
   */
  async generatePrompt(
    prompt,
    pageUrl,
    userOpts = undefined,
    skipUserDispatch = false
  ) {
    if (!this.messages.length) {
      await this.loadSystemPrompt();
    }

    // userContext starts empty so the user message can be added and dispatched
    // immediately for better perceived performance. The realTimeContext and
    // memoriesContext properties are set on it by reference below before this
    // method returns, so the full context is available to
    // getMessagesInChatCompletionsFormat() when the LLM call is made.
    let userContext = {};
    const userMessage = this.addUserMessage(
      prompt,
      pageUrl,
      userOpts,
      userContext
    );
    if (!skipUserDispatch) {
      this.emit("chat-conversation:message-update", userMessage);
    }

    await this.injectRealTimeContext(userMessage, {
      contextMentions: userOpts?.contextMentions,
    });

    if (userOpts?.memoriesEnabled) {
      try {
        await this.injectMemoriesContext(userMessage, prompt);
      } catch (memoriesContextError) {
        lazy.console.error(
          `Failed to generate memories context message: ${memoriesContextError}`
        );
      }
    }

    this.securityProperties.commit();
    return this;
  }

  /**
   * Removes the given user message and all messages after it from the
   * in-memory conversation, filtering out ephemeral system messages and
   * preserving the highest ordinal so future messages never reuse one.
   * The caller is responsible for deleting the returned messages from
   * the database and re-generating the response.
   *
   * TODO: Bug 2016249 - Rename to something like truncateFromMessage() and
   * consider moving the chatStore.deleteMessages() call into this method.
   *
   * @param {ChatMessage} message
   *
   * @returns {Array<ChatMessage>} - Array of messages removed from the conversation
   */
  async retryMessage(message) {
    if (message.role !== MESSAGE_ROLE.USER) {
      const err = new Error("Not a user message");
      err.clientReason = "retryInvalidMessage";
      throw err;
    }

    const removed = super.retryMessage(message);
    if (!removed.length) {
      const err = new Error("Unrelated message");
      err.clientReason = "retryInvalidMessage";
      throw err;
    }
    // splice() bypasses our setter; refresh branch-tip manually.
    this.#updateActiveBranchTipMessageId();
    return removed;
  }

  /**
   * Fetch real-time browser/tab data, render the prompt, mutate
   * `userMessage.content.userContext.realTimeContext` in place.
   *
   * @param {ChatMessage} userMessage
   * @param {object} [opts]
   * @param {ContextWebsite[]} [opts.contextMentions]
   * @param {Function} [opts.getRealTimeMapping]
   */
  async injectRealTimeContext(userMessage, opts = {}) {
    const {
      contextMentions,
      getRealTimeMapping = constructRealTimeInfoInjectionMessage,
    } = opts;
    const realTimeInfoMapping = await getRealTimeMapping(contextMentions);
    if (!realTimeInfoMapping) {
      return;
    }
    let { prompt: realTimePromptRaw } = await lazy.loadPrompt(
      MODEL_FEATURES.REAL_TIME_CONTEXT_DATE
    );
    if (realTimeInfoMapping.hasTabInfo) {
      this.securityProperties.setPrivateData();
      const { prompt: realTimeTabPromptRaw } = await lazy.loadPrompt(
        MODEL_FEATURES.REAL_TIME_CONTEXT_TAB
      );
      realTimePromptRaw += realTimeTabPromptRaw;
    } else {
      delete realTimeInfoMapping.url;
      delete realTimeInfoMapping.title;
      delete realTimeInfoMapping.description;
    }
    delete realTimeInfoMapping.hasTabInfo;

    if (contextMentions?.length) {
      const contextUrls = contextMentions
        .map(
          mention =>
            `- URL: ${mention.url}\n  Title: ${sanitizeUntrustedContent(mention.label)}`
        )
        .join("\n");
      realTimeInfoMapping.contextUrls = contextUrls;
      const { prompt: contextMentionsPrompt } = await lazy.loadPrompt(
        MODEL_FEATURES.REAL_TIME_CONTEXT_MENTIONS
      );
      realTimePromptRaw += contextMentionsPrompt;
    }

    const realTimePrompt = renderPrompt(realTimePromptRaw, realTimeInfoMapping);
    if (realTimePrompt && userMessage?.content) {
      userMessage.content.userContext ??= {};
      userMessage.content.userContext.realTimeContext = realTimePrompt;
    }
  }

  /**
   * Fetch relevant memories, mutate
   * `userMessage.content.userContext.memoriesContext` in place.
   *
   * @todo Bug2009434 Rename type and change enum to renamed values
   * @param {ChatMessage} userMessage
   * @param {string} prompt
   * @param {Function} [constructMemories]
   */
  async injectMemoriesContext(
    userMessage,
    prompt,
    constructMemories = constructRelevantMemoriesContextMessage
  ) {
    const memoriesContext = await constructMemories(prompt);
    if (memoriesContext == null) {
      return;
    }
    this.securityProperties.setPrivateData();
    if (userMessage?.content) {
      userMessage.content.userContext ??= {};
      userMessage.content.userContext.memoriesContext = memoriesContext.content;
    }
  }

  /**
   * Retrieves the list of visited sites during a conversation in visited order.
   * Primarily used to retrieve external URLs that the user had a conversation
   * around to display in Chat History view.
   *
   * @param {boolean} [includeInternal=false] - Whether to include internal Firefox URLs
   *
   * @returns {Array<URL>} - Ordered list of visited page URLs for this conversation
   */
  getSitesList(includeInternal = false) {
    const seen = new Set();
    const deduped = [];

    this.messages.forEach(message => {
      if (!message.pageUrl) {
        return;
      }

      if (!includeInternal && !message.pageUrl.protocol.startsWith("http")) {
        return;
      }

      if (!seen.has(message.pageUrl.href)) {
        seen.add(message.pageUrl.href);
        deduped.push(message.pageUrl);
      }
    });

    return deduped;
  }

  /**
   * Returns the most recently visited external sites during this conversation, or null
   * if no external sites have been visited.
   *
   * @returns {URL|null}
   */
  getMostRecentPageVisited() {
    const sites = this.getSitesList();

    return sites.length ? sites.pop() : null;
  }

  /**
   * Chat wire-format snapshot: filters out empty-body assistant messages,
   * walks message → wire shape, then injects realTime/memories `userContext`
   * as USER messages just before the last user message.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.applyUrlTokens=true]
   * @returns {object[]}
   */
  getMessagesInChatCompletionsFormat({ applyUrlTokens = true } = {}) {
    const isWireFiltered = m =>
      // Empty-body assistant placeholders, added pre-stream to receive the
      // response body. Drop until the stream fills them in.
      (m.role === MESSAGE_ROLE.ASSISTANT && !m?.content?.body) ||
      // Legacy ephemeral SYSTEM-role realtime/memories messages persisted from
      // pre-refactor conversations. Post-refactor injects these via the new
      // userContext field on the user message; drop the old SYSTEM rows so the
      // LLM doesn't see them twice.
      (m.role === MESSAGE_ROLE.SYSTEM &&
        (m?.content?.type === SYSTEM_PROMPT_TYPE.REAL_TIME ||
          m?.content?.type === SYSTEM_PROMPT_TYPE.MEMORIES));

    // Base wire-format snapshot, then drop filtered messages. Mirror the same
    // filter on `this.messages` so indices stay aligned for userContext injection.
    const baseWire = super.getMessagesInChatCompletionsFormat();
    const filteredSrc = this.messages.filter(m => !isWireFiltered(m));
    const msgsForAPI = baseWire.filter(
      (_, i) => !isWireFiltered(this.messages[i])
    );

    // Resolve inline `@mention`s on USER messages so the model receives a
    // fetchable URL.
    for (const msg of msgsForAPI) {
      if (msg.role === getRoleLabel(MESSAGE_ROLE.USER).toLowerCase()) {
        msg.content = resolveMentionUrls(msg.content);
      }
    }

    // Inject contextual user-context messages just before the last user
    // message, as USER-role messages.
    const lastUserMsgIdx = filteredSrc.findLastIndex(
      msg => msg.role == MESSAGE_ROLE.USER
    );
    if (lastUserMsgIdx > -1) {
      const userContext = filteredSrc[lastUserMsgIdx].content.userContext;
      if (userContext) {
        const contextMsgs = Object.values(userContext).map(contextMsg => ({
          role: getRoleLabel(MESSAGE_ROLE.USER).toLowerCase(),
          content: contextMsg,
        }));
        msgsForAPI.splice(lastUserMsgIdx, 0, ...contextMsgs);
      }
    }

    if (applyUrlTokens) {
      replaceUrlsWithTokens(this, msgsForAPI);
    }

    return msgsForAPI;
  }

  #updateActiveBranchTipMessageId() {
    this.activeBranchTipMessageId = this.messages
      .filter(m => m.isActiveBranch)
      .sort((a, b) => b.ordinal - a.ordinal)
      .shift()?.id;
  }

  set messages(value) {
    // super to avoid recursion into our own setter; the base setter writes #messages.
    super.messages = value;
    this.#updateActiveBranchTipMessageId();
  }

  get messages() {
    return super.messages;
  }

  get messageCount() {
    return this.messages.filter(m => CHAT_ROLES.includes(m.role)).length;
  }

  /**
   * Returns the contextMentions count from the most recent user message in
   * the conversation, or 0 if none.
   *
   * @returns {number}
   */
  getLatestUserMentionCount() {
    const lastUserMsg = this.messages.findLast(
      m => m?.role === MESSAGE_ROLE.USER
    );
    return lastUserMsg?.content?.contextMentions?.length ?? 0;
  }

  /**
   * Efficiently add an iterable of URLs to the seen urls.
   *
   * @param {Iterable<string>} urls
   */
  addSeenUrls(urls) {
    for (const url of urls) {
      this.seenUrls.add(url);
    }
    this.emit("chat-conversation:seen-urls-updated", this.seenUrls);
  }

  /**
   * Add an iterable of URLs to the serpUrlsForAnonymousFetch ledger
   *
   * @param {Iterable<string>} urls
   */
  addSerpUrlsForAnonymousFetch(urls) {
    for (const url of urls) {
      this.serpUrlsForAnonymousFetch.add(url);
    }
  }

  /**
   * Clears the tool UI data for a message
   *
   * @param {ChatMessage} message - The message to clear tool UI data from
   * @private
   */
  #clearToolUI(message) {
    message.toolUIData = null;
    this.emit("chat-conversation:message-update", message);
  }

  /**
   * Updates the tool UI data for a message with a new UI state
   *
   * @param {ChatMessage} message - The message to update
   * @param {object} data - The update data containing updateData
   * @param {string|null} nextUI - The next UI state to transition to, or null to clear
   */
  async updateToolUI(message, data, nextUI) {
    // If nextUI is null, clear the toolUIData and return early
    if (nextUI === null) {
      this.#clearToolUI(message);
      return;
    }

    message.toolUIData = {
      ...message.toolUIData,
      uiType: nextUI,
      properties: {
        ...message.toolUIData.properties,
      },
    };

    // Add specific data based on the UI type
    if (nextUI === "ai-action-result") {
      message.toolUIData.properties.confirmedData = data.updateData;
    }

    // Emit event to trigger re-render
    this.emit("chat-conversation:message-update", message);
  }

  /**
   * Adds UI tool data to the current assistant message.
   * Handles both initial addition and progressive updates.
   *
   * @param {string} toolCallId - The ID of the tool call
   * @param {object} uiData - The UI data to attach to the message
   * @returns {object} Result object with success status and message
   */
  addUIToolToCurrentMessage(toolCallId, uiData) {
    const enrichedUIData = { ...uiData };

    // Get the last assistant text message to attach UI to
    let currentMessage = this.messages
      .filter(
        m => m.role === MESSAGE_ROLE.ASSISTANT && m.content?.type === "text"
      )
      .at(-1);

    if (!currentMessage) {
      // Create a synthetic text message if the model only returned a tool call
      // This ensures the UI has something to attach to
      currentMessage = this.addAssistantMessage("text", "");

      if (!currentMessage) {
        return {
          success: false,
          message: "Failed to create assistant message for UI attachment",
          dataAdded: null,
        };
      }
    }

    // For website confirmations, add the original user prompt
    if (uiData.uiType === lazy.UI_TYPES.WEBSITE_CONFIRMATION) {
      const originalUserPrompt = lazy.ToolUI.findOriginalUserPrompt(
        this.messages,
        currentMessage
      );

      if (originalUserPrompt) {
        enrichedUIData.properties = {
          ...enrichedUIData.properties,
          originalUserPrompt,
        };
      }
    }

    // Check if this is an update to existing toolUIData
    const isUpdate =
      currentMessage.toolUIData &&
      currentMessage.toolUIData.toolCallId === toolCallId;

    if (isUpdate) {
      // Merge the new data with existing data for progressive updates
      currentMessage.toolUIData = {
        ...currentMessage.toolUIData,
        ...enrichedUIData,
        // Deep merge properties if they exist in both
        properties: {
          ...currentMessage.toolUIData.properties,
          ...enrichedUIData.properties,
        },
        updateCount: (currentMessage.toolUIData.updateCount || 0) + 1,
        lastUpdated: new Date().toISOString(),
      };
    } else {
      // Set toolUIData as a new object (first call)
      currentMessage.toolUIData = {
        toolCallId,
        timestamp: new Date().toISOString(),
        updateCount: 0,
        ...enrichedUIData,
      };
    }

    // Emit update event so UI components react to the change
    this.emit("chat-conversation:message-update", currentMessage);

    // Re-emit complete event since the message was already marked complete before tool execution
    // This forces the UI to re-render with the new toolUIData
    this.emit("chat-conversation:message-complete", currentMessage);

    return {
      success: true,
      message: isUpdate
        ? "Tool UI data updated"
        : "Tool UI data added to existing assistant message",
      dataAdded: enrichedUIData,
      isUpdate,
    };
  }

  /**
   * Merge records returned by a `search_browsing_history` tool call into the
   * conversation-level history results pool, keyed by URL. Accumulates across
   * every search in the conversation. The pool is snapshotted onto an assistant
   * message when it completes in `receiveResponse()` so the message that
   * triggered the search and any later message reusing those results
   * can both render a grid.
   *
   * @param {Iterable<object>} records - Per-URL records from search_browsing_history.
   */
  addHistoryResults(records) {
    for (const record of records) {
      record.timestamp = lazy.convertTimestamp(
        record.visitDate,
        lazy.fluentStrings
      );
      this.#historyResultsPool.set(record.url, record);
    }

    // Deliver to the content page. This runs during tool
    // execution, so it's dispatched before the assistant's follow-up answer
    // streams, content side should have the pool
    // before it renders the list. Tool execution should not block content
    // process side.
    this.#historyResultsDispatcher?.({
      records: [...this.#historyResultsPool.values()],
    });
  }

  /**
   * Register the dispatcher used to forward history results to the content
   * page. See {@link ChatConversation#addHistoryResults}.
   *
   * @param {?function(object): void} dispatcher
   */
  setHistoryResultsDispatcher(dispatcher) {
    this.#historyResultsDispatcher = dispatcher;
  }

  /**
   * A snapshot of the accumulated history results pool, as a records array.
   * Attached to a message when it completes so the content page can render the
   * history grid deterministically — independent of the streaming-time
   * dispatch, whose delivery races the message lifecycle.
   *
   * @returns {object[]}
   */
  getHistoryResultsSnapshot() {
    return [...this.#historyResultsPool.values()];
  }
}
