/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { ConversationStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ConversationStore.sys.mjs"
);
const { Conversation, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);
const { SecurityProperties } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/SecurityProperties.sys.mjs"
);

async function countRows(convId) {
  const rows = await ConversationStore.connection.execute(
    "SELECT count(*) AS c FROM conversation WHERE conv_id = :conv_id",
    { conv_id: convId }
  );
  return rows[0].getResultByName("c");
}

registerCleanupFunction(async () => {
  await ConversationStore.destroyDatabase();
});

add_task(async function test_database_initializes() {
  await ConversationStore.ensureDatabase();
  Assert.ok(ConversationStore.connection, "A database connection is opened");
});

add_task(async function test_save_and_restore() {
  const conversation = new Conversation({
    id: "conv-save-restore",
    createdDate: 1000,
    updatedDate: 2000,
    feature: "aitab",
    seenUrls: ["https://a.example/", "https://b.example/"],
    serpUrlsForAnonymousFetch: ["https://serp.example/"],
    // Non-default flags so the round-trip proves the values actually persist,
    // rather than both sides defaulting to false.
    securityProperties: { privateData: true, untrustedInput: true },
  });

  await ConversationStore.updateConversation(conversation);

  const loaded =
    await ConversationStore.findConversationById("conv-save-restore");
  Assert.ok(loaded instanceof Conversation, "A Conversation is returned");
  Assert.equal(loaded.id, "conv-save-restore", "id is restored");
  Assert.equal(loaded.createdDate, 1000, "createdDate is restored");
  Assert.equal(loaded.updatedDate, 2000, "updatedDate is restored");
  Assert.equal(loaded.feature, "aitab", "feature is restored");

  // A Set made inside a .sys.mjs module isn't `instanceof Set` from this test
  // (different JS globals => different Set constructors). Check size/has instead.
  Assert.equal(loaded.seenUrls.size, 2, "seenUrls restored with both values");
  Assert.ok(
    loaded.seenUrls.has("https://a.example/") &&
      loaded.seenUrls.has("https://b.example/"),
    "seenUrls values are restored"
  );

  Assert.equal(
    loaded.serpUrlsForAnonymousFetch.size,
    1,
    "serpUrlsForAnonymousFetch restored"
  );
  Assert.ok(
    loaded.serpUrlsForAnonymousFetch.has("https://serp.example/"),
    "serpUrlsForAnonymousFetch values are restored"
  );

  Assert.ok(
    loaded.securityProperties instanceof SecurityProperties,
    "securityProperties is restored as a SecurityProperties"
  );
  Assert.ok(
    loaded.securityProperties.privateData,
    "privateData flag survives the round-trip"
  );
  Assert.ok(
    loaded.securityProperties.untrustedInput,
    "untrustedInput flag survives the round-trip"
  );
});

add_task(async function test_update_is_upsert() {
  await ConversationStore.updateConversation(
    new Conversation({
      id: "conv-upsert",
      createdDate: 1000,
      updatedDate: 2000,
      feature: "chat",
    })
  );

  // Same id, different created/updated/feature. created_date is insert-only.
  await ConversationStore.updateConversation(
    new Conversation({
      id: "conv-upsert",
      createdDate: 9999,
      updatedDate: 3000,
      feature: "aitab",
    })
  );

  Assert.equal(await countRows("conv-upsert"), 1, "Upsert keeps a single row");

  const loaded = await ConversationStore.findConversationById("conv-upsert");
  Assert.equal(loaded.createdDate, 1000, "created_date is insert-only");
  Assert.equal(loaded.updatedDate, 3000, "updated_date is refreshed");
  Assert.equal(loaded.feature, "aitab", "feature is refreshed");
});

add_task(async function test_delete() {
  await ConversationStore.updateConversation(
    new Conversation({ id: "conv-delete", createdDate: 1, updatedDate: 1 })
  );
  Assert.equal(await countRows("conv-delete"), 1, "Row exists before delete");

  await ConversationStore.deleteConversationById("conv-delete");

  Assert.equal(await countRows("conv-delete"), 0, "Row is deleted");
  Assert.equal(
    await ConversationStore.findConversationById("conv-delete"),
    null,
    "findConversationById returns null after delete"
  );
});

add_task(async function test_messages_save_and_restore() {
  const conversation = new Conversation({
    id: "conv-msgs",
    createdDate: 100,
    updatedDate: 200,
  });
  conversation.addMessage(MESSAGE_ROLE.USER, { type: "text", body: "hi" }, 0);
  conversation.addMessage(
    MESSAGE_ROLE.ASSISTANT,
    { type: "text", body: "hello" },
    0
  );

  await ConversationStore.updateConversation(conversation);

  const loaded = await ConversationStore.findConversationById("conv-msgs");
  Assert.equal(loaded.messages.length, 2, "both messages are restored");
  Assert.equal(
    loaded.messages[0].role,
    MESSAGE_ROLE.USER,
    "the first message role is restored"
  );
  Assert.deepEqual(
    loaded.messages[0].content,
    { type: "text", body: "hi" },
    "message content is restored"
  );
  Assert.equal(
    loaded.messages[1].content.body,
    "hello",
    "the second message content is restored"
  );

  // Deleting the conversation cascades to its messages (foreign_keys = ON).
  await ConversationStore.deleteConversationById("conv-msgs");
  const rows = await ConversationStore.connection.execute(
    "SELECT count(*) AS c FROM message WHERE conv_id = :conv_id",
    { conv_id: "conv-msgs" }
  );
  Assert.equal(
    rows[0].getResultByName("c"),
    0,
    "messages are cascade-deleted with the conversation"
  );
});

add_task(async function test_removed_messages_are_pruned() {
  const conversation = new Conversation({
    id: "conv-prune",
    createdDate: 1,
    updatedDate: 1,
  });
  conversation.addMessage(MESSAGE_ROLE.USER, { type: "text", body: "one" }, 0);
  conversation.addMessage(
    MESSAGE_ROLE.ASSISTANT,
    { type: "text", body: "two" },
    0
  );
  await ConversationStore.updateConversation(conversation);

  // Drop the last message in memory (as retry/truncate would) and re-save.
  conversation.messages = conversation.messages.slice(0, 1);
  await ConversationStore.updateConversation(conversation);

  const loaded = await ConversationStore.findConversationById("conv-prune");
  Assert.equal(
    loaded.messages.length,
    1,
    "the removed message is pruned, not resurrected"
  );
  Assert.equal(
    loaded.messages[0].content.body,
    "one",
    "the remaining message is kept"
  );
});

add_task(async function test_clearing_all_messages_removes_rows() {
  const conversation = new Conversation({
    id: "conv-clear",
    createdDate: 1,
    updatedDate: 1,
  });
  conversation.addMessage(MESSAGE_ROLE.USER, { type: "text", body: "one" }, 0);
  conversation.addMessage(
    MESSAGE_ROLE.ASSISTANT,
    { type: "text", body: "two" },
    0
  );
  await ConversationStore.updateConversation(conversation);

  // Emptying the conversation (as clearMessages would) must delete every row,
  // exercising the empty keep-list branch of the delete.
  conversation.messages = [];
  await ConversationStore.updateConversation(conversation);

  const rows = await ConversationStore.connection.execute(
    "SELECT count(*) AS c FROM message WHERE conv_id = :conv_id",
    { conv_id: "conv-clear" }
  );
  Assert.equal(
    rows[0].getResultByName("c"),
    0,
    "all messages are removed when the conversation is emptied"
  );
});
