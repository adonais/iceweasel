/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Conversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);

// Values mirror ui/modules/ChatEnums.sys.mjs.
const USER = 0;
const ASSISTANT = 1;
const SYS = 2;

add_task(function test_Conversation_starts_empty() {
  const c = new Conversation();
  Assert.equal(c.messages.length, 0);
  Assert.equal(c.messageCount, 0);
  Assert.equal(c.currentTurnIndex(), 0);
  Assert.equal(c.systemPromptVersion, "");
});

add_task(function test_addUserMessage_then_assistant_orders() {
  const c = new Conversation();
  c.addUserMessage("hello");
  c.addAssistantMessage("hi back");
  const messages = c.messages;
  Assert.equal(messages.length, 2);
  Assert.equal(messages[0].role, USER);
  Assert.equal(messages[0].content, "hello");
  Assert.equal(messages[0].ordinal, 1);
  Assert.equal(messages[1].role, ASSISTANT);
  Assert.equal(messages[1].ordinal, 2);
  Assert.equal(messages[1].parentMessageId, messages[0].id);
});

add_task(function test_setSystemMessage_idempotent_upsert() {
  const c = new Conversation();
  c.setSystemMessage({ body: "v1", version: "0.1" });
  c.addUserMessage("hello");
  Assert.equal(c.messages[0].role, SYS);
  Assert.equal(c.messages[0].content.body, "v1");
  Assert.equal(c.systemPromptVersion, "0.1");

  c.setSystemMessage({ body: "v2", version: "0.2" });
  Assert.equal(c.messages.length, 2);
  Assert.equal(c.messages[0].content.body, "v2");
  Assert.equal(c.systemPromptVersion, "0.2");
});

add_task(function test_setSystemMessage_string_wraps_into_body() {
  const c = new Conversation();
  c.setSystemMessage("hello");
  Assert.equal(c.messages[0].content.body, "hello");
  // No version provided — getter returns empty.
  Assert.equal(c.systemPromptVersion, "");
});

add_task(function test_getMessagesInChatCompletionsFormat_basic() {
  const c = new Conversation();
  c.setSystemMessage("sys");
  c.addUserMessage("u");
  c.addAssistantMessage("a");
  const wire = c.getMessagesInChatCompletionsFormat();
  Assert.equal(wire.length, 3);
  Assert.equal(wire[0].role, "system");
  Assert.equal(wire[0].content, "sys");
  Assert.equal(wire[1].role, "user");
  Assert.equal(wire[1].content, "u");
  Assert.equal(wire[2].role, "assistant");
  Assert.equal(wire[2].content, "a");
});

add_task(function test_addToolMessage_carries_tool_linkage() {
  const c = new Conversation();
  c.addToolMessage({ tool_call_id: "tc-1", content: "result", name: "search" });
  const wire = c.getMessagesInChatCompletionsFormat();
  Assert.equal(wire[0].role, "tool");
  Assert.equal(wire[0].tool_call_id, "tc-1");
  Assert.equal(wire[0].name, "search");
});

add_task(function test_retryMessage_truncates_and_bumps_floor() {
  const c = new Conversation();
  c.addUserMessage("u1");
  c.addAssistantMessage("a1");
  c.addUserMessage("u2");
  const removed = c.retryMessage(c.messages[1]);
  Assert.equal(removed.length, 2);
  Assert.equal(c.messages.length, 1);
  // Next ordinal floor must not reuse the removed ordinals (2 and 3).
  c.addUserMessage("u3");
  Assert.equal(c.messages.at(-1).ordinal, 4);
});

add_task(async function test_run_delegates_to_engine_with_parameters_merged() {
  let receivedArgs = null;
  const fakeEngine = {
    run(payload) {
      receivedArgs = payload;
      return Promise.resolve({ finalOutput: "ok" });
    },
  };
  const c = new Conversation({
    engine: fakeEngine,
    parameters: { temperature: 0.5 },
  });
  c.setSystemMessage("sys");
  c.addUserMessage("hi");
  const resp = await c.run({ fxAccountToken: "tk" });
  Assert.equal(resp.finalOutput, "ok");
  Assert.equal(receivedArgs.temperature, 0.5);
  Assert.equal(receivedArgs.fxAccountToken, "tk");
  Assert.equal(receivedArgs.args.length, 2);
  Assert.equal(receivedArgs.args[0].role, "system");
});
