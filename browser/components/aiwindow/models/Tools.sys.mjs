/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * This file contains LLM tool abscrations and tool definitions.
 */

import { searchBrowsingHistory as implSearchBrowsingHistory } from "moz-src:///browser/components/aiwindow/models/SearchBrowsingHistory.sys.mjs";

// const SEARCH_BROWSING_HISTORY = "search_browsing_history";

// const TOOLS = [SEARCH_BROWSING_HISTORY];

// const toolsConfig = [
//   {
//     type: "function",
//     function: {
//       name: SEARCH_BROWSING_HISTORY,
//       description:
//         "Search the user's browser history stored in sqlite-vec using an embedding model. If a search term is provided, performs vector search and ranks by semantic distance with frecency tie-breaks. If no search term is provided, returns the most relevant pages within a time window ranked by recency and frecency. Supports optional time range filtering using ISO 8601 datetime strings. This is to find previously visited pages related to specific keywords or topics. This helps find relevant pages the user has visited before, even if they're not currently open. All datetime must be before the user's current datetime. For parsing time window from dates and holidays, must depend on the user's current datetime, timezone, and locale.",
//       parameters: {
//         type: "object",
//         properties: {
//           searchTerm: {
//             type: "string",
//             description:
//               "A detailed, noun-heavy phrase (~5-12 meaningful tokens) summarizing the user's intent for semantic retrieval. Include the main entity/topic plus 1-3 contextual qualifiers (e.g., library name, purpose, site, or timeframe). Avoid vague or single-word queries.",
//           },
//           startTs: {
//             type: "string",
//             description:
//               "Inclusive lower bound of the time window as an ISO 8601 datetime string (e.g., '2025-11-07T09:00:00-05:00'). Use when the user asks for results within a time or range start, such as 'last week', 'since yesterday', or 'last night'. This must be before the user's current datetime.",
//             default: null,
//           },
//           endTs: {
//             type: "string",
//             description:
//               "Inclusive upper bound of the time window as an ISO 8601 datetime string (e.g., '2025-11-07T21:00:00-05:00'). Use when the user asks for results within a time or range end, such as 'last week', 'between 2025-10-01 and 2025-10-31', or 'before Monday'. This must be before the user's current datetime.",
//             default: null,
//           },
//         },
//         required: [],
//       },
//     },
//   },
// ];

/**
 * Tool entrypoint for browsing history search.
 *
 * Parameters (defaults shown):
 * - searchTerm: ""        - string used for search
 * - startTs: null         - ISO timestamp lower bound, or null
 * - endTs: null           - ISO timestamp upper bound, or null
 * - historyLimit: 15      - max number of results
 *
 * Detailed behavior and implementation are in SearchBrowsingHistory.sys.mjs.
 *
 * @param {object} params
 *  The search parameters.
 * @param {string} params.searchTerm
 *  The search string. If null or empty, semantic search is skipped and
 *  results are filtered by time range and sorted by last_visit_date and frecency.
 * @param {string|null} params.startTs
 *  Optional ISO-8601 start timestamp (e.g. "2025-11-07T09:00:00-05:00").
 * @param {string|null} params.endTs
 *  Optional ISO-8601 end timestamp (e.g. "2025-11-07T09:00:00-05:00").
 * @param {number} params.historyLimit
 *  Maximum number of history results to return.
 * @returns {Promise<object>}
 *  A promise resolving to an object with the search term and history results.
 *  Includes `count` when matches exist, a `message` when none are found, or an
 *  `error` string on failure.
 */
export async function searchBrowsingHistory({
  searchTerm = "",
  startTs = null,
  endTs = null,
  historyLimit = 15,
}) {
  return implSearchBrowsingHistory({
    searchTerm,
    startTs,
    endTs,
    historyLimit,
  });
}

/**
 * Strips heavy or unnecessary fields from a browser history search result.
 *
 * @param {string} result
 *  A JSON string representing the history search response.
 * @returns {string}
 *  The sanitized JSON string with large fields (e.g., favicon, thumbnail)
 *  removed, or the original string if parsing fails.
 */
export function stripSearchBrowsingHistoryFields(result) {
  try {
    const data = JSON.parse(result);
    if (
      data.error ||
      !Array.isArray(data.results) ||
      data.results.length === 0
    ) {
      return result;
    }

    // Remove large or unnecessary fields to save tokens
    const OMIT_KEYS = ["favicon", "thumbnail"];
    for (const item of data.results) {
      if (item && typeof item === "object") {
        for (const k of OMIT_KEYS) {
          delete item[k];
        }
      }
    }
    return JSON.stringify(data);
  } catch {
    return result;
  }
}
