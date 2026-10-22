/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Deleting a generated page has to clear two databases: the page versions in
// ai-tab-pages-store.sqlite and the conversation that produced them in
// conversation-store.sqlite. They are separate files, so no foreign key
// cascades between them and the two deletes cannot share a transaction. These
// tests pin the contract AITabParent relies on.

do_get_profile();

const { AITabStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs"
);
const { ConversationStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ConversationStore.sys.mjs"
);
const { Conversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);

registerCleanupFunction(async () => {
  await AITabStore.destroyDatabase();
  await ConversationStore.destroyDatabase();
});

/**
 * Creates a two-version page along with the generation conversation that
 * produced it. `conv_id` names the chat the page was requested in and lives in
 * another database again; `tool_conv_id` names the generation conversation,
 * the one in conversation-store.sqlite and the one a delete has to clear.
 *
 * @param {string} convId - Chat the page belongs to.
 * @param {string} slug
 * @returns {Promise<string>} Id of the generation conversation.
 */
async function createTabWithConversation(convId, slug) {
  const toolConvId = `tool-${convId}`;
  await ConversationStore.updateConversation(
    new Conversation({ id: toolConvId, feature: "aitab" })
  );
  await AITabStore.create({ convId, toolConvId, slug, title: "V1" });
  await AITabStore.edit({ convId, toolConvId, slug, title: "V2" });
  return toolConvId;
}

add_task(async function setup() {
  await AITabStore.ensureDatabase();
  await ConversationStore.ensureDatabase();
});

add_task(async function test_created_at_is_microseconds() {
  await createTabWithConversation("conv-units", "units-slug");
  const page = await AITabStore.getBySlug("units-slug");

  // AITabStore writes `Date.now() * 1000`. The header divides this back down
  // before building a Date, so if the column ever switches to milliseconds
  // that conversion has to go with it.
  Assert.greater(
    page.createdAt,
    Date.now() * 100,
    "created_at is stored in microseconds, not milliseconds"
  );
  Assert.equal(
    new Date(Math.round(page.createdAt / 1000)).getFullYear(),
    new Date().getFullYear(),
    "Dividing by 1000 yields a Date in the current year"
  );
});

add_task(async function test_delete_clears_both_stores() {
  const toolConvId = await createTabWithConversation("conv-both", "both-slug");

  // Sanity: both sides exist before the delete, so the assertions below are
  // observing a real transition rather than an empty database.
  const page = await AITabStore.getBySlug("both-slug");
  Assert.ok(page, "The page exists before deleting");
  Assert.equal(
    page.toolConvId,
    toolConvId,
    "The page names the conversation that produced it"
  );
  Assert.ok(
    await ConversationStore.findConversationById(toolConvId),
    "The conversation exists before deleting"
  );

  // The order AITabParent uses: pages first, conversation second. The page
  // delete is keyed on slug, the conversation delete on the id the page
  // carries.
  await AITabStore.deleteBySlug("both-slug");
  await ConversationStore.deleteConversationById(page.toolConvId);

  Assert.equal(
    await AITabStore.getBySlug("both-slug"),
    null,
    "The page no longer resolves by slug"
  );
  Assert.equal(
    await ConversationStore.findConversationById(toolConvId),
    null,
    "The conversation is gone too"
  );
});

add_task(async function test_deleting_conversation_alone_orphans_the_page() {
  const toolConvId = await createTabWithConversation(
    "conv-orphan",
    "orphan-slug"
  );

  await ConversationStore.deleteConversationById(toolConvId);

  // This is why AITabParent cannot rely on the conversation delete alone: the
  // stores are different database files, so nothing cascades and the page
  // would still load by slug.
  Assert.equal(
    await ConversationStore.findConversationById(toolConvId),
    null,
    "The conversation is gone"
  );
  Assert.ok(
    await AITabStore.getBySlug("orphan-slug"),
    "The page survives, so deleting the conversation alone is not enough"
  );
});

add_task(async function test_delete_is_scoped_to_one_conversation() {
  const toolConvIdA = await createTabWithConversation("conv-a", "slug-a");
  const toolConvIdB = await createTabWithConversation("conv-b", "slug-b");

  await AITabStore.deleteBySlug("slug-a");
  await ConversationStore.deleteConversationById(toolConvIdA);

  Assert.equal(
    await AITabStore.getBySlug("slug-a"),
    null,
    "The targeted page is gone"
  );
  Assert.ok(
    await AITabStore.getBySlug("slug-b"),
    "The other conversation's page is untouched"
  );
  Assert.ok(
    await ConversationStore.findConversationById(toolConvIdB),
    "The other conversation is untouched"
  );
});
