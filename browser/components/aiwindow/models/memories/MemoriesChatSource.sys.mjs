/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles the user message extraction from chat store
 */

import {
  ChatStore,
  MESSAGE_ROLE,
} from "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs";

// Chat fetch defaults
const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_HALF_LIFE_DAYS = 7;
const MS_PER_SEC = 1_000;
const SEC_PER_MIN = 60;
const MINS_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Fetch recent user chat messages from the ChatStore and compute a freshness
 * score for each one.
 *
 * Messages are fetched between `startTime` and "now" (Date.now()) and limited
 * to the most recent `maxResults` entries. A per-message `freshness_score`
 * in [0, 1] is computed using an exponential half-life decay over age in days.
 *
 * @param {number} [startTime=0]
 *        Inclusive start time in milliseconds since Unix epoch.
 * @param {number} [maxResults=DEFAULT_MAX_RESULTS]
 *        Maximum number of most recent messages to return.
 * @param {number} [halfLifeDays=DEFAULT_HALF_LIFE_DAYS]
 *        Half-life in days for the freshness decay function.
 * @returns {Promise<Array<{
 *   createdDate: number,
 *   role: string,
 *   content: any,
 *   pageUrl: string | null,
 *   freshness_score: number
 * }>>}
 *        Promise resolving to an array of mapped chat message objects.
 */
export async function getRecentChats(
  startTime = 0,
  maxResults = DEFAULT_MAX_RESULTS,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS
) {
  // Underlying Chatstore uses Date type but MemoriesStore maintains in TS
  const startDate = new Date(startTime);
  const endDate = new Date();
  const chatStore = new ChatStore();
  const messages = await chatStore.findMessagesByDate(
    startDate,
    endDate,
    MESSAGE_ROLE.USER,
    maxResults
  );

  const chatMessages = messages.map(msg => {
    const createdDate = msg.createdDate;
    const freshness_score = computeFreshnessScore(createdDate, halfLifeDays);
    return {
      createdDate,
      role: msg.role,
      content: msg.content?.body ?? null,
      pageUrl: msg.pageUrl,
      freshness_score,
    };
  });

  return chatMessages;
}

/**
 * Compute a freshness score for a message based on its age, using an
 * exponential decay with a configurable half-life.
 *
 * The score is:
 *   -> 1.0 for messages with ageDays <= 0 (now or in the future)
 *   -> exp(-ln(2) * (ageDays / halfLifeDays)) for older messages,
 *   clamped into the [0, 1] range.
 *
 * @param {number|Date} createdDate
 *        Message creation time, either as a millisecond timestamp or a Date.
 * @param {number} [halfLifeDays=DEFAULT_HALF_LIFE_DAYS]
 *        Half-life in days; larger values decay more slowly.
 * @returns {number}
 *          Freshness score in the range [0, 1].
 */
export function computeFreshnessScore(
  createdDate,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS
) {
  const now = Date.now();
  const createdMs =
    typeof createdDate === "number" ? createdDate : createdDate.getTime();
  const ageMs = now - createdMs;
  const ageDays =
    ageMs / (MS_PER_SEC * SEC_PER_MIN * MINS_PER_HOUR * HOURS_PER_DAY);
  if (ageDays <= 0) {
    return 1;
  }
  const raw = Math.exp(-Math.LN2 * (ageDays / halfLifeDays));
  return Math.max(0, Math.min(1, raw));
}
