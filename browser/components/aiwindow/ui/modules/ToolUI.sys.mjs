/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({
    prefix: "ToolUI",
  });
});

// Maps update types to their corresponding UI states
const UPDATE_TYPE_TO_UI_STATE = {
  "confirmation-tab-selection": "ai-action-result",
  "cancel-tab-selection": "cancelled-component",
};

/**
 * Manages the Tool UI updates and orchestrates state changes for tool UI components
 */
export class ToolUI {
  /**
   * Handle updates to tool UI components from user interactions
   *
   * @param {object} data - The update data
   * @param {string} data.messageId - ID of the message containing the tool UI
   * @param {string} data.toolCallId - ID of the specific tool call
   * @param {string} data.updateType - Type of update (confirmation, cancellation, etc.)
   * @param {object} data.updateData - Additional data for the update
   * @param {object} conversation - The conversation object containing messages
   * @returns {boolean} True if update was successful, false otherwise
   */
  static handleUpdate(data, conversation) {
    const { messageId, toolCallId, updateType } = data ?? {};

    if (!messageId || !toolCallId) {
      return false;
    }

    // Find the message in the conversation (messages use 'id' not 'messageId')
    const message = conversation?.messages?.find(m => m.id === messageId);

    // Check if the message exists and has matching toolUIData
    if (message?.toolUIData?.toolCallId !== toolCallId) {
      return false;
    }

    // Look up the next UI state based on the update type
    const nextUI = UPDATE_TYPE_TO_UI_STATE[updateType];
    if (!nextUI) {
      lazy.console.error(`ToolUI: Unknown updateType "${updateType}"`);
      return false;
    }

    // Use the conversation's updateToolUI method to handle the state change
    conversation.updateToolUI(message, data, nextUI);
    return true;
  }
}
