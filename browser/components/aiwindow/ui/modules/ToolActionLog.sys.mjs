/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  GET_OPEN_TABS,
  SEARCH_BROWSING_HISTORY,
  GET_USER_MEMORIES,
} from "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs";

export const ACTION_LOG_UI_TYPE = "action-log";

/**
 * UI metadata used by the action log - keyed by tool name
 *
 * @type {Map<string, { show: boolean, label: string }>}
 */
const TOOL_ACTION_LOG_CONFIG = new Map([
  [GET_OPEN_TABS, { show: true, label: "Got open tabs" }], // place holder
  [
    SEARCH_BROWSING_HISTORY,
    { show: true, label: "Searched browsing history" }, // place holder
  ],
  [GET_USER_MEMORIES, { show: true, label: "Reviewed memories" }], // place holder
]);

/**
 * Look up the action log UI config for a given tool. Tools without an entry
 * default to suppressed (show: false). To surface a new tool in the action
 * log, add an explicit entry to TOOL_ACTION_LOG_CONFIG
 *
 * @param {string} toolName
 * @returns {{ show: boolean, label: string }}
 */
export function getActionLogConfigForTool(toolName) {
  return TOOL_ACTION_LOG_CONFIG.get(toolName) ?? { show: false, label: "" };
}
