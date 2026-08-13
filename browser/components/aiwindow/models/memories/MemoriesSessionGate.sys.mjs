/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Heuristic gate for session bundles produced by `buildSessions`.
 *
 * `runHeuristicGate(session)` returns a binary decision (`KEEP` or `SKIP`)
 * so the orchestrator can drop sessions that are structurally guaranteed
 * to have no extractable content.
 *
 * This gate intentionally only rejects sessions where structure alone
 * proves there is nothing to extract (no queries, no usable titles, no
 * meaningful chat). Anything with even a single query or a meaningful
 * title is handed to the downstream LLM step, which is far better at
 * judging whether the content is worth remembering.
 *
 * Cross-modal policy is permissive: for a session that has both browse
 * activity and chat messages, the gate keeps the session if either
 * modality individually passes its checks. The intuition is that
 * cross-modal sessions are by construction more contextual than
 * single-modal, so a substantive chat carries an otherwise-trivial browse
 * session and vice versa.
 */

import {
  GATE_KEEP,
  GATE_SKIP,
  GENERIC_TITLES,
  NAV_TITLE_PATTERNS,
  SKIP_ONLY_DOMAINS,
  SEARCH_ENGINE_DOMAINS,
  TRIVIAL_MESSAGES,
  MIN_TITLE_LENGTH,
  MIN_MESSAGE_LENGTH,
} from "./MemoriesConstants.sys.mjs";

/**
 * Decide whether a session bundle should be processed by the memory
 * pipeline or dropped as trivial.
 *
 * @param {object} session  A session bundle produced by `buildSessions`.
 * @returns {{decision: "KEEP"|"SKIP", reason: string}}
 *   `KEEP` means the session is worth running through downstream LLM
 *   steps. `SKIP` means drop it. `reason` is a short string suitable for
 *   logging; empty string when `KEEP`.
 */
export function runHeuristicGate(session) {
  const hasBrowse = session.visit_count + session.search_count > 0;
  const hasChat = session.chat_count > 0;

  if (!hasBrowse && !hasChat) {
    return { decision: GATE_SKIP, reason: "empty session" };
  }

  const browseReason = hasBrowse ? checkBrowse(session) : null;
  const chatReason = hasChat ? checkChat(session) : null;

  // Permissive policy: only skip when every present modality would skip.
  if (hasBrowse && hasChat) {
    if (browseReason !== null && chatReason !== null) {
      return {
        decision: GATE_SKIP,
        reason: `browse: ${browseReason}; chat: ${chatReason}`,
      };
    }
  } else if (hasBrowse && browseReason !== null) {
    return { decision: GATE_SKIP, reason: browseReason };
  } else if (hasChat && chatReason !== null) {
    return { decision: GATE_SKIP, reason: chatReason };
  }

  return { decision: GATE_KEEP, reason: "" };
}

function checkBrowse(session) {
  const queryCount = session.search_queries.length;
  const domains = session.domains;
  const hasDomains = !!domains.length;

  // Pure SERP bounce: only search-engine hosts, no queries surfaced.
  if (
    queryCount === 0 &&
    hasDomains &&
    domains.every(d => SEARCH_ENGINE_DOMAINS.has(d))
  ) {
    return "search-engine pages with no queries";
  }

  // Nav-only hosts (auth, shorteners, click-trackers) with no query
  // signal to redeem them.
  if (
    queryCount === 0 &&
    hasDomains &&
    domains.every(d => SKIP_ONLY_DOMAINS.has(d))
  ) {
    return "only navigation/auth domains";
  }

  // Structural zero-content: no queries and no usable titles. Anything
  // with even one query or one meaningful title is handed to the LLM.
  if (queryCount === 0) {
    const meaningfulTitles = session.titles.filter(
      t =>
        t.length >= MIN_TITLE_LENGTH &&
        !GENERIC_TITLES.has(t) &&
        !NAV_TITLE_PATTERNS.some(re => re.test(t))
    );
    if (meaningfulTitles.length === 0) {
      return "no meaningful titles or queries";
    }
  }

  return null;
}

function checkChat(session) {
  const hasMeaningful = session.chats.some(msg => {
    const body =
      typeof msg.content === "string" ? msg.content.trim().toLowerCase() : "";
    return body.length >= MIN_MESSAGE_LENGTH && !TRIVIAL_MESSAGES.has(body);
  });
  if (!hasMeaningful) {
    return "trivial messages only";
  }
  return null;
}
