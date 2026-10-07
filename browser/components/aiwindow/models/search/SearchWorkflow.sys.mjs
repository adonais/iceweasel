/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Self-contained flow backing the search_the_web tool. Two paths, selected by
 * SEARCH_THE_WEB_FAST_PREF:
 *
 * - Grounded (pref off, the default): one Exa retrieval, an on-demand page-read
 *   loop (bounded), grounded answer generation on a pinned model, and a non-LLM
 *   schema validation.
 * - Fast (pref on): one Exa retrieval whose sanitized snippets go straight back
 *   to the main assistant, which answers from them or reads a page itself.
 *
 * Either way the main assistant uses the result to decide whether to answer in
 * chat or fall back to a Google handoff. The two paths are deliberately kept as
 * separate entrypoints so that whichever one loses can be deleted whole. All
 * the logic lives here as functions — there is no separate agent object because
 * there is no state to carry between calls.
 */

/**
 * @import { ChatConversation } from "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
 */

import {
  renderPrompt,
  MODEL_FEATURES,
  parseAndExtractJSON,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { sanitizeUntrustedContent } from "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import { ExaSearchProvider } from "moz-src:///browser/components/aiwindow/models/search/SearchProviders.sys.mjs";
import {
  GetPageContent,
  GET_PAGE_CONTENT,
  SEARCH_THE_WEB_FAST_PREF,
} from "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "WebSearchFlow",
    maxLogLevelPref: "browser.smartwindow.conversation.logLevel",
  })
);
ChromeUtils.defineESModuleGetters(lazy, {
  buildConversation:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  loadPrompt:
    "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  JsonSchema: "resource://gre/modules/JsonSchema.sys.mjs",
});

// Total result pages that may be read in a turn (the V0 "up to 3" cap).
const MAX_PAGES = 3;

// Max generation rounds that may issue a page read. Bounds the loop
// independently of MAX_PAGES so a round requesting several URLs still counts
// against the page cap, not the round cap.
const MAX_READ_ROUNDS = 3;

// Max time to wait for a single page-read batch before falling back. A slow or
// hanging page must not stall the whole search, so on timeout we tell the model
// to answer with what it already has. Pref-backed so tests can shrink it.
const READ_TIMEOUT_PREF = "browser.smartwindow.search.readTimeoutMs";
const READ_TIMEOUT_DEFAULT_MS = 15000;

// Fast path only. Over-fetch so that dropping results with a bad URL or no
// snippet still leaves a full set. What the assistant gets back is deliberately
// small: it answers from the snippets and reads a page itself when it needs
// more.
const MAX_RESULTS_RETRIEVED = 5;
const MAX_RESULTS_RETURNED = 3;

// Per-snippet character cap, mirroring how GetPageContent owns its own
// MAX_CHARACTERS for extracted page text.
const MAX_SNIPPET_LENGTH = 2000;

// Shorter than this and the snippet is a stub ("Sign in", "404") with nothing
// for the assistant to answer from, so the result is dropped.
const MIN_SNIPPET_LENGTH = 25;

/**
 * Canonical values for the `error` extra on the search_the_web Glean event
 * that the fast path decides for itself. A retrieval failure instead reports
 * the provider's `searchErrorCategory`, falling back to RETRIEVAL_FAILED.
 *
 * @type {object}
 */
const SEARCH_TELEMETRY_ERRORS = {
  INVALID_QUERY: "invalid_query",
  RETRIEVAL_FAILED: "retrieval_failed",
  NO_RESULTS: "no_results",
  INTERNAL_ERROR: "internal_error",
};

/**
 * JSON schema describing the structured answer the model emits. Used both as
 * the model's response format and as the contract validateSearchAnswer checks.
 *
 * @type {object}
 */
export const SEARCH_ANSWER_SCHEMA = {
  name: "SearchAnswer",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer", "could_answer", "confidence"],
    properties: {
      answer: { type: "string" },
      could_answer: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  },
};

/**
 * Page-read tool offered to the model.
 *
 * NOTE: intentionally a result-id variant of get_page_content. Results are
 * shown to the model with short ids (result_1, result_2, …) and the model
 * passes those ids back rather than full URLs, which models reproduce
 * unreliably. Ids are mapped back to URLs before fetching. Do NOT replace this
 * with the canonical token-based config — the parameter semantics differ.
 *
 * @type {object}
 */
const GET_PAGE_CONTENT_TOOL = {
  type: "function",
  function: {
    name: GET_PAGE_CONTENT,
    description:
      "Read the full text of one or more web pages from the provided search " +
      "results. Reference results by their id (for example result_1).",
    parameters: {
      type: "object",
      properties: {
        result_ids: {
          type: "array",
          items: {
            type: "string",
            description:
              "A result id shown in the search results, for example result_1.",
          },
          minItems: 1,
          description: "List of result ids to read.",
        },
      },
      required: ["result_ids"],
    },
  },
};

/**
 * One web search result passed to the model.
 *
 * @typedef {object} SearchResult
 * @property {string} title - Result title.
 * @property {string} url - Result URL.
 * @property {string} snippet - Short text excerpt for the result.
 */

/**
 * The structured result returned to the main assistant by the grounded path.
 *
 * @typedef {object} SearchWorkflowResult
 * @property {string} answer - Grounded answer text (empty on failure).
 * @property {boolean} could_answer - Model self-assessment of sufficiency.
 * @property {number} confidence - Calibrated confidence in [0, 1].
 * @property {string[]} searched_urls - URLs Exa returned (code-tracked).
 * @property {string[]} read_urls - URLs the flow actually fetched (code-tracked).
 * @property {boolean} requiresSearchHandoff - Boolean indicating whether to route to search handoff
 * @property {string} [error] - Present when the flow could not run.
 */

/**
 * The structured result returned to the main assistant by the fast path.
 *
 * @typedef {object} FastSearchWorkflowResult
 * @property {SearchResult[]} results - Sanitized Exa results (empty on failure).
 * @property {boolean} requiresSearchHandoff - Whether to route to search handoff.
 * @property {string} [error] - Present when the flow could not run.
 */

/**
 * Stage measurements for one run of the fast path, accumulated in a single
 * mutable object so whatever completed before a failure is still reported.
 *
 * @typedef {object} FastSearchStats
 * @property {number} retrieval - Provider call to results returned, in ms.
 * @property {number} processing - Filtering, sanitizing and bookkeeping, in ms.
 * @property {number} retrieved - Usable results the provider returned.
 * @property {number} returned - Results handed to the assistant.
 * @property {number} snippetChars - Snippet characters handed to the assistant.
 * @property {number} snippetCharsDropped - Snippet characters cut by the cap.
 * @property {number} httpStatus - Exa HTTP status, 0 when no response arrived.
 * @property {string} error - Canonical failure reason, empty on success.
 */

/**
 * Stable id shown to the model for the result at `index` (result_1, …). Shared
 * by the rendered results and the id->URL map so the two stay aligned.
 *
 * @param {number} index - Zero-based result index.
 * @returns {string}
 */
function resultIdFor(index) {
  return `result_${index + 1}`;
}

/**
 * Collapses whitespace and truncates a result snippet. Fast path only.
 *
 * A snippet is page body text, so it follows the
 * get_page_content model instead — bound the length and rely on the security
 * flags, which this flow always sets.
 *
 * Reports the characters dropped by the cap alongside the text so the flow can
 * measure how much snippet content the assistant does not see.
 *
 * @param {unknown} text
 * @returns {{text: string, droppedChars: number}}
 */
function normalizeAndTruncateText(text) {
  if (typeof text !== "string" || !text) {
    return { text: "", droppedChars: 0 };
  }
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_SNIPPET_LENGTH) {
    return { text: collapsed, droppedChars: 0 };
  }
  return {
    text: collapsed.slice(0, MAX_SNIPPET_LENGTH) + "\u2026",
    droppedChars: collapsed.length - MAX_SNIPPET_LENGTH,
  };
}

/**
 * Returns true only for well-formed http(s) URLs. Used to drop search results
 * with malformed or non-web (e.g. javascript:, data:) URLs before they are
 * shown to the model or fetched.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
function isValidHttpUrl(url) {
  if (typeof url !== "string") {
    return false;
  }
  const parsed = URL.parse(url);
  return parsed?.protocol === "https:" || parsed?.protocol === "http:";
}

/**
 * Renders the user message handed to the model: the query, optional caller
 * context, the current date for freshness judgements, and the formatted
 * search results (each tagged with a result id).
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.context]
 * @param {string} params.nowISO - Current date as 'YYYY-MM-DD'.
 * @param {SearchResult[]} params.results
 * @returns {string}
 */
function buildUserMessage({ query, context, nowISO, results }) {
  const lines = [`Current date: ${nowISO}`, `Query: ${query}`];
  if (context && context.trim()) {
    lines.push(`Context: ${context}`);
  }
  lines.push("", "Search results:");
  results.forEach((result, index) => {
    const id = resultIdFor(index);
    const title = sanitizeUntrustedContent(result.title || "");
    const snippet = sanitizeUntrustedContent(result.snippet || "");
    const heading = title ? `${title} — ${result.url}` : result.url;
    lines.push(`[${id}] ${heading}`);
    if (snippet) {
      lines.push(`   ${snippet}`);
    }
  });
  return lines.join("\n");
}

/**
 * Validates the parsed model output against SEARCH_ANSWER_SCHEMA. This is the
 * V0 verification step: a non-LLM schema check, not a separate verifier model.
 * On any schema mismatch (missing/extra/wrong-typed fields, out-of-range
 * confidence) or a semantically unusable answer (claiming an answer with no
 * text), it returns the conservative fallback (could_answer false, confidence
 * 0) so a malformed result routes to the Google handoff.
 *
 * @param {object|null} parsed - Raw parsed model output.
 * @returns {{answer: string, could_answer: boolean, confidence: number}}
 */
export function validateSearchAnswer(parsed) {
  // Conservative fallback: an unusable answer routes to the Google handoff.
  const fallback = { answer: "", could_answer: false, confidence: 0 };

  // Structural validation against the same schema we request from the model.
  const { valid } = lazy.JsonSchema.validate(
    parsed,
    SEARCH_ANSWER_SCHEMA.schema
  );
  if (!valid) {
    return fallback;
  }

  // Schema-valid but semantically unusable: claiming an answer with no text.
  if (parsed.could_answer && !parsed.answer.trim()) {
    return fallback;
  }

  return {
    answer: parsed.answer,
    could_answer: parsed.could_answer,
    confidence: parsed.confidence,
  };
}

/**
 * Generates the grounded answer on the pinned answer-generation model. Runs an
 * on-demand page-read loop (page reads use tool-calling), then forces the
 * structured-output schema on a final, tool-free turn.
 *
 * A forced json_schema response and tool-calling cannot coexist in one turn —
 * with the schema forced the model must emit the final JSON and can't issue a
 * get_page_content call — so reads happen with tools and the schema is applied
 * only on the final answer turn.
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.context]
 * @param {string} params.nowISO
 * @param {SearchResult[]} params.results
 * @param {string} params.fxAccountToken
 * @param {(urls: string[]) => Promise<string[]>} params.readPage - Executes a
 *   page read and returns the extracted text blocks.
 * @param {AbortSignal} [params.signal]
 * @param {string|null} [params.flowId]
 * @returns {Promise<object|null>} The parsed model output, or null when the
 *   model produced no parseable answer.
 */
async function generateAnswer({
  query,
  context,
  nowISO,
  results,
  fxAccountToken,
  readPage,
  signal,
  flowId = null,
}) {
  const [conversation, { prompt: rawPrompt }] = await Promise.all([
    lazy.buildConversation(MODEL_FEATURES.SEARCH_ANSWER_GENERATION, {
      flowId,
    }),
    lazy.loadPrompt(MODEL_FEATURES.SEARCH_ANSWER_GENERATION),
  ]);

  conversation.setSystemMessage(renderPrompt(rawPrompt, {}));
  conversation.addUserMessage(
    buildUserMessage({ query, context, nowISO, results })
  );

  // Map the result ids shown to the model (result_1, …) back to URLs; the
  // model references ids, not full URLs (see GET_PAGE_CONTENT_TOOL).
  const idToUrl = new Map(
    results.map((result, index) => [resultIdFor(index), result.url])
  );

  let reads = 0;
  while (true) {
    const allowReads = reads < MAX_READ_ROUNDS;
    // Object content so the streaming accumulator can append to `body`.
    const assistantMessage = conversation.addAssistantMessage({ body: "" });
    const { pendingToolCalls } = await conversation.receiveResponse(
      conversation.runWithGenerator({
        streamOptions: { enabled: true },
        fxAccountToken,
        chatId: conversation.id,
        tool_choice: allowReads ? "auto" : "none",
        tools: allowReads ? [GET_PAGE_CONTENT_TOOL] : [],
        signal,
      }),
      assistantMessage
    );

    const pageReadCalls =
      allowReads && pendingToolCalls
        ? pendingToolCalls.filter(
            call => call.function?.name === GET_PAGE_CONTENT
          )
        : [];

    if (!pageReadCalls.length) {
      break;
    }

    // Nest tool_calls under `body` to match the shape the wire serializer
    // reads, so they are preserved on the next request.
    assistantMessage.content = {
      body: {
        tool_calls: pageReadCalls.map(call => ({
          id: call.id,
          type: "function",
          function: {
            name: call.function.name,
            arguments: call.function.arguments || "{}",
          },
        })),
      },
    };

    for (const call of pageReadCalls) {
      let ids = [];
      try {
        ids = JSON.parse(call.function.arguments || "{}").result_ids || [];
      } catch {
        ids = [];
      }
      const urls = (Array.isArray(ids) ? ids : [])
        .map(id => idToUrl.get(id))
        .filter(Boolean);
      const texts = await readPage(urls);
      conversation.addToolMessage({
        tool_call_id: call.id,
        content: Array.isArray(texts) ? texts.join("\n\n") : String(texts),
        name: call.function.name,
      });
    }
    reads++;
  }

  // Force the structured schema on a final, tool-free turn to get the answer.
  conversation.addUserMessage(
    "Output only the final JSON object described in your instructions."
  );
  // Don't pass `signal` to the non-streaming run(): it forwards options to the
  // engine process, which cannot structured-clone an AbortSignal. Check for a
  // prior abort here instead.
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const response = await conversation.run({
    tool_choice: "none",
    tools: [],
    fxAccountToken,
  });
  return parseAndExtractJSON(response, null);
}

/**
 * Builds a failure result that routes the main assistant to fallback.
 *
 * @param {string[]} searchedUrls
 * @param {string[]} readUrls
 * @param {string} message
 * @returns {SearchWorkflowResult}
 */
function failure(searchedUrls, readUrls, message) {
  return {
    answer: "",
    could_answer: false,
    confidence: 0,
    searched_urls: searchedUrls,
    read_urls: readUrls,
    error: message,
    requiresSearchHandoff: false,
  };
}

/**
 * Builds a fast-path failure result that routes the main assistant to fallback.
 *
 * @param {string} message
 * @returns {FastSearchWorkflowResult}
 */
function fastFailure(message) {
  return {
    results: [],
    error: message,
    requiresSearchHandoff: false,
  };
}

function shouldCallSearchHandoff(conversation) {
  return conversation._searchTheWebTurn === conversation.currentTurnIndex();
}

/**
 * Tool entrypoint for search_the_web. Dispatches to the path selected by
 * SEARCH_THE_WEB_FAST_PREF. The two paths return different shapes, so
 * Chat.sys.mjs offers the model a matching tool config for whichever is on.
 *
 * @param {object} toolParams
 * @param {string} toolParams.query - Search query (may be rewritten by the assistant).
 * @param {string} [toolParams.context] - Optional caller-supplied context.
 * @param {ChatConversation} conversation - Originating conversation.
 * @param {AbortSignal} [signal] - Cancels the in-flight answer generation.
 * @param {string} [mode] - Surface the tool ran on, for telemetry.
 * @returns {Promise<SearchWorkflowResult|FastSearchWorkflowResult>}
 */
export async function runSearchTheWeb(toolParams, conversation, signal, mode) {
  return Services.prefs.getBoolPref(SEARCH_THE_WEB_FAST_PREF, true)
    ? runFastSearch(toolParams, conversation, mode)
    : runGroundedSearch(toolParams, conversation, signal);
}

/**
 * Records the smart_window.search_the_web Glean event once per run of the fast
 * path, including on failure, so a stage that never ran is reported as 0.
 *
 * @param {object} options
 * @param {ChatConversation} options.conversation
 * @param {string} [options.mode] - Surface the flow ran on.
 * @param {FastSearchStats} options.stats
 * @param {number} options.totalDuration - Whole flow, in ms.
 */
function recordFastSearchTelemetry({
  conversation,
  mode,
  stats,
  totalDuration,
}) {
  Glean.smartWindow.searchTheWeb.record({
    location: mode ?? "",
    chat_id: conversation.id,
    message_seq: conversation.messageCount,
    total_duration: Math.round(totalDuration),
    retrieval_duration: Math.round(stats.retrieval),
    processing_duration: Math.round(stats.processing),
    results_retrieved: stats.retrieved,
    results_returned: stats.returned,
    snippet_chars_returned: stats.snippetChars,
    snippet_chars_truncated: stats.snippetCharsDropped,
    http_status: stats.httpStatus,
    error: stats.error,
  });
}

/**
 * Fast path. Runs one Exa retrieval and returns the sanitized results for the
 * main assistant to answer from. Errors are returned as a result with no
 * results rather than thrown, so the assistant can fall back to the Google
 * handoff.
 *
 * Telemetry is recorded in a `finally` so every early return in the flow is
 * covered without repeating the call at each one.
 *
 * @param {object} toolParams
 * @param {string} toolParams.query - Search query (may be rewritten by the assistant).
 * @param {ChatConversation} conversation - Originating conversation; owns the
 *   anonymous-fetch ledger and security state a follow-up page read depends on.
 * @param {string} [mode] - Surface the tool ran on, for telemetry.
 * @returns {Promise<FastSearchWorkflowResult>}
 */
async function runFastSearch(toolParams, conversation, mode) {
  // The handoff retrieves nothing of its own and is covered by search_handoff.
  if (shouldCallSearchHandoff(conversation)) {
    return {
      requiresSearchHandoff: true,
    };
  }

  /** @type {FastSearchStats} */
  const stats = {
    retrieval: 0,
    processing: 0,
    retrieved: 0,
    returned: 0,
    snippetChars: 0,
    snippetCharsDropped: 0,
    httpStatus: 0,
    error: "",
  };
  const flowStart = ChromeUtils.now();
  try {
    return await runFastSearchFlow(toolParams, conversation, stats);
  } catch (e) {
    // The flow returns its failures, so reaching here is a bug in it. Mark it
    // rather than let the event record a zero-result success.
    stats.error = SEARCH_TELEMETRY_ERRORS.INTERNAL_ERROR;
    throw e;
  } finally {
    // These durations are the tool's own cost, not what the user waited for:
    // the assistant composes the user-facing reply in a later turn.
    recordFastSearchTelemetry({
      conversation,
      mode,
      stats,
      totalDuration: ChromeUtils.now() - flowStart,
    });
  }
}

/**
 * Runs the fast path itself, populating `stats` as each stage closes.
 *
 * @param {object} toolParams
 * @param {ChatConversation} conversation
 * @param {FastSearchStats} stats - Mutated in place as the flow progresses.
 * @returns {Promise<FastSearchWorkflowResult>}
 */
async function runFastSearchFlow(toolParams, conversation, stats) {
  const query = toolParams?.query;
  if (typeof query !== "string" || !query.trim()) {
    stats.error = SEARCH_TELEMETRY_ERRORS.INVALID_QUERY;
    return fastFailure("a non-empty query is required");
  }
  conversation._searchTheWebTurn = conversation.currentTurnIndex();

  let retrieved;
  const retrievalStart = ChromeUtils.now();
  try {
    const provider = new ExaSearchProvider();
    const response = await provider.search(query.trim(), {
      maxResults: MAX_RESULTS_RETRIEVED,
    });
    retrieved = response.results;
    stats.httpStatus = response.status;
  } catch (e) {
    lazy.console.error("retrieval failed:", e);
    // Anything the provider did not categorize falls to the catch-all.
    stats.error =
      e?.searchErrorCategory ?? SEARCH_TELEMETRY_ERRORS.RETRIEVAL_FAILED;
    stats.httpStatus = e?.httpStatus ?? 0;
    return fastFailure(e.message);
  } finally {
    stats.retrieval = ChromeUtils.now() - retrievalStart;
    ChromeUtils.addProfilerMarker(
      "SmartWindow",
      { startTime: retrievalStart },
      "searchTheWeb-retrieval"
    );
  }

  const processingStart = ChromeUtils.now();
  try {
    stats.retrieved = retrieved.length;

    const kept = retrieved
      .filter(
        item =>
          isValidHttpUrl(item?.url) &&
          item?.snippet?.length > MIN_SNIPPET_LENGTH
      )
      .slice(0, MAX_RESULTS_RETURNED);

    if (!kept.length) {
      stats.error = SEARCH_TELEMETRY_ERRORS.NO_RESULTS;
      return fastFailure("no search results");
    }
    stats.returned = kept.length;

    const urls = kept.map(item => item.url);

    // Record the results as seen and add them to the anonymous-fetch ledger so a
    // follow-up get_page_content is allowed, then mark the conversation as having
    // seen private + untrusted content.
    conversation.addSeenUrls(urls);
    conversation.addSerpUrlsForAnonymousFetch(urls);
    conversation.securityProperties.setPrivateData();
    conversation.securityProperties.setUntrustedInput();

    // The snippets are excerpts of these pages, so they ground the answer the
    // same way a full page read does on the grounded path.
    conversation.addCitations(
      kept.map(item =>
        item.title ? { url: item.url, title: item.title } : { url: item.url }
      )
    );

    const results = kept.map(item => {
      const snippet = normalizeAndTruncateText(item.snippet);
      stats.snippetChars += snippet.text.length;
      stats.snippetCharsDropped += snippet.droppedChars;
      return {
        title: sanitizeUntrustedContent(item.title || ""),
        url: item.url,
        snippet: snippet.text,
      };
    });

    lazy.console.log("[Tool] searchTheWeb (fast)", {
      query,
      returned: kept.length,
    });

    return {
      results,
      requiresSearchHandoff: false,
    };
  } finally {
    stats.processing = ChromeUtils.now() - processingStart;
    ChromeUtils.addProfilerMarker(
      "SmartWindow",
      { startTime: processingStart },
      "searchTheWeb-processing"
    );
  }
}

/**
 * Grounded path. Runs one Exa retrieval, drives the on-demand page reads
 * (bounded by MAX_PAGES), generates and validates the grounded answer, and
 * returns the structured result. Errors are returned as a result with
 * could_answer false rather than thrown, so the main assistant can fall back to
 * the Google handoff.
 *
 * @param {object} toolParams
 * @param {string} toolParams.query - Search query (may be rewritten by the assistant).
 * @param {string} [toolParams.context] - Optional caller-supplied context.
 * @param {ChatConversation} conversation - Originating conversation; owns the
 *   anonymous-fetch ledger and security state the page reads depend on.
 * @param {AbortSignal} [signal] - Cancels the in-flight answer generation.
 * @returns {Promise<SearchWorkflowResult>}
 */
async function runGroundedSearch(toolParams, conversation, signal) {
  if (shouldCallSearchHandoff(conversation)) {
    return {
      requiresSearchHandoff: true,
    };
  }

  const query = toolParams?.query;
  if (typeof query !== "string" || !query.trim()) {
    return failure([], [], "a non-empty query is required");
  }
  conversation._searchTheWebTurn = conversation.currentTurnIndex();

  const context =
    typeof toolParams?.context === "string" ? toolParams.context : "";

  let results;
  try {
    const provider = new ExaSearchProvider();
    const response = await provider.search(query.trim(), {
      maxResults: ExaSearchProvider.MAX_RESULTS,
    });
    results = response.results;
  } catch (e) {
    lazy.console.error("retrieval failed:", e);
    return failure([], [], e.message);
  }

  results = results.filter(item => isValidHttpUrl(item?.url));
  const searchedUrls = results.map(item => item.url);

  if (!searchedUrls.length) {
    return failure([], [], "no search results");
  }

  // Record all results as seen and add them to the anonymous-fetch ledger,
  // then mark the conversation as having seen private + untrusted content. The
  // per-turn read limit (MAX_PAGES) caps how many are actually read.
  conversation.addSeenUrls(searchedUrls);
  conversation.addSerpUrlsForAnonymousFetch(searchedUrls);
  conversation.securityProperties.setPrivateData();
  conversation.securityProperties.setUntrustedInput();

  const fetchableSet = new Set(searchedUrls);
  const readUrls = [];
  const readSet = new Set();

  const readPage = async requestedUrls => {
    const remaining = MAX_PAGES - readUrls.length;
    if (remaining <= 0) {
      return ["Page read limit reached. Answer using what you have gathered."];
    }
    const fresh = requestedUrls
      .filter(url => fetchableSet.has(url) && !readSet.has(url))
      .slice(0, remaining);
    if (!fresh.length) {
      return [
        "No further readable pages are available. Answer using what you have gathered.",
      ];
    }
    fresh.forEach(url => {
      readSet.add(url);
      readUrls.push(url);
    });

    const readTimeoutMs = Services.prefs.getIntPref(
      READ_TIMEOUT_PREF,
      READ_TIMEOUT_DEFAULT_MS
    );

    // Reads pages individually (but async) with timeouts as specified so that a
    // single read failure doesn't kill the whole batch
    const readOne = async url => {
      const controller = new AbortController();
      let timeoutId;
      const timeout = new Promise(resolve => {
        timeoutId = lazy.setTimeout(() => {
          lazy.console.warn(
            `[SearchWorkflow] page read timed out reading ${url} after ${readTimeoutMs}ms; abandoning stuck fetch`
          );
          controller.abort();
          resolve([
            `Timed out reading ${url}. Answer with what you have gathered.`,
          ]);
        }, readTimeoutMs);
      });
      try {
        const fetchPromise = GetPageContent.getPageContent(
          { url_list: [url], signal: controller.signal },
          conversation
        );
        // If the timeout wins (stuck load), the fetch stays pending; swallow its
        // late settle so it can't surface as an unhandled rejection.
        fetchPromise.catch(() => {});
        return await Promise.race([fetchPromise, timeout]);
      } finally {
        lazy.clearTimeout(timeoutId);
      }
    };

    const perUrl = await Promise.all(fresh.map(readOne));
    return perUrl.flat();
  };

  let parsed;
  try {
    parsed = await generateAnswer({
      query: query.trim(),
      context,
      nowISO: new Date().toISOString().slice(0, 10),
      results,
      fxAccountToken: await openAIEngine.getFxAccountToken(),
      readPage,
      signal,
    });
  } catch (e) {
    lazy.console.error("answer generation failed:", e);
    return failure(searchedUrls, readUrls, e.message);
  }

  const validated = validateSearchAnswer(parsed);
  lazy.console.log("[Tool] searchTheWeb", {
    query,
    searched: searchedUrls.length,
    read: readUrls.length,
    couldAnswer: validated.could_answer,
  });

  const titlesByUrl = new Map(results.map(item => [item.url, item.title]));
  const readSources = readUrls.map(url => {
    const title = titlesByUrl.get(url);
    return title ? { url, title } : { url };
  });
  conversation.addCitations(readSources);

  return {
    ...validated,
    searched_urls: searchedUrls,
    read_urls: readUrls,
    requiresSearchHandoff: false,
  };
}
