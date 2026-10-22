/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Process-wide PUWYLO state shared across AI Window tabs and windows.
const _dismissedResumeMemoryIds = new Set();
let _resumeSectionHiddenForSession = false;

export const ResumeActivity = {
  /**
   * Marks a resume-activity memory as dismissed for this session.
   *
   * TODO Bug 2067871: Replace this frontend state with
   * `JourneyManager.dismissJourney` once resume activities use the journey
   * store. Store-backed dismissals will persist across restarts and remove
   * the need for `dismissMemory` and `isMemoryDismissed`. Section visibility
   * remains frontend-owned.
   *
   * @param {string} memoryId
   */
  dismissMemory(memoryId) {
    _dismissedResumeMemoryIds.add(memoryId);
  },

  /**
   * @param {string} memoryId
   * @returns {boolean} Whether the memory was dismissed this session.
   */
  isMemoryDismissed(memoryId) {
    return _dismissedResumeMemoryIds.has(memoryId);
  },

  /**
   * Hides empty resume states across AI Window tabs until suggestions become
   * available or the browser restarts.
   *
   * TODO Bug 2064698: Persist this state and use journey availability
   * instead of a locally tracked flag.
   */
  hideSectionForSession() {
    _resumeSectionHiddenForSession = true;
  },

  /**
   * Clears a previous empty-state hide when suggestions become available.
   */
  clearSectionHiddenForSession() {
    _resumeSectionHiddenForSession = false;
  },

  /**
   * @returns {boolean} Whether the resume section was hidden this session.
   */
  isSectionHiddenForSession() {
    return _resumeSectionHiddenForSession;
  },
};

export function _clearDismissedResumeMemoriesForTesting() {
  _dismissedResumeMemoryIds.clear();
}

export function _resetResumeSectionHiddenForTesting() {
  _resumeSectionHiddenForSession = false;
}
