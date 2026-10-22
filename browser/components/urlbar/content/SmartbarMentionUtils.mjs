/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Identity of context mentions: a tab is its URL, a tab group `group:<groupId>`.
 */

export const CONTEXT_MENTION_TYPE = Object.freeze({
  TAB: "tab",
  CURRENT_TAB: "currentTab",
  TAB_GROUP: "tabGroup",
});

/** @typedef {Values<typeof CONTEXT_MENTION_TYPE>} ContextMentionType */
const TAB_GROUP_MENTION_ID_PREFIX = "group:";

/**
 * @param {string} groupId
 * @returns {string} The mention id of the tab group.
 */
export function getTabGroupMentionId(groupId) {
  return TAB_GROUP_MENTION_ID_PREFIX + groupId;
}

/**
 * @param {string} mentionId
 * @returns {?string} The group id of a tab group mention id.
 */
export function parseTabGroupMentionId(mentionId) {
  if (!mentionId.startsWith(TAB_GROUP_MENTION_ID_PREFIX)) {
    return null;
  }
  return mentionId.slice(TAB_GROUP_MENTION_ID_PREFIX.length) || null;
}

/**
 * @param {{type?: ContextMentionType, url?: string, groupId?: string}} mention
 * @returns {?string} The mention id.
 */
export function getContextMentionKey(mention) {
  if (mention.type == CONTEXT_MENTION_TYPE.TAB_GROUP) {
    return mention.groupId ? getTabGroupMentionId(mention.groupId) : null;
  }
  return mention.url || null;
}

/**
 * @param {{type?: ContextMentionType, groupId?: string}} mention
 * @returns {boolean} Whether the mention is a tab expanded from a tab group.
 */
export function isTabGroupMember(mention) {
  return mention.type != CONTEXT_MENTION_TYPE.TAB_GROUP && !!mention.groupId;
}
