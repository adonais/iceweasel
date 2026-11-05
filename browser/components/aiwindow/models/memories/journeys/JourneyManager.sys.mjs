/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** @typedef {import("./JourneyStore.sys.mjs").JourneyMetadata} JourneyMetadata */

const RESUME_ACTIVITY_SUPPORTED_LOCALES = ["en"];

// Generate extra candidates so dismissals can reveal replacements.
const MAX_NUM_MEMORIES_FOR_RESUME_ACTIVITY = 6;
// Max number of URLs to include per memory in the "Pick up where you left off" prompt.
export const MAX_NUM_URLS_PER_MEMORY = 10;

// Max number of messages to include per conversation in the "Pick up where you left off" prompt.
export const MAX_MESSAGES_PER_CONVERSATION_FOR_RESUME_ACTIVITY_PROMPT = 3;

// Single-slot cache for resume activity suggestion.
// This avoids re-querying additional LLM, places/chat DB calls for each suggestion request between memory generation runs.
const _resumeActivityCache = new Map();

let _savedLoadPromptDescriptor = null;
let _savedBuildConversationDescriptor = null;
let _savedGetConversationsByIdDescriptor = null;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AuthProvider:
    "moz-src:///browser/components/aiwindow/models/AuthProvider.sys.mjs",
  MESSAGE_ROLE:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs",
  MemoriesManager:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs",
  sanitizeUntrustedContent:
    "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs",
  renderPrompt: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  MODEL_FEATURES: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  parseAndExtractJSON:
    "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  indexInferenceResultsById:
    "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs",
  MEMORY_FILTER_COMPARATOR:
    "moz-src:///browser/components/aiwindow/services/MemoryStoreConstants.sys.mjs",
  buildConversation:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  loadPrompt:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  getHistorySourceIdsFromMemory:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesHistorySource.sys.mjs",
  resolveUrlsForMemories:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesHistorySource.sys.mjs",
  getConversationSourceIdsFromMemory:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesChatSource.sys.mjs",
  getConversationsById:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesChatSource.sys.mjs",
  MESSAGE_LENGTH_THRESHOLD:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesChatSource.sys.mjs",
  ROLE_LABEL:
    "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs",
  ChatConversation:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs",
  SYSTEM_PROMPT_TYPE:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs",
  JourneyStore:
    "moz-src:///browser/components/aiwindow/models/memories/journeys/JourneyStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "JourneyManager",
    maxLogLevelPref: "browser.smartwindow.memoriesLogLevel",
  })
);

/** Provides suggestions and conversations for resuming journeys. */
export const JourneyManager = {
  /**
   * @returns {Promise<boolean>} Whether any stored journeys are not suppressed.
   */
  async hasEligibleJourneys() {
    const journeys = await lazy.JourneyStore.getAll();
    return journeys.some(journey => !this.isJourneySuppressed(journey));
  },

  /**
   * Returns true if the journey is permanently dismissed or now is less than
   * dismissed_until.
   *
   * @param {JourneyMetadata} metadata - Record to test.
   * @param {number} [now] - Epoch milliseconds to compare against; defaults to
   *   Date.now().
   * @returns {boolean} Whether the journey is suppressed.
   */
  isJourneySuppressed(metadata, now = Date.now()) {
    return (
      metadata.dismissed ||
      (metadata.dismissed_until !== null && metadata.dismissed_until > now)
    );
  },

  /**
   * Generates conversation starter prompts for suggestions to resume journeys
   * based on user memories and associated browsing history.
   *
   * Only supported for English app locales; returns an empty list otherwise.
   * Exclusion and limiting are not supported by the current implementation.
   *
   * @param {Array<string>} excludeIds - Journey IDs to exclude. Currently unsupported.
   * @param {number} limit - Maximum suggestions to return. Currently unsupported.
   * @returns {Promise<Array<object>>} Array of objects containing memory and
   *   content with headline, status, and previewTabs
   * @throws {Error} If excludeIds or limit is not undefined.
   */
  async suggestJourneysToResume(excludeIds, limit) {
    if (excludeIds !== undefined || limit !== undefined) {
      throw new Error("excludeIds and limit are not yet supported");
    }

    return this._generateResumeActivityConversationStarters();
  },

  /**
   * Generates a conversation initialized with a resume activity suggestion.
   *
   * @param {object} resumeActivitySuggestion - Resume activity suggestion data
   * @param {object} resumeActivitySuggestion.memory - The memory associated with the resume activity suggestion
   * @param {object} resumeActivitySuggestion.content - Content of the suggestion
   * @param {string} resumeActivitySuggestion.content.headline - Headline for the suggestion
   * @param {string} resumeActivitySuggestion.content.status - Status for the suggestion
   * @param {Array<object>} resumeActivitySuggestion.content.previewTabs - Array of preview tabs
   * @param {string} resumeActivitySuggestion.content.previewTabs[].url - URL of a preview tab
   * @param {string} resumeActivitySuggestion.content.previewTabs[].title - Title of a preview tab
   * @param {string} [conversationId] - Id to reuse for the new conversation, so
   *   telemetry keeps the chat_id of the conversation the pill was clicked in.
   *   A new id is generated when omitted.
   * @returns {Promise<ChatConversation|null>} ChatConversation instance initialized
   *   with the resume activity context, or null for invalid suggestion inputs
   */
  async constructConversationToResumeJourney(
    resumeActivitySuggestion,
    conversationId
  ) {
    if (
      !resumeActivitySuggestion ||
      !resumeActivitySuggestion.memory ||
      !resumeActivitySuggestion.content
    ) {
      lazy.console.warn(
        "[resume-activity] Missing required inputs for conversation."
      );
      return null;
    }

    // Check required content fields
    const content = resumeActivitySuggestion.content;
    if (
      !content.headline ||
      !content.status ||
      !content.previewTabs ||
      !Array.isArray(content.previewTabs) ||
      content.previewTabs.length === 0
    ) {
      lazy.console.warn(
        "[resume-activity] Missing fields in resume activity content fields."
      );
      return null;
    }

    const conversation = new lazy.ChatConversation({
      ...(conversationId ? { id: conversationId } : {}),
      title: resumeActivitySuggestion.content.headline,
    });
    conversation.promptEmbeddedMemories = [resumeActivitySuggestion.memory];

    const [
      { prompt: chatSystemPrompt },
      { prompt: resumeActivitySystemPrompt },
      { prompt: resumeActivityUserPrompt },
    ] = await Promise.all([
      lazy.loadPrompt(lazy.MODEL_FEATURES.CHAT, {
        model: conversation.engine?.model,
      }),
      lazy.loadPrompt(lazy.MODEL_FEATURES.RESUME_ACTIVITY_CONVERSATION, {
        module: "system-instructions",
      }),
      lazy.loadPrompt(lazy.MODEL_FEATURES.RESUME_ACTIVITY_CONVERSATION, {
        module: "user-data",
      }),
    ]);

    conversation.setSystemMessage({
      type: lazy.SYSTEM_PROMPT_TYPE.TEXT,
      body: [chatSystemPrompt, resumeActivitySystemPrompt].join("\n"),
    });

    const memoryInput = this._buildMemoryInputBlock(
      {
        memory: resumeActivitySuggestion.memory,
        urls: resumeActivitySuggestion.content.previewTabs,
      },
      undefined,
      await this._formatChatsForResumeActivityPrompt(
        Array.of(resumeActivitySuggestion.memory)
      )
    );

    const resumeActivityData = lazy.renderPrompt(resumeActivityUserPrompt, {
      memoryInput,
      conversationStarter: [
        `headline: ${resumeActivitySuggestion.content.headline}`,
        `status: ${resumeActivitySuggestion.content.status}`,
      ].join("\n"),
    });

    const userMessage = conversation.addUserMessage(
      resumeActivitySuggestion.content.headline,
      null,
      undefined,
      {
        resumeActivityContext: resumeActivityData,
      }
    );

    userMessage.content.relevantMemories = [
      {
        id: resumeActivitySuggestion.memory.id,
        memory_summary: resumeActivitySuggestion.memory.memory_summary,
      },
    ];

    // SECURITY: the prompt mixes private user data (memory summaries, browsing
    // history, past chats) with untrusted webpage titles. Flags set so unallowed
    // tools will not be available for use in this conversation.
    conversation.securityProperties.setPrivateData();
    conversation.securityProperties.setUntrustedInput();
    conversation.securityProperties.commit();
    return conversation;
  },

  /**
   * Unpacks JSON Array output from inference response into array of results
   *
   * @param {*} response - Inference output response object
   * @returns {Array} - Array of parsed JSON objects, or empty array if parsing fails
   */
  _unpackJsonArrayOutput(response) {
    let parsed = [];
    try {
      parsed = lazy.parseAndExtractJSON(response, []);
      if (!Array.isArray(parsed)) {
        lazy.console.warn(
          "Inference output is not an array, returning empty array"
        );
        return [];
      }
    } catch (e) {
      lazy.console.warn(
        "Failed to parse inference output into expected schema",
        e
      );
      parsed = [];
    }
    parsed = parsed.filter(
      item =>
        typeof item === "object" &&
        item !== null &&
        item.id != null &&
        typeof item.headline === "string" &&
        typeof item.status === "string"
    );
    return parsed;
  },

  /**
   * Gets memories suitable for Resume Activity suggestions.
   * Selects memories that are not sensitive and have associated browsing history.
   * Sorted by frecency and updated_at, returning the most frecent/recently updated memories.
   *
   * @param {number} count - Maximum number of memories to return
   * @returns {Promise<Array<object>>}
   */
  async _getMemoriesForResumeActivityConversationStarter(
    count = MAX_NUM_MEMORIES_FOR_RESUME_ACTIVITY
  ) {
    let attributeFilters = [
      {
        field: "sensitivity_category",
        comparator: lazy.MEMORY_FILTER_COMPARATOR.EQUAL_TO,
        value: lazy.MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE,
      },
    ];
    let memories =
      await lazy.MemoriesManager.getMemoriesByAttribute(attributeFilters);

    // Filter out memories that don't have any associated history.
    // The case of HISTORY as a source, but no history_source_ids,
    // come from v1 memories, before lineage was tracked.
    memories = memories.filter(memory => {
      const sourceIds = memory?.source_ids ?? {};
      const hasHistory =
        Array.isArray(sourceIds.history_source_ids) &&
        !!sourceIds.history_source_ids.length;
      return hasHistory;
    });

    // Re-sort by created_at (most recent first)
    memories.sort(
      (a, b) =>
        (b.created_at ?? 0) - (a.created_at ?? 0) ||
        (b.last_merged ?? 0) - (a.last_merged ?? 0)
    );

    // Slice to requested count
    return memories.slice(0, count);
  },

  /**
   * Attaches resolved Places URLs/titles to a single memory, dropping unresolved
   * URLs and keeping the most recently visited up to maxUrlsPerMemory.
   *
   * @param {object} memory - Memory carrying history place hashes
   * @param {Map<number, object>} urlsByHash - Places data keyed by URL hash
   * @param {number} maxUrlsPerMemory - Max URLs to keep per memory
   * @returns {{memory: object, urls: Array<object>}}
   */
  _attachUrlsToMemory(memory, urlsByHash, maxUrlsPerMemory) {
    return {
      memory,
      urls: lazy
        .getHistorySourceIdsFromMemory(memory)
        .map(urlHash => urlsByHash.get(urlHash))
        .filter(Boolean)
        .sort((a, b) => a.lastVisitDate - b.lastVisitDate)
        .slice(-maxUrlsPerMemory),
    };
  },

  /**
   * Format chats for resume activity prompt
   *
   * @param {Array<object>} memories Array of memory objects
   * @returns {Promise<Map<string, object>>} Map of conversationId to formatted conversation object
   */
  async _formatChatsForResumeActivityPrompt(memories) {
    const conversationIds = [
      ...new Set(
        memories.flatMap(memory =>
          lazy.getConversationSourceIdsFromMemory(memory)
        )
      ),
    ];
    const conversations = await lazy.getConversationsById(conversationIds);
    const chatsById = new Map();
    for (const conversation of conversations) {
      chatsById.set(conversation.id, {
        ...conversation,
        formattedMessagesForResumeActivity: conversation.messages
          .filter(
            message =>
              ![lazy.MESSAGE_ROLE.SYSTEM, lazy.MESSAGE_ROLE.TOOL].includes(
                message.role
              )
          )
          .slice(-MAX_MESSAGES_PER_CONVERSATION_FOR_RESUME_ACTIVITY_PROMPT)
          .map(message => {
            const role = lazy.ROLE_LABEL[message.role];
            let bodyOrContent = message.content?.body ?? message.content;
            if (
              bodyOrContent &&
              bodyOrContent.length > lazy.MESSAGE_LENGTH_THRESHOLD
            ) {
              bodyOrContent = bodyOrContent.substring(
                0,
                lazy.MESSAGE_LENGTH_THRESHOLD
              );
            }
            return `[role: ${role}] ${bodyOrContent}`;
          })
          .join("\n"),
      });
    }
    return chatsById;
  },

  /**
   * Builds the prompt text block describing a single memory and its associated
   * pages and chats. When provided, `index` doubles as the id echoed back by the model.
   *
   * @param {{memory: object, urls: Array<object>}} entry - Memory and its URLs
   * @param {number|undefined} index - Optional position of the memory, used as its stable id
   * @param {Map<string, object>} chatsById - Formatted chats keyed by conversation id
   * @returns {string} Prompt block for the memory
   */
  _buildMemoryInputBlock({ memory, urls }, index, chatsById) {
    const pages = urls
      .map(url => `  - ${lazy.sanitizeUntrustedContent(url.title)}`)
      .join("\n");

    const chats = lazy
      .getConversationSourceIdsFromMemory(memory)
      .map(conversationId => chatsById.get(conversationId))
      .filter(Boolean)
      .sort((a, b) => a.updatedDate - b.updatedDate)
      .map(({ title, formattedMessagesForResumeActivity }) =>
        [
          ` - title: ${title}`,
          "            messages:",
          `            ${formattedMessagesForResumeActivity
            .split("\n")
            .map(line => `     ${line}`)
            .join("\n")}`,
        ].join("\n")
      );

    const header = Number.isInteger(index)
      ? `-------------------------\nid: ${index}\n`
      : "";

    let block = [
      `${header}memory_summary: ${memory.memory_summary}`,
      `frecency: ${memory.frecency ?? 0}`,
      `reasoning: ${memory.reasoning ?? ""}`,
      `pages:\n${pages}`,
    ].join("\n");

    if (chats.length) {
      block += `\nchats:\n${chats.join("\n")}`;
    }
    return block;
  },

  /**
   * Returns cached resume activity for the input watermark.
   *
   * @param {number} watermark
   * @returns {Array<object>|Promise<Array<object>>|undefined} Cached result,
   *   in-flight request, or undefined if not available
   */
  _getCachedResumeActivity(watermark) {
    const entry = _resumeActivityCache.get(watermark);
    if (!entry) {
      return undefined;
    }
    return "result" in entry ? entry.result : entry.inFlight;
  },

  /**
   * Removes cached suggestions for memories that have since been deleted.
   *
   * @param {Array<object>} result Cached resume activity suggestions
   * @returns {Promise<Array<object>>} Suggestions for current memories
   */
  async _filterDeletedMemoriesFromResumeActivity(result) {
    const currentMemoryIds = new Set(
      (
        await lazy.MemoriesManager.getAllMemories({ includeSoftDeleted: false })
      ).map(memory => memory.id)
    );
    const filteredResult = result.filter(({ memory }) =>
      currentMemoryIds.has(memory.id)
    );
    return filteredResult.length === result.length ? result : filteredResult;
  },

  /**
   * @returns {Promise<Array<object>>} Generated resume activity suggestions
   */
  async _generateUncachedResumeActivityConversationStarters() {
    try {
      // Query for memories that would be suitable for resume activity suggestions
      const memoriesWithPlaceHashes =
        await this._getMemoriesForResumeActivityConversationStarter(
          MAX_NUM_MEMORIES_FOR_RESUME_ACTIVITY
        );
      if (!memoriesWithPlaceHashes.length) {
        return [];
      }

      const urlsByHash = await lazy.resolveUrlsForMemories(
        memoriesWithPlaceHashes,
        { filterBySummary: true }
      );
      const memoriesWithUrlsAndTitles = memoriesWithPlaceHashes
        .map(memory =>
          this._attachUrlsToMemory(memory, urlsByHash, MAX_NUM_URLS_PER_MEMORY)
        )
        .filter(s => !!s.urls.length);
      if (!memoriesWithUrlsAndTitles.length) {
        return [];
      }

      // Load prompts and build the conversation for inference
      const conversation = await lazy.buildConversation(
        lazy.MODEL_FEATURES.RESUME_ACTIVITY_CONVERSATION_STARTER,
        { flowId: null }
      );
      const [
        { prompt: resumeActivitySystemPrompt },
        { prompt: resumeActivityUserPrompt },
      ] = await Promise.all([
        lazy.loadPrompt(
          lazy.MODEL_FEATURES.RESUME_ACTIVITY_CONVERSATION_STARTER,
          {
            module: "system-instructions",
          }
        ),
        lazy.loadPrompt(
          lazy.MODEL_FEATURES.RESUME_ACTIVITY_CONVERSATION_STARTER,
          {
            module: "user-data",
          }
        ),
      ]);
      conversation.setSystemMessage(resumeActivitySystemPrompt);

      const chatsById = await this._formatChatsForResumeActivityPrompt(
        memoriesWithUrlsAndTitles.map(m => m.memory)
      );
      const memoryInput = memoriesWithUrlsAndTitles.map((entry, index) =>
        this._buildMemoryInputBlock(entry, index, chatsById)
      );

      const userDataMessage = lazy.renderPrompt(resumeActivityUserPrompt, {
        memoryCount: memoryInput.length,
        memoryInput: memoryInput.join("\n\n"),
      });
      conversation.addUserMessage(userDataMessage);

      // SECURITY: the prompt mixes private user data (memory summaries, browsing
      // history, past chats) with untrusted webpage titles. The conversation is
      // single-shot and exposes no tools, so nothing can act on either, but the
      // flags must be accurate in case of later reuse of this conversation.
      conversation.securityProperties.setPrivateData();
      conversation.securityProperties.setUntrustedInput();
      conversation.securityProperties.commit();

      const runResult = await conversation.run({
        token: await lazy.AuthProvider.getToken(),
      });
      const cardsById = lazy.indexInferenceResultsById(
        this._unpackJsonArrayOutput(runResult)
      );

      const result = memoriesWithUrlsAndTitles.map(
        ({ memory, urls }, index) => {
          const card = cardsById.get(index);
          if (!card) {
            return null;
          }
          return {
            memory,
            content: {
              headline: (card?.headline || "").replace(/[.!?;:,]+$/, ""),
              status: (card?.status || "").replace(/[.!?;:,]+$/, ""),
              previewTabs: urls.map(({ url, title }) => ({ url, title })),
            },
          };
        }
      );
      return result.filter(Boolean);
    } catch (e) {
      lazy.console.warn("[resume-activity] Conversation starters failed:", e);
      return [];
    }
  },

  /**
   * Generates conversation starter prompts for suggestions to resume activity based
   * on user memories and associated browsing history.
   *
   * Only supported for English app locales; returns an empty list otherwise.
   *
   * @returns {Promise<Array<object>>} Array of objects containing memory and
   *   content with headline, status, and previewTabs
   */
  async _generateResumeActivityConversationStarters() {
    // Return an empty array for unsupported locales
    if (!this._isResumeActivityLocaleSupported()) {
      return [];
    }

    const watermark =
      await lazy.MemoriesManager.getLastSessionMemoryTimestamp();
    const cached = this._getCachedResumeActivity(watermark);
    if (cached !== undefined) {
      return this._filterDeletedMemoriesFromResumeActivity(await cached);
    }

    const inFlight = this._generateUncachedResumeActivityConversationStarters();
    const entry = { inFlight };
    _resumeActivityCache.clear();
    _resumeActivityCache.set(watermark, entry);

    const result = await inFlight;
    if (_resumeActivityCache.get(watermark) === entry) {
      _resumeActivityCache.set(watermark, { result });
    }
    return result;
  },

  _isResumeActivityLocaleSupported() {
    const appLocale = Services.locale.appLocaleAsBCP47.toLowerCase();
    return RESUME_ACTIVITY_SUPPORTED_LOCALES.some(
      locale => appLocale === locale || appLocale.startsWith(`${locale}-`)
    );
  },

  _setLoadPromptForTesting(fn) {
    if (fn !== null) {
      _savedLoadPromptDescriptor = Object.getOwnPropertyDescriptor(
        lazy,
        "loadPrompt"
      );
      lazy.loadPrompt = fn;
    } else if (_savedLoadPromptDescriptor) {
      // eslint-disable-next-line mozilla/valid-lazy
      Object.defineProperty(lazy, "loadPrompt", _savedLoadPromptDescriptor);
      _savedLoadPromptDescriptor = null;
    }
  },

  _setBuildConversationForTesting(fn) {
    if (fn !== null) {
      _savedBuildConversationDescriptor = Object.getOwnPropertyDescriptor(
        lazy,
        "buildConversation"
      );
      lazy.buildConversation = fn;
    } else if (_savedBuildConversationDescriptor) {
      // eslint-disable-next-line mozilla/valid-lazy
      Object.defineProperty(
        lazy,
        "buildConversation",
        _savedBuildConversationDescriptor
      );
      _savedBuildConversationDescriptor = null;
    }
  },

  _setGetConversationsByIdForTesting(fn) {
    if (fn !== null) {
      _savedGetConversationsByIdDescriptor = Object.getOwnPropertyDescriptor(
        lazy,
        "getConversationsById"
      );
      lazy.getConversationsById = fn;
    } else if (_savedGetConversationsByIdDescriptor) {
      // eslint-disable-next-line mozilla/valid-lazy
      Object.defineProperty(
        lazy,
        "getConversationsById",
        _savedGetConversationsByIdDescriptor
      );
      _savedGetConversationsByIdDescriptor = null;
    }
  },

  _clearResumeActivityCacheForTesting() {
    _resumeActivityCache.clear();
  },
};
