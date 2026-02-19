/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  getRecentHistory,
  sessionizeVisits,
  generateProfileInputs,
  aggregateSessions,
  topkAggregates,
} from "moz-src:///browser/components/aiwindow/models/memories/MemoriesHistorySource.sys.mjs";
import { getRecentChats } from "./MemoriesChatSource.sys.mjs";
import {
  DEFAULT_ENGINE_ID,
  MODEL_FEATURES,
  openAIEngine,
  renderPrompt,
  SERVICE_TYPES,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { MemoryStore } from "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs";
import {
  CATEGORIES,
  INTENTS,
  HISTORY as SOURCE_HISTORY,
  CONVERSATION as SOURCE_CONVERSATION,
} from "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs";
import {
  getFormattedMemoryAttributeList,
  parseAndExtractJSON,
  generateMemories,
} from "moz-src:///browser/components/aiwindow/models/memories/Memories.sys.mjs";
import {
  messageMemoryClassificationSystemPrompt,
  messageMemoryClassificationPrompt,
} from "moz-src:///browser/components/aiwindow/models/prompts/MemoriesPrompts.sys.mjs";
import { MEMORIES_MESSAGE_CLASSIFY_SCHEMA } from "moz-src:///browser/components/aiwindow/models/memories/MemoriesSchemas.sys.mjs";

const K_DOMAINS_FULL = 100;
const K_TITLES_FULL = 60;
const K_SEARCHES_FULL = 10;
const K_DOMAINS_DELTA = 30;
const K_TITLES_DELTA = 60;
const K_SEARCHES_DELTA = 10;

const DEFAULT_HISTORY_FULL_LOOKUP_DAYS = 60;
const DEFAULT_HISTORY_FULL_MAX_RESULTS = 3000;
const DEFAULT_HISTORY_DELTA_MAX_RESULTS = 500;
const DEFAULT_CHAT_FULL_MAX_RESULTS = 50;
const DEFAULT_CHAT_HALF_LIFE_DAYS_FULL_RESULTS = 7;

const LAST_HISTORY_MEMORY_TS_ATTRIBUTE = "last_history_memory_ts";
const LAST_CONVERSATION_MEMORY_TS_ATTRIBUTE = "last_chat_memory_ts";
/**
 * MemoriesManager class
 */
export class MemoriesManager {
  static #openAIEnginePromise = null;

  // Exposed to be stubbed for testing
  static _getRecentChats = getRecentChats;

  /**
   * Creates and returns an class-level openAIEngine instance if one has not already been created.
   * This current pulls from the general browser.aiwindow.* prefs, but will likely pull from memories-specific ones in the future
   *
   * @returns {Promise<openAIEngine>}  openAIEngine instance
   */
  static async ensureOpenAIEngine() {
    if (!this.#openAIEnginePromise) {
      this.#openAIEnginePromise = await openAIEngine.build(
        MODEL_FEATURES.MEMORIES,
        DEFAULT_ENGINE_ID,
        SERVICE_TYPES.MEMORIES
      );
    }
    return this.#openAIEnginePromise;
  }

  /**
   * Generates, saves, and returns memories from pre-computed sources
   *
   * @param {object} sources      User data source type to aggregrated records (i.e., {history: [domainItems, titleItems, searchItems]})
   * @param {string} sourceName   Specific source type from which memories are generated ("history" or "conversation")
   * @returns {Promise<Memory[]>}
   *          A promise that resolves to the list of persisted memories
   *          (newly created or updated), sorted and shaped as returned by
   *          {@link MemoryStore.addMemory}.
   */
  static async generateAndSaveMemoriesFromSources(sources, sourceName) {
    const now = Date.now();
    const existingMemories = await this.getAllMemories();
    const existingMemoriesSummaries = existingMemories.map(
      i => i.memory_summary
    );
    const engine = await this.ensureOpenAIEngine();
    const memories = await generateMemories(
      engine,
      sources,
      existingMemoriesSummaries
    );
    const { persistedMemories } = await this.saveMemories(
      memories,
      sourceName,
      now
    );
    return persistedMemories;
  }

  /**
   * Generates and persists memories derived from the user's recent browsing history.
   *
   * This method:
   *  1. Reads {@link last_history_memory_ts} via {@link getLastHistoryMemoryTimestamp}.
   *  2. Decides between:
   *     - Full processing (first run, no prior timestamp):
   *         * Uses a days-based cutoff (DEFAULT_HISTORY_FULL_LOOKUP_DAYS).
   *         * Uses max-results cap (DEFAULT_HISTORY_FULL_MAX_RESULTS).
   *         * Uses full top-k settings (K_DOMAINS_FULL, K_TITLES_FULL, K_SEARCHES_FULL).
   *     - Delta processing (subsequent runs, prior timestamp present):
   *         * Uses an absolute cutoff via `sinceMicros = lastTsMs * 1000`.
   *         * Uses a smaller max-results cap (DEFAULT_HISTORY_DELTA_MAX_RESULTS).
   *         * Uses delta top-k settings (K_DOMAINS_DELTA, K_TITLES_DELTA, K_SEARCHES_DELTA).
   *  3. Calls {@link getAggregatedBrowserHistory} with the computed options to obtain
   *     domain, title, and search aggregates.
   *  4. Calls {@link generateAndSaveMemoriesFromSources} with retrieved history to generate and save new memories.
   *
   * @returns {Promise<Memory[]>}
   *          A promise that resolves to the list of persisted history memories
   *          (newly created or updated), sorted and shaped as returned by
   *          {@link MemoryStore.addMemory}.
   */
  static async generateMemoriesFromBrowsingHistory() {
    const now = Date.now();
    // get last history memory timestamp in ms
    const lastTsMs = await this.getLastHistoryMemoryTimestamp();
    const isDelta = typeof lastTsMs === "number" && lastTsMs > 0;
    // set up the options based on delta or full (first) run
    let recentHistoryOpts = {};
    let topkAggregatesOpts;
    if (isDelta) {
      recentHistoryOpts = {
        sinceMicros: lastTsMs * 1000,
        maxResults: DEFAULT_HISTORY_DELTA_MAX_RESULTS,
      };
      topkAggregatesOpts = {
        k_domains: K_DOMAINS_DELTA,
        k_titles: K_TITLES_DELTA,
        k_searches: K_SEARCHES_DELTA,
        now,
      };
    } else {
      recentHistoryOpts = {
        days: DEFAULT_HISTORY_FULL_LOOKUP_DAYS,
        maxResults: DEFAULT_HISTORY_FULL_MAX_RESULTS,
      };
      topkAggregatesOpts = {
        k_domains: K_DOMAINS_FULL,
        k_titles: K_TITLES_FULL,
        k_searches: K_SEARCHES_FULL,
        now,
      };
    }

    const [domainItems, titleItems, searchItems] =
      await this.getAggregatedBrowserHistory(
        recentHistoryOpts,
        topkAggregatesOpts
      );
    const sources = { history: [domainItems, titleItems, searchItems] };
    return await this.generateAndSaveMemoriesFromSources(
      sources,
      SOURCE_HISTORY
    );
  }

  /**
   * Generates and persists memories derived from the user's recent chat history.
   *
   * This method:
   *  1. Reads {@link last_chat_memory_ts} via {@link getLastConversationMemoryTimestamp}.
   *  2. Decides between:
   *     - Full processing (first run, no prior timestamp):
   *         * Pulls all messages from the beginning of time.
   *     - Delta processing (subsequent runs, prior timestamp present):
   *         * Pulls all messages since the last timestamp.
   *  3. Calls {@link getRecentChats} with the computed options to obtain messages.
   *  4. Calls {@link generateAndSaveMemoriesFromSources} with messages to generate and save new memories.
   *
   * @returns {Promise<Memory[]>}
   *          A promise that resolves to the list of persisted conversation memories
   *          (newly created or updated), sorted and shaped as returned by
   *          {@link MemoryStore.addMemory}.
   */
  static async generateMemoriesFromConversationHistory() {
    // get last chat memory timestamp in ms
    const lastTsMs = await this.getLastConversationMemoryTimestamp();
    const isDelta = typeof lastTsMs === "number" && lastTsMs > 0;

    let startTime = 0;

    // If this is a subsequent run, set startTime to lastTsMs, the last time we generated chat-based memories
    if (isDelta) {
      startTime = lastTsMs;
    }

    const chatMessages = await this._getRecentChats(
      startTime,
      DEFAULT_CHAT_FULL_MAX_RESULTS,
      DEFAULT_CHAT_HALF_LIFE_DAYS_FULL_RESULTS
    );
    const sources = { conversation: chatMessages };
    return await this.generateAndSaveMemoriesFromSources(
      sources,
      SOURCE_CONVERSATION
    );
  }

  /**
   * Retrieves and aggregates recent browser history into top-k domain, title, and search aggregates.
   *
   * @param {object} [recentHistoryOpts={}]
   * @param {number} [recentHistoryOpts.sinceMicros=null]
   *        Optional absolute cutoff in microseconds since epoch (Places
   *        visit_date). If provided, this is used directly as the cutoff:
   *        only visits with `visit_date >= sinceMicros` are returned.
   *
   *        This is the recommended way to implement incremental reads:
   *        store the max `visitDateMicros` from the previous run and pass
   *        it (or max + 1) back in as `sinceMicros`.
   *
   * @param {number} [recentHistoryOpts.days=DEFAULT_DAYS]
   *        How far back to look if `sinceMicros` is not provided.
   *        The cutoff is computed as:
   *          cutoff = now() - days * MS_PER_DAY
   *
   *        Ignored when `sinceMicros` is non-null.
   *
   * @param {number} [recentHistoryOpts.maxResults=DEFAULT_MAX_RESULTS]
   *        Maximum number of rows to return from the SQL query (after
   *        sorting by most recent visit). Note that this caps the number
   *        of visits, not distinct URLs.
   * @param {object} [topkAggregatesOpts]
   * @param {number} [topkAggregatesOpts.k_domains=30]    Max number of domain aggregates to return
   * @param {number} [topkAggregatesOpts.k_titles=60]     Max number of title aggregates to return
   * @param {number} [topkAggregatesOpts.k_searches=10]   Max number of search aggregates to return
   * @param {number} [topkAggregatesOpts.now]             Current time; seconds or ms, normalized internally.}
   * @returns {Promise<[Array, Array, Array]>}            Top-k domain, title, and search aggregates
   */
  static async getAggregatedBrowserHistory(
    recentHistoryOpts = {},
    topkAggregatesOpts = {
      k_domains: K_DOMAINS_DELTA,
      k_titles: K_TITLES_DELTA,
      k_searches: K_SEARCHES_DELTA,
      now: undefined,
    }
  ) {
    const recentVisitRecords = await getRecentHistory(recentHistoryOpts);
    const sessionized = sessionizeVisits(recentVisitRecords);
    const profilePreparedInputs = generateProfileInputs(sessionized);
    const [domainAgg, titleAgg, searchAgg] = aggregateSessions(
      profilePreparedInputs
    );

    return await topkAggregates(
      domainAgg,
      titleAgg,
      searchAgg,
      topkAggregatesOpts
    );
  }

  /**
   * Retrieves all stored memories.
   * This is a quick-access wrapper around MemoryStore.getMemories() with no additional processing.
   *
   * @param {object} [opts={}]
   * @param {boolean} [opts.includeSoftDeleted=false]
   *        Whether to include soft-deleted memories.
   * @returns {Promise<Array<Map<{
   *  memory_summary: string,
   *  category: string,
   *  intent: string,
   *  score: number,
   * }>>>}                                    List of memories
   */
  static async getAllMemories(opts = { includeSoftDeleted: false }) {
    return await MemoryStore.getMemories(opts);
  }

  /**
   * Returns the last timestamp (in ms since Unix epoch) when a history-based
   * memory was generated, as persisted in MemoryStore.meta.
   *
   * If the store has never been updated, this returns 0.
   *
   * @returns {Promise<number>}  Milliseconds since Unix epoch
   */
  static async getLastHistoryMemoryTimestamp() {
    const meta = await MemoryStore.getMeta();
    return meta.last_history_memory_ts || 0;
  }

  /**
   * Returns the last timestamp (in ms since Unix epoch) when a chat-based
   * memory was generated, as persisted in MemoryStore.meta.
   *
   * If the store has never been updated, this returns 0.
   *
   * @returns {Promise<number>}  Milliseconds since Unix epoch
   */
  static async getLastConversationMemoryTimestamp() {
    const meta = await MemoryStore.getMeta();
    return meta.last_chat_memory_ts || 0;
  }

  /**
   * Persist a list of generated memories and update the appropriate meta timestamp.
   *
   * @param {Array<object>|null|undefined} generatedMemories
   *        Array of MemoryPartial-like objects to persist.
   * @param {"history"|"conversation"} source
   *        Source of these memories; controls which meta timestamp to update.
   * @param {number} [nowMs=Date.now()]
   *        Optional "now" timestamp in ms, for meta update fallback.
   *
   * @returns {Promise<{ persistedMemories: Array<object>, newTimestampMs: number | null }>}
   */
  static async saveMemories(generatedMemories, source, nowMs = Date.now()) {
    const persistedMemories = [];

    if (Array.isArray(generatedMemories)) {
      for (const memoryPartial of generatedMemories) {
        const stored = await MemoryStore.addMemory(memoryPartial);
        persistedMemories.push(stored);
      }
    }

    // Decide which meta field to update
    let metaKey;
    if (source === SOURCE_HISTORY) {
      metaKey = LAST_HISTORY_MEMORY_TS_ATTRIBUTE;
    } else if (source === SOURCE_CONVERSATION) {
      metaKey = LAST_CONVERSATION_MEMORY_TS_ATTRIBUTE;
    } else {
      // Unknown source: don't update meta, just return persisted results.
      return {
        persistedMemories,
        newTimestampMs: null,
      };
    }

    // Compute new timestamp: prefer max(updated_at) if present, otherwise fall back to nowMs.
    let newTsMs = nowMs;
    if (persistedMemories.length) {
      const maxUpdated = persistedMemories.reduce(
        (max, i) => Math.max(max, i.updated_at ?? 0),
        0
      );
      if (maxUpdated > 0) {
        newTsMs = maxUpdated;
      }
    }

    await MemoryStore.updateMeta({
      [metaKey]: newTsMs,
    });

    return {
      persistedMemories,
      newTimestampMs: newTsMs,
    };
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
   * @param {string} memoryId        ID of the memory to hard-delete
   * @returns {Promise<boolean>}      True if the memory was found and deleted, false otherwise
   */
  static async hardDeleteMemoryById(memoryId) {
    return await MemoryStore.hardDeleteMemory(memoryId);
  }

  /**
   * Builds the prompt to classify a user message into memory categories and intents.
   *
   * @param {string} message          User message to classify
   * @returns {Promise<string>}       Prompt string to send to LLM for classifying the message
   */
  static async buildMessageMemoryClassificationPrompt(message) {
    const categories = getFormattedMemoryAttributeList(CATEGORIES);
    const intents = getFormattedMemoryAttributeList(INTENTS);

    return await renderPrompt(messageMemoryClassificationPrompt, {
      message,
      categories,
      intents,
    });
  }

  /**
   * Classifies a user message into memory categories and intents.
   *
   * @param {string} message                                                        User message to classify
   * @returns {Promise<Map<{categories: Array<string>, intents: Array<string>}>>}}  Categories and intents into which the message was classified
   */
  static async memoryClassifyMessage(message) {
    const messageClassifPrompt =
      await this.buildMessageMemoryClassificationPrompt(message);

    const engine = await this.ensureOpenAIEngine();

    const response = await engine.run({
      args: [
        { role: "system", content: messageMemoryClassificationSystemPrompt },
        { role: "user", content: messageClassifPrompt },
      ],
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
   * Fetches relevant memories for a given user message.
   *
   * @param {string} message                  User message to find relevant memories for
   * @returns {Promise<Array<Map<{
   *  memory_summary: string,
   *  category: string,
   *  intent: string,
   *  score: number,
   * }>>>}                                    List of relevant memories
   */
  static async getRelevantMemories(message) {
    const existingMemories = await MemoriesManager.getAllMemories();
    // Shortcut: if there aren't any existing memories, return empty list immediately
    if (existingMemories.length === 0) {
      return [];
    }

    const messageClassification =
      await MemoriesManager.memoryClassifyMessage(message);
    // Shortcut: if the message's category and/or intent is null, return empty list immediately
    if (!messageClassification.categories || !messageClassification.intents) {
      return [];
    }

    // Filter existing memories to those that match the message's category
    const candidateRelevantMemories = existingMemories.filter(memory => {
      return messageClassification.categories.includes(memory.category);
    });

    return candidateRelevantMemories;
  }
}
