/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  getRecentHistory,
  countRecentVisits,
} from "moz-src:///browser/components/aiwindow/models/memories/MemoriesHistorySource.sys.mjs";
import { getRecentChats } from "./MemoriesChatSource.sys.mjs";
import { buildSessions } from "./MemoriesSessions.sys.mjs";
import { runHeuristicGate } from "./MemoriesSessionGate.sys.mjs";
import {
  MODEL_FEATURES,
  renderPrompt,
  parseAndExtractJSON,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import {
  buildConversation,
  loadPrompt,
} from "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs";
import {
  ChatStore,
  MESSAGE_ROLE,
} from "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs";
import { SensitiveInfoDetector } from "moz-src:///browser/components/aiwindow/models/memories/SensitiveInfoDetector.sys.mjs";

import { MemoryStore } from "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs";
import {
  CATEGORIES,
  INTENTS,
  GATE_SKIP,
  HISTORY as SOURCE_HISTORY,
  CONVERSATION as SOURCE_CONVERSATION,
  CONVERSATION_USER_REQUEST as SOURCE_USER_REQUEST,
  PREF_GENERATE_MEMORIES_FROM_HISTORY,
  PREF_GENERATE_MEMORIES_FROM_CONVERSATION,
  MAX_MEMORY_SUMMARY_LENGTH,
  DEFAULT_RELEVANT_MEMORIES_TOP_K,
  DEFAULT_RELEVANT_MEMORIES_SIMILARITY_THRESHOLD,
} from "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs";
import {
  getFormattedMemoryAttributeList,
  runSessionMemoryPipeline,
} from "moz-src:///browser/components/aiwindow/models/memories/Memories.sys.mjs";
import { MEMORIES_MESSAGE_CLASSIFY_SCHEMA } from "moz-src:///browser/components/aiwindow/models/memories/MemoriesSchemas.sys.mjs";
import { AIWindow } from "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs";
import { EveryWindow } from "resource:///modules/EveryWindow.sys.mjs";
import { AIWindowAccountAuth } from "moz-src:///browser/components/aiwindow/ui/modules/AIWindowAccountAuth.sys.mjs";

const DEFAULT_HISTORY_FULL_LOOKUP_DAYS = 20;
const DEFAULT_HISTORY_FULL_MAX_RESULTS = 3000;
const DEFAULT_HISTORY_DELTA_MAX_RESULTS = 500;
const DEFAULT_CHAT_FULL_MAX_RESULTS = 50;
const DEFAULT_CHAT_HALF_LIFE_DAYS_FULL_RESULTS = 7;

const LAST_SESSION_MEMORY_TS_ATTRIBUTE = "last_session_memory_ts";

const PREF_FIRSTRUN_HAS_COMPLETED = "browser.smartwindow.firstrun.hasCompleted";

// Single shared detector instance, mirroring MemoriesChatSource /
// MemoriesHistorySource usage.
const _sensitiveInfoDetector = new SensitiveInfoDetector();

/**
 * MemoriesManager class
 */
export class MemoriesManager {
  // Exposed to be stubbed for testing
  static _getRecentChats = getRecentChats;
  static _getRecentHistory = getRecentHistory;

  // Cached Conversation for the 3 serial LLM steps in one generateMemories()
  // pass. Callers MUST NOT invoke generation concurrently — clearMessages /
  // addMessage sequences on the shared instance race across acquires.
  static #generationConversationPromise = null;

  // Cached Conversation for memory usage (classification, relevance).
  // Same serial-only contract.
  static #usageConversationPromise = null;
  /**
   * Returns a Conversation wired to the memory-generation feature. Used for:
   * initial generation, deduplication, sensitivity filter.
   *
   * @returns {Promise<Conversation>}
   */
  static async ensureConversationForGeneration() {
    const buildFresh = async () => {
      this.#generationConversationPromise = buildConversation(
        MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM
      );
      return this.#generationConversationPromise;
    };

    if (!this.#generationConversationPromise) {
      return await buildFresh();
    }

    let conversation;
    try {
      conversation = await this.#generationConversationPromise;
    } catch (e) {
      this.#generationConversationPromise = null;
      return await buildFresh();
    }

    if (!conversation?.isReady) {
      this.#generationConversationPromise = null;
      return await buildFresh();
    }
    return conversation;
  }

  /**
   * Returns a Conversation wired to the memory-usage feature. Used for:
   * message classification, relevant context.
   *
   * @returns {Promise<Conversation>}
   */
  static async ensureConversationForUsage() {
    const buildFresh = async () => {
      this.#usageConversationPromise = buildConversation(
        MODEL_FEATURES.MEMORIES_MESSAGE_CLASSIFICATION_SYSTEM
      );
      return this.#usageConversationPromise;
    };

    if (!this.#usageConversationPromise) {
      return await buildFresh();
    }

    let conversation;
    try {
      conversation = await this.#usageConversationPromise;
    } catch (e) {
      this.#usageConversationPromise = null;
      return await buildFresh();
    }

    if (!conversation?.isReady) {
      this.#usageConversationPromise = null;
      return await buildFresh();
    }
    return conversation;
  }

  /**
   * Unified entry point: generates and persists memories from cross-modal
   * session bundles built from the user's recent browsing history AND chats.
   *
   *  1. Resolves which sources are enabled (history and/or conversation).
   *  2. Reads the single {@link getLastSessionMemoryTimestamp} watermark and
   *     pulls recent history rows and/or chat messages since it (delta), or a
   *     full lookup on first run. Disabled sources contribute `[]`.
   *  3. Builds unified sessions via {@link buildSessions} and drops sessions
   *     the heuristic gate marks `SKIP`.
   *  4. Runs the batched generate -> global filter -> global dedup pipeline.
   *  5. Persists survivors once and advances the unified watermark to the
   *     contiguous successfully-processed point.
   *
   * @param {object} [pipelineOpts={}]
   *        Options forwarded to {@link runSessionMemoryPipeline} (e.g.
   *        `batchSize`, `maxBatchRetries`). Omitted keys fall back to the
   *        pipeline's own defaults.
   * @returns {Promise<Memory[]>}  Persisted memories (possibly empty).
   */
  static async generateMemoriesFromSessions(pipelineOpts = {}) {
    const historyEnabled =
      this.shouldEnableMemoriesFromSchedulers(SOURCE_HISTORY);
    const conversationEnabled =
      this.shouldEnableMemoriesFromSchedulers(SOURCE_CONVERSATION);

    if (!historyEnabled && !conversationEnabled) {
      return [];
    }

    const watermarkMs = await this.getLastSessionMemoryTimestamp();
    const isDelta = watermarkMs > 0;

    let historyRows = [];
    if (historyEnabled) {
      const recentHistoryOpts = isDelta
        ? {
            sinceMicros: watermarkMs * 1000,
            maxResults: DEFAULT_HISTORY_DELTA_MAX_RESULTS,
          }
        : {
            days: DEFAULT_HISTORY_FULL_LOOKUP_DAYS,
            maxResults: DEFAULT_HISTORY_FULL_MAX_RESULTS,
          };
      historyRows = await this._getRecentHistory(recentHistoryOpts);
    }

    let chatMessages = [];
    if (conversationEnabled) {
      chatMessages = await this._getRecentChats(
        isDelta ? watermarkMs : 0,
        DEFAULT_CHAT_FULL_MAX_RESULTS,
        DEFAULT_CHAT_HALF_LIFE_DAYS_FULL_RESULTS
      );
    }

    const sessions = buildSessions(historyRows, chatMessages);
    const retainedSessions = sessions.filter(
      session => runHeuristicGate(session).decision !== GATE_SKIP
    );

    if (!retainedSessions.length) {
      // Since no retainedSessions are present due to SKIP decisions, then advance
      // the watermark past them to avoid re-pulling and re-gating the same
      // trivial sessions next run.
      const maxSessionEndMs = sessions.reduce(
        (max, session) => Math.max(max, session.session_end_ms),
        0
      );
      if (maxSessionEndMs > watermarkMs) {
        await this.setLastSessionMemoryTimestamp(maxSessionEndMs);
      }
      console.warn(
        "MemoriesManager.generateMemoriesFromSessions: " +
          "No sessions to process after gating; skipping memory generation."
      );
      return [];
    }

    const existingMemories = await this.getAllMemories();
    const existingMemoriesSummaries = existingMemories.map(
      i => i.memory_summary
    );

    const conversation = await this.ensureConversationForGeneration();

    let result;
    try {
      result = await runSessionMemoryPipeline(
        conversation,
        retainedSessions,
        existingMemoriesSummaries,
        pipelineOpts
      );
    } catch (e) {
      // Pipeline failed; don't advance the watermark. Re-throw retryable errors
      // so the scheduler can back off; swallow permanent ones.
      console.error(
        "MemoriesManager.generateMemoriesFromSessions: " +
          "pipeline failed; watermark not advanced.",
        e
      );
      if (openAIEngine.isRetryableError(e)) {
        throw e;
      }
      return [];
    }

    const { persistedMemories } = await this.saveMemories(result.memories);

    if (result.processedThroughMs > 0) {
      await this.setLastSessionMemoryTimestamp(
        Math.max(watermarkMs, result.processedThroughMs)
      );
    }

    return persistedMemories;
  }

  /**
   * Retrieves all stored memories.
   * This is a quick-access wrapper around MemoryStore.getMemories() with no additional processing.
   *
   * @param {object} [opts={}]
   * @param {boolean} [opts.includeSoftDeleted=false]
   *        Whether to include soft-deleted memories.
   * @returns {Promise<Array<object>>}
   *        List of memories
   */
  static async getAllMemories(opts = { includeSoftDeleted: false }) {
    return await MemoryStore.getMemories(opts);
  }

  /**
   * Retrieves memories by ID.
   * This is a quick-access wrapper around MemoryStore.getMemories() specifically requiring the memoryIds option.
   *
   * @param {Set<string>} memoryIds   Set of memory IDs
   * @returns {Promise<Array<Map>>}
   */
  static async getMemoriesByID(memoryIds) {
    return await MemoryStore.getMemories({ memoryIds });
  }

  /**
   * Public API wrapper around MemoryStore.getMemories
   *
   * @param {Array<object>} [attributeFilters]     // Filtering options
   * @param {string} [attributeFilters.field]      // Memory field (attribute) on which to filter
   * @param {string} [attributeFilters.value]      // The value to filter against
   * @param {string} [attributeFilters.comparator] // How the filter should be applied (equal to, greater than, less than, etc.)
   * @returns {Array<object>}                      // Array of filtered memories
   */
  static async getMemoriesByAttribute(attributeFilters) {
    return await MemoryStore.getMemories({ attributeFilters });
  }

  /**
   * Returns the unified session-memory watermark (ms since Unix epoch): the
   * point through which the combined history+chat session pipeline has been
   * processed.
   *
   * On first read after migrating from the two legacy per-modality watermarks,
   * this seeds from the older of the two so the first unified run does a delta
   * pull rather than re-scanning all history.
   *
   * @returns {Promise<number>}  Milliseconds since Unix epoch (0 if never run)
   */
  static async getLastSessionMemoryTimestamp() {
    const meta = await MemoryStore.getMeta();
    if (meta.last_session_memory_ts) {
      return meta.last_session_memory_ts;
    }
    const legacy = [
      meta.last_history_memory_ts,
      meta.last_chat_memory_ts,
    ].filter(ts => typeof ts === "number" && ts > 0);
    return legacy.length ? Math.min(...legacy) : 0;
  }

  /**
   * Persists the unified session-memory watermark.
   *
   * @param {number} tsMs  Milliseconds since Unix epoch
   * @returns {Promise<void>}
   */
  static async setLastSessionMemoryTimestamp(tsMs) {
    await MemoryStore.updateMeta({ [LAST_SESSION_MEMORY_TS_ATTRIBUTE]: tsMs });
  }

  /**
   * Persists a list of generated memories, tagged with the given source. The
   * unified session watermark is advanced separately by the caller
   * (see {@link setLastSessionMemoryTimestamp}), so this no longer touches
   * MemoryStore.meta.
   *
   * @param {Array<object>|null|undefined} generatedMemories
   *        Array of MemoryPartial-like objects to persist.
   * @returns {Promise<{ persistedMemories: Array<object> }>}
   */
  static async saveMemories(generatedMemories) {
    const persistedMemories = [];

    if (Array.isArray(generatedMemories)) {
      for (const memoryPartial of generatedMemories) {
        const stored = await MemoryStore.addMemory(memoryPartial);
        persistedMemories.push(stored);
      }
    }

    return { persistedMemories };
  }

  /**
   * Adds a single memory based on a user request. Rejects requests with empty
   * summaries or containing personally identifiable information (PII).
   * Unlike saveMemories, this does not advance the conversation/history meta
   * timestamps, so it won't interfere with delta memory generation.
   *
   * @param {string} memorySummary
   * @returns {Promise<{ok: true,  memory: MemoryPartial, action: string} | {ok: false, reason: string}>}
   */
  static async saveRequestedMemory(memorySummary) {
    if (typeof memorySummary !== "string" || !memorySummary.trim()) {
      return { ok: false, reason: "Memory summary is empty." };
    }

    // Hard-truncate independently of the schema's maxLength: the stored summary is
    // later treated as trusted context, so bound any payload that survives.
    const summary = memorySummary.trim().slice(0, MAX_MEMORY_SUMMARY_LENGTH);

    // The chat message that triggered this tool, used as evidence and as a second
    // input to the PII detector.
    const recentUserMessages = await ChatStore.getMostRecentMessages(
      MESSAGE_ROLE.USER,
      1
    );
    const message = recentUserMessages[0]?.content?.body ?? "";

    // Structured PII/financial pattern detection.
    if (
      _sensitiveInfoDetector.containsSensitiveInfo(summary) ||
      _sensitiveInfoDetector.containsSensitiveInfo(message)
    ) {
      return {
        ok: false,
        reason: "Memory contains personally identifiable information.",
      };
    }

    let candidateMemory = {
      memory_summary: summary,
      reasoning: "User requested.",
      evidence: [{ type: "user", value: message }],
      sources: [SOURCE_USER_REQUEST],
    };

    const addedMemory = await MemoryStore.addMemory(candidateMemory);
    return { ok: true, memory: addedMemory, action: "created" };
  }

  /**
   * Enriches an existing memory with classified categories and intents.
   * Intended to be called fire-and-forget after saveRequestedMemory.
   *
   * @param {string} memoryId
   * @param {string} memorySummary
   */
  static async enrichExistingMemory(memoryId, memorySummary) {
    const { categories, intents } =
      await this.memoryClassifyMessage(memorySummary);

    const tags = [];
    if (categories[0]) {
      tags.push(`category:${categories[0]}`);
    }
    if (intents[0]) {
      tags.push(`intent:${intents[0]}`);
    }
    await MemoryStore.updateMemory(memoryId, { tags });
  }

  /**
   * Soft deletes a memory by its ID.
   * Soft deletion sets the memory's `is_deleted` flag to true. This prevents memory getter functions
   * from returning the memory when using default parameters. It does not delete the memory from storage.
   *
   * From the user's perspective, soft-deleted memories will not be used in assistant responses but will still exist in storage.
   *
   * @param {string} memoryId        ID of the memory to soft-delete
   * @returns {Promise<Memory|null>} The soft-deleted memory, or null if not found
   */
  static async softDeleteMemoryById(memoryId) {
    return await MemoryStore.softDeleteMemory(memoryId);
  }

  /**
   * Hard deletes a memory by its ID.
   * Hard deletion permenantly removes the memory from storage entirely. This method should be used
   * by UI to allow users to delete memories they no longer want stored.
   *
   * @param {string} memoryId       ID of the memory to hard-delete
   * @param {string} trigger        What was the trigger (assistant, settings, other)
   * @param {number|null} inUse     Number of memories still applied to the message after removal, or null if not triggered by assistant
   * @returns {Promise<boolean>}    True if the memory was found and deleted, false otherwise
   */
  static async hardDeleteMemoryById(memoryId, trigger, inUse) {
    return await MemoryStore.hardDeleteMemory(memoryId, trigger, inUse);
  }

  /**
   * Classifies a user message into memory categories and intents.
   *
   * @param {string} message                                                        User message to classify
   * @returns {Promise<Map<{categories: Array<string>, intents: Array<string>}>>}}  Categories and intents into which the message was classified
   */
  static async memoryClassifyMessage(message) {
    const conversation = await this.ensureConversationForUsage();
    const { prompt: systemPrompt } = await loadPrompt(
      MODEL_FEATURES.MEMORIES_MESSAGE_CLASSIFICATION_SYSTEM
    );
    const { prompt: userPromptTemplate } = await loadPrompt(
      MODEL_FEATURES.MEMORIES_MESSAGE_CLASSIFICATION_USER
    );
    const userPrompt = await renderPrompt(userPromptTemplate, {
      message,
      categories: getFormattedMemoryAttributeList(CATEGORIES),
      intents: getFormattedMemoryAttributeList(INTENTS),
    });

    conversation.clearMessages();
    conversation.setSystemMessage(systemPrompt);
    conversation.addUserMessage(userPrompt);
    const response = await conversation.run({
      responseFormat: {
        type: "json_schema",
        schema: MEMORIES_MESSAGE_CLASSIFY_SCHEMA,
      },
      fxAccountToken: await openAIEngine.getFxAccountToken(),
    });

    const parsed = parseAndExtractJSON(response, {
      categories: [],
      intents: [],
    });

    if (!parsed.categories || !parsed.intents) {
      return { categories: [], intents: [] };
    }
    return parsed;
  }

  /**
   * Clears the embeddings cache in MemoryStore. Used for testing.
   *
   * @private
   */
  static _clearEmbeddingsCache() {
    MemoryStore._clearEmbeddingsCache();
  }

  /**
   * Public API wrapper around MemoryStore.getRelevantMemories
   *
   * @param {string} message                  User message to find relevant memories for
   * @param {number} topK                     Number of top relevant memories to return (default: 5)
   * @param {number} similarityThreshold      Minimum similarity score (0-1) to include (default: 0.22)
   * @returns {Promise<Array<object>>}        List of relevant memories sorted by similarity
   */
  static async getRelevantMemories(
    message,
    topK = DEFAULT_RELEVANT_MEMORIES_TOP_K,
    similarityThreshold = DEFAULT_RELEVANT_MEMORIES_SIMILARITY_THRESHOLD
  ) {
    return await MemoryStore.getRelevantMemories(
      message,
      topK,
      similarityThreshold
    );
  }

  /**
   * Helper returns true if memories generation from sources (either browsing history / conversation)
   * should be enabled.
   *
   * Gating logic for all schedulers:
   * - browser.smartwindow.enabled pref
   * - memories-from-source specific pref (history / conversation)
   * - ToS consent
   * - browser.smartwindow.firstrun.hasCompleted pref
   * - and whether any AIWindow is currently active
   *
   * If window APIs are not available (or throw), this falls back to false.
   *
   * @param {string} source - either SOURCE_HISTORY or SOURCE_CONVERSATION.
   * @return {boolean}
   */
  static shouldEnableMemoriesFromSchedulers(source) {
    // Pref checks
    const aiWindowEnabled = AIWindow.isAIWindowEnabled();
    let memoriesEnabled;
    if (source === SOURCE_HISTORY) {
      memoriesEnabled = Services.prefs.getBoolPref(
        PREF_GENERATE_MEMORIES_FROM_HISTORY,
        false
      );
    } else if (source === SOURCE_CONVERSATION) {
      memoriesEnabled = Services.prefs.getBoolPref(
        PREF_GENERATE_MEMORIES_FROM_CONVERSATION,
        false
      );
    } else {
      throw new TypeError(
        `Invalid source passed to shouldEnableMemoriesFromSchedulers: ${source}`
      );
    }

    const hasConsent = AIWindowAccountAuth.hasToSConsent;

    const hasFirstrunCompleted = Services.prefs.getBoolPref(
      PREF_FIRSTRUN_HAS_COMPLETED,
      false
    );

    if (
      !aiWindowEnabled ||
      !memoriesEnabled ||
      !hasConsent ||
      !hasFirstrunCompleted
    ) {
      return false;
    }

    // Window/activity gate (fail closed)
    try {
      return EveryWindow.readyWindows.some(win =>
        AIWindow.isAIWindowActive(win)
      );
    } catch (e) {
      // If we cannot check window state, do NOT enable schedulers.
      return false;
    }
  }

  /**
   * Count recent history visits.
   * Thin wrapper around MemoriesHistorySource.countRecentVisits for callers/tests.
   *
   * @param {object} opts
   * @returns {Promise<number>}
   */
  static async countRecentVisits(opts = {}) {
    return await countRecentVisits(opts);
  }
}
