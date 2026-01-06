/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Implementation of all the disk I/O required by the Insight store
 */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

/**
 * InsightStore
 *
 * In-memory JSON state + persisted JSON file, modeled after SessionStore.
 *
 * File format (on disk):
 * {
 *   "insights": [ { ... } ],
 *   "meta": {
 *     "last_history_insight_ts": 0,
 *     "last_chat_insight_ts": 0,
 *   },
 *   "version": 1
 * }
 */

const INSIGHT_STORE_FILE = "insights.json.lz4";
const INSIGHT_STORE_VERSION = 1;

// In-memory state
let gState = {
  insights: [],
  meta: {
    last_history_insight_ts: 0,
    last_chat_insight_ts: 0,
  },
  version: INSIGHT_STORE_VERSION,
};

// Whether we've finished initial load
let gInitialized = false;
let lazy = {};
let gInitPromise = null;
let gJSONFile = null;

// Where we store the file (choose something similar to sessionstore)
ChromeUtils.defineLazyGetter(lazy, "gStorePath", () => {
  const profD = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
  return PathUtils.join(profD, INSIGHT_STORE_FILE);
});

/**
 * Internal helper to load (and possibly migrate) insight data from disk.
 *
 * @returns {Promise<void>}
 */
async function loadInsights() {
  gJSONFile = new JSONFile({
    path: lazy.gStorePath,
    saveDelayMs: 1000,
    compression: "lz4",
    sanitizedBasename: "insights",
  });

  try {
    await gJSONFile.load();
  } catch (ex) {
    console.error("InsightStore: failed to load state", ex);
    // If load fails, fall back to default gState.
    gJSONFile.data = gState;
    gInitialized = true;
    return;
  }

  // Normalize the loaded data into our expected shape.
  const data = gJSONFile.data;
  if (!data || typeof data !== "object") {
    gJSONFile.data = gState;
  } else {
    gState = {
      insights: Array.isArray(data.insights) ? data.insights : [],
      meta: {
        last_history_insight_ts: data.meta?.last_history_insight_ts || 0,
        last_chat_insight_ts: data.meta?.last_chat_insight_ts || 0,
      },
      version:
        typeof data.version === "number" ? data.version : INSIGHT_STORE_VERSION,
    };
    // Ensure JSONFile.data points at our normalized state object.
    gJSONFile.data = gState;
  }

  gInitialized = true;
}

// Public API object
export const InsightStore = {
  /**
   * Initialize the store: set up JSONFile and load from disk.
   *
   * @returns {Promise<void>}
   */
  async ensureInitialized() {
    if (gInitialized) {
      return;
    }

    if (!gInitPromise) {
      gInitPromise = loadInsights();
    }

    await gInitPromise;
  },

  /**
   * Force writing current in-memory state to disk immediately.
   *
   * This is intended for test only.
   */
  async testOnlyFlush() {
    await this.ensureInitialized();
    if (!gJSONFile) {
      return;
    }
    await gJSONFile._save();
  },

  /**
   * @typedef {object} Insight
   * @property {string} id - Unique identifier for the insight.
   * @property {string} insight_summary - Short human-readable summary of the insight.
   * @property {string} category - Category label for the insight.
   * @property {string} intent - Intent label associated with the insight.
   * @property {number} score - Numeric score representing the insight's relevance.
   * @property {number} updated_at - Last-updated time in milliseconds since Unix epoch.
   * @property {boolean} is_deleted - Whether the insight is marked as deleted.
   */
  /**
   * @typedef {object} InsightPartial
   * @property {string} [id] Optional identifier; if omitted, one is derived by makeInsightId.
   * @property {string} [insight_summary] Optional summary; defaults to an empty string.
   * @property {string} [category] Optional category label; defaults to an empty string.
   * @property {string} [intent] Optional intent label; defaults to an empty string.
   * @property {number} [score] Optional numeric score; non-finite values are ignored.
   * @property {number} [updated_at] Optional last-updated time in milliseconds since Unix epoch.
   * @property {boolean} [is_deleted] Optional deleted flag; defaults to false.
   */
  /**
   * Add a new insight, or update an existing one with the same id.
   *
   * Any missing fields on {@link InsightPartial} are defaulted.
   *
   * @param {InsightPartial} insightPartial
   * @returns {Promise<Insight>}
   */
  async addInsight(insightPartial) {
    await this.ensureInitialized();

    const now = Date.now();
    const id = makeInsightId(insightPartial);

    let insight = gState.insights.find(i => i.id === id);

    if (insight) {
      const simpleProperties = ["insight_summary", "category", "intent"];
      for (const prop of simpleProperties) {
        if (prop in insightPartial) {
          insight[prop] = insightPartial[prop];
        }
      }

      const validatedProperties = [
        ["score", v => Number.isFinite(v)],
        ["is_deleted", v => typeof v === "boolean"],
      ];

      for (const [prop, validator] of validatedProperties) {
        if (prop in insightPartial && validator(insightPartial[prop])) {
          insight[prop] = insightPartial[prop];
        }
      }

      insight.updated_at = insightPartial.updated_at || now;

      gJSONFile?.saveSoon();
      return insight;
    }

    // Otherwise create a new one
    insight = {
      id,
      insight_summary: insightPartial.insight_summary || "",
      category: insightPartial.category || "",
      intent: insightPartial.intent || "",
      score: Number.isFinite(insightPartial.score) ? insightPartial.score : 0,
      updated_at: insightPartial.updated_at || now,
      is_deleted: insightPartial.is_deleted ?? false,
    };

    gState.insights.push(insight);
    gJSONFile?.saveSoon();
    return insight;
  },

  /**
   * Update an existing insight by id.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {Promise<Insight|null>}
   */
  async updateInsight(id, updates) {
    await this.ensureInitialized();

    const insight = gState.insights.find(i => i.id === id);
    if (!insight) {
      return null;
    }

    const simpleProperties = ["insight_summary", "category", "intent"];
    for (const prop of simpleProperties) {
      if (prop in updates) {
        insight[prop] = updates[prop];
      }
    }

    const validatedProperties = [
      ["score", v => Number.isFinite(v)],
      ["is_deleted", v => typeof v === "boolean"],
    ];

    for (const [prop, validator] of validatedProperties) {
      if (prop in updates && validator(updates[prop])) {
        insight[prop] = updates[prop];
      }
    }

    insight.updated_at = updates.updated_at || Date.now();

    gJSONFile?.saveSoon();
    return insight;
  },

  /**
   * Soft delete an insight (set is_deleted = true).
   *
   *  soft deleted insights will be filtered from getInsights
   *
   * @param {string} id
   * @returns {Promise<Insight|null>}
   */
  async softDeleteInsight(id) {
    return this.updateInsight(id, { is_deleted: true });
  },

  /**
   * hard delete (remove from array).
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async hardDeleteInsight(id) {
    await this.ensureInitialized();
    const idx = gState.insights.findIndex(i => i.id === id);
    if (idx === -1) {
      return false;
    }
    gState.insights.splice(idx, 1);
    gJSONFile?.saveSoon();
    return true;
  },

  /**
   * Get all insights (optionally filtered and sorted).
   *
   * @param {object} [options]
   *   Optional sorting options.
   * @param {"score"|"updated_at"} [options.sortBy="updated_at"]
   *   Field to sort by.
   * @param {"asc"|"desc"} [options.sortDir="desc"]
   *   Sort direction.
   * @returns {Promise<Insight[]>}
   */
  async getInsights({ sortBy = "updated_at", sortDir = "desc" } = {}) {
    await this.ensureInitialized();

    let res = gState.insights;
    res = res.filter(i => !i.is_deleted);

    if (sortBy) {
      res = [...res].sort((a, b) => {
        const av = a[sortBy] ?? 0;
        const bv = b[sortBy] ?? 0;
        if (av === bv) {
          return 0;
        }
        const cmp = av < bv ? -1 : 1;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return res;
  },

  /**
   * Get current meta block.
   *
   * @returns {Promise<object>}
   */
  async getMeta() {
    await this.ensureInitialized();
    return structuredClone(gState.meta);
  },

  /**
   * Update meta information (last timestamps, top_* info, etc).
   *
   * Example payload:
   * {
   * last_history_insight_ts: 12345,
   * }
   *
   * @param {object} partialMeta
   * @returns {Promise<void>}
   */
  async updateMeta(partialMeta) {
    await this.ensureInitialized();
    const meta = gState.meta;
    const validatedProps = [
      ["last_history_insight_ts", v => Number.isFinite(v)],
      ["last_chat_insight_ts", v => Number.isFinite(v)],
    ];

    for (const [prop, validator] of validatedProps) {
      if (prop in partialMeta && validator(partialMeta[prop])) {
        meta[prop] = partialMeta[prop];
      }
    }

    gJSONFile?.saveSoon();
  },
};

/**
 * Simple deterministic hash of a string → 8-char hex.
 * Based on a 32-bit FNV-1a-like hash.
 *
 * @param {string} str
 * @returns {string}
 */
function hashStringToHex(str) {
  // FNV offset basis
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime, keep 32-bit
    hash = (hash * 0x01000193) >>> 0;
  }
  // Convert to 8-digit hex
  return hash.toString(16).padStart(8, "0");
}

/**
 * Build a deterministic insight id from its core fields.
 * If the caller passes an explicit id, we honor that instead.
 *
 * @param {object} insightPartial
 */
function makeInsightId(insightPartial) {
  if (insightPartial.id) {
    return insightPartial.id;
  }

  const summary = (insightPartial.insight_summary || "").trim().toLowerCase();
  const category = (insightPartial.category || "").trim().toLowerCase();
  const intent = (insightPartial.intent || "").trim().toLowerCase();

  const key = `${summary}||${category}||${intent}`;
  const hex = hashStringToHex(key);

  return `ins-${hex}`;
}
