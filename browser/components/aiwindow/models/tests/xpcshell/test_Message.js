/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Message } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Message.sys.mjs"
);

add_task(function test_Message_defaults() {
  const m = new Message({ role: 1, content: "hi", turnIndex: 0, ordinal: 1 });
  Assert.equal(m.role, 1);
  Assert.equal(m.content, "hi");
  Assert.equal(m.turnIndex, 0);
  Assert.equal(m.ordinal, 1);
  Assert.equal(typeof m.id, "string");
  Assert.greater(m.createdDate, 0);
  Assert.equal(m.parentMessageId, null);
  Assert.equal(m.modelId, null);
  Assert.equal(m.params, null);
  Assert.equal(m.usage, null);
  Assert.equal(m.toolCallId, null);
  Assert.equal(m.toolName, null);
});

add_task(function test_Message_explicit_id_and_parent() {
  const m = new Message({
    role: 2,
    content: { body: "..." },
    turnIndex: 3,
    ordinal: 5,
    id: "abc",
    parentMessageId: "xyz",
    modelId: "test-model",
    params: { temperature: 0.2 },
    usage: { total_tokens: 7 },
    toolCallId: "tc-1",
    toolName: "search",
  });
  Assert.equal(m.id, "abc");
  Assert.equal(m.parentMessageId, "xyz");
  Assert.equal(m.modelId, "test-model");
  Assert.equal(m.params.temperature, 0.2);
  Assert.equal(m.usage.total_tokens, 7);
  Assert.equal(m.toolCallId, "tc-1");
  Assert.equal(m.toolName, "search");
});
