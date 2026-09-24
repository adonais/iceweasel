/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Process-wide session dismissals shared across AI Window tabs and windows.
// Bug 2064698 tracks persistence.
const _dismissedResumeMemoryIds = new Set();

/**
 * Marks a resume-activity memory as dismissed for the rest of the session.
 *
 * @param {string} memoryId
 */
export function dismissResumeActivityMemory(memoryId) {
  _dismissedResumeMemoryIds.add(memoryId);
}

/**
 * @param {string} memoryId
 * @returns {boolean} Whether the memory was dismissed this session.
 */
export function isResumeActivityMemoryDismissed(memoryId) {
  return _dismissedResumeMemoryIds.has(memoryId);
}

export function _clearDismissedResumeMemoriesForTesting() {
  _dismissedResumeMemoryIds.clear();
}
