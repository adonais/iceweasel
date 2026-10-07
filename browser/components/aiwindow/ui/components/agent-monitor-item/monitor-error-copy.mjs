/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * User-facing copy for a failed monitor run, keyed by the errorCode a history
 * entry carries, plus the code for a create or resume refused at the active
 * monitor limit.
 *
 * The keys mirror MONITOR_ERROR_CODES in Monitor.sys.mjs. They are repeated as
 * plain strings rather than imported because this module is loaded into the
 * card's document (and into Storybook), where the model layer isn't reachable.
 * test_MonitorErrorCopy.js fails the build if the two ever drift apart.
 */
export const MONITOR_ERROR_L10N_IDS = Object.freeze({
  network_error: "ai-tasks-alert-history-error-network",
  timeout: "ai-tasks-alert-history-error-timeout",
  rate_limit: "ai-tasks-alert-history-error-rate-limit",
  auth_error: "ai-tasks-alert-history-error-auth",
  content_extraction_error: "ai-tasks-alert-history-error-content-extraction",
  canceled: "ai-tasks-alert-history-error-canceled",
  interrupted: "ai-tasks-alert-history-error-interrupted",
  model_error: "ai-tasks-alert-history-error-model",
  prompt_load_error: "ai-tasks-alert-history-error-prompt-load",
  unknown_error: "ai-tasks-alert-history-error-unknown",
  active_limit_reached: "ai-tasks-alert-error-active-limit",
});

export const DEFAULT_MONITOR_ERROR_L10N_ID =
  MONITOR_ERROR_L10N_IDS.unknown_error;

/**
 * @param {string} [errorCode] - The errorCode from a history entry.
 * @returns {string} The Fluent ID explaining the failure. Falls back to the
 *  generic message for entries written before error codes existed, or for a
 *  code this build doesn't know about.
 */
export function monitorErrorL10nId(errorCode) {
  return MONITOR_ERROR_L10N_IDS[errorCode] ?? DEFAULT_MONITOR_ERROR_L10N_ID;
}
