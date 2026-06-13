/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { ToolUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ToolUI.sys.mjs"
);
const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);

/**
 * Test that ToolUI.handleUpdate returns false when missing required data
 */
add_task(async function test_handleUpdate_missing_messageId() {
  const conversation = new ChatConversation({});

  const result = ToolUI.handleUpdate(
    {
      toolCallId: "test-tool-123",
      updateType: "confirmation-tab-selection",
    },
    conversation
  );

  Assert.equal(result, false, "Should return false when messageId is missing");
});

add_task(async function test_handleUpdate_missing_toolCallId() {
  const conversation = new ChatConversation({});

  const result = ToolUI.handleUpdate(
    {
      messageId: "message-123",
      updateType: "confirmation-tab-selection",
    },
    conversation
  );

  Assert.equal(result, false, "Should return false when toolCallId is missing");
});

/**
 * Test that ToolUI.handleUpdate returns false when message not found
 */
add_task(async function test_handleUpdate_message_not_found() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Test prompt", {});
  conversation.addAssistantMessage("text", "Test response");

  const result = ToolUI.handleUpdate(
    {
      messageId: "non-existent-id",
      toolCallId: "test-tool-123",
      updateType: "confirmation-tab-selection",
    },
    conversation
  );

  Assert.equal(result, false, "Should return false when message not found");
});

/**
 * Test that ToolUI.handleUpdate returns false when toolUIData doesn't exist
 */
add_task(async function test_handleUpdate_no_toolUIData() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Test prompt", {});
  conversation.addAssistantMessage("text", "Test response");

  const assistantMessage = conversation.messages.find(
    m => m.role === 1 && m.content?.type === "text"
  );

  const result = ToolUI.handleUpdate(
    {
      messageId: assistantMessage.id,
      toolCallId: "test-tool-123",
      updateType: "confirmation-tab-selection",
    },
    conversation
  );

  Assert.equal(
    result,
    false,
    "Should return false when message has no toolUIData"
  );
});

/**
 * Test that ToolUI.handleUpdate returns false when toolCallId doesn't match
 */
add_task(async function test_handleUpdate_toolCallId_mismatch() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Test prompt", {});
  conversation.addAssistantMessage("text", "Test response");

  const assistantMessage = conversation.messages.find(
    m => m.role === 1 && m.content?.type === "text"
  );

  // Manually add toolUIData to the message
  assistantMessage.toolUIData = {
    toolCallId: "different-tool-456",
    uiType: "website-confirmation",
    properties: {},
  };

  const result = ToolUI.handleUpdate(
    {
      messageId: assistantMessage.id,
      toolCallId: "test-tool-123",
      updateType: "confirmation-tab-selection",
    },
    conversation
  );

  Assert.equal(
    result,
    false,
    "Should return false when toolCallId doesn't match"
  );
});

/**
 * Test that ToolUI.handleUpdate successfully updates for confirmation
 */
add_task(async function test_handleUpdate_confirmation_success() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Test prompt", {});
  conversation.addAssistantMessage("text", "Test response");

  const assistantMessage = conversation.messages.find(
    m => m.role === 1 && m.content?.type === "text"
  );

  // Manually add toolUIData to the message
  const originalToolCallId = "test-tool-123";
  assistantMessage.toolUIData = {
    toolCallId: originalToolCallId,
    uiType: "website-confirmation",
    properties: {
      tabs: [{ id: "tab1", label: "Test Tab" }],
    },
  };

  const updateData = { selectedTabs: ["tab1"] };
  const result = await ToolUI.handleUpdate(
    {
      messageId: assistantMessage.id,
      toolCallId: originalToolCallId,
      updateType: "confirmation-tab-selection",
      updateData,
    },
    conversation
  );

  // After refactoring, conversation.updateToolUI is called which updates the message
  Assert.equal(result, true, "Should return true on successful update");
  Assert.equal(
    assistantMessage.toolUIData.uiType,
    "ai-action-result",
    "Should change uiType to ai-action-result"
  );
  Assert.deepEqual(
    assistantMessage.toolUIData.properties.confirmedSelections,
    updateData,
    "Should add confirmedSelections to properties"
  );
});

/**
 * Test that ToolUI.handleUpdate successfully updates for cancellation
 */
add_task(async function test_handleUpdate_cancellation_success() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Test prompt", {});
  conversation.addAssistantMessage("text", "Test response");

  const assistantMessage = conversation.messages.find(
    m => m.role === 1 && m.content?.type === "text"
  );

  // Manually add toolUIData to the message
  const originalToolCallId = "test-tool-456";
  assistantMessage.toolUIData = {
    toolCallId: originalToolCallId,
    uiType: "website-confirmation",
    properties: {
      tabs: [{ id: "tab1", label: "Test Tab" }],
    },
  };

  const result = await ToolUI.handleUpdate(
    {
      messageId: assistantMessage.id,
      toolCallId: originalToolCallId,
      updateType: "cancel-tab-selection",
    },
    conversation
  );

  Assert.equal(result, true, "Should return true on successful cancellation");
  Assert.equal(
    assistantMessage.toolUIData.uiType,
    "cancelled-component",
    "Should change uiType to cancelled-component"
  );
  Assert.ok(
    assistantMessage.toolUIData.properties.tabs,
    "Should preserve original properties"
  );
});

/**
 * Test that ToolUI.handleUpdate returns false for unknown updateType
 */
add_task(async function test_handleUpdate_unknown_updateType() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Test prompt", {});
  conversation.addAssistantMessage("text", "Test response");

  const assistantMessage = conversation.messages.find(
    m => m.role === 1 && m.content?.type === "text"
  );

  // Add toolUIData to the message
  const originalToolCallId = "test-tool-789";
  const originalUIData = {
    toolCallId: originalToolCallId,
    uiType: "website-confirmation",
    properties: {
      tabs: [{ id: "tab1", label: "Test Tab" }],
    },
  };
  assistantMessage.toolUIData = { ...originalUIData };

  const result = ToolUI.handleUpdate(
    {
      messageId: assistantMessage.id,
      toolCallId: originalToolCallId,
      updateType: "invalid-update-type",
    },
    conversation
  );

  Assert.equal(result, false, "Should return false for unknown updateType");
  Assert.deepEqual(
    assistantMessage.toolUIData,
    originalUIData,
    "Should preserve original toolUIData when updateType is unknown"
  );
});
