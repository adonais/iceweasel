/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { AITabStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs"
);

const EXPECTED_COLUMNS = {
  uuid: "TEXT",
  conv_id: "TEXT",
  slug: "TEXT",
  version: "INTEGER",
  title: "TEXT",
  created_at: "INTEGER",
  updated_at: "INTEGER",
  context_jsonb: "BLOB",
  components_jsonb: "BLOB",
  localstate_jsonb: "BLOB",
};

async function getTableColumns(conn, table) {
  const rows = await conn.execute(`PRAGMA table_info(${table})`);
  const columns = {};
  for (const row of rows) {
    columns[row.getResultByName("name")] = {
      type: row.getResultByName("type"),
      notNull: !!row.getResultByName("notnull"),
      pk: !!row.getResultByName("pk"),
    };
  }
  return columns;
}

registerCleanupFunction(async () => {
  await AITabStore.destroyDatabase();
});

add_task(async function test_database_initializes() {
  await AITabStore.ensureDatabase();
  Assert.ok(AITabStore.connection, "A database connection is opened");
});

add_task(async function test_schema_version() {
  const version = await AITabStore.getDatabaseSchemaVersion();
  Assert.equal(
    version,
    AITabStore.CURRENT_SCHEMA_VERSION,
    "Schema version matches the store's current version"
  );
  Assert.equal(version, 1, "Initial schema version is 1");
});

add_task(async function test_aitab_pages_columns() {
  const columns = await getTableColumns(AITabStore.connection, "aitab_pages");

  Assert.deepEqual(
    Object.keys(columns).sort(),
    Object.keys(EXPECTED_COLUMNS).sort(),
    "aitab_pages has exactly the expected columns"
  );

  for (const [name, type] of Object.entries(EXPECTED_COLUMNS)) {
    Assert.equal(columns[name].type, type, `Column ${name} has type ${type}`);
  }

  Assert.ok(columns.uuid.pk, "uuid is the primary key");
  Assert.ok(columns.conv_id.notNull, "conv_id is NOT NULL");
  Assert.ok(columns.slug.notNull, "slug is NOT NULL");
  Assert.ok(columns.title.notNull, "title is NOT NULL");
});

add_task(async function test_create_inserts_first_version() {
  const created = await AITabStore.create({
    convId: "conv-create",
    slug: "slug-create",
    title: "Created page",
    context: { source: "tabs" },
    components: [{ type: "header" }],
    localState: { checked: true },
  });

  Assert.equal(created.version, 1, "A new tab starts at version 1");
  Assert.ok(created.uuid, "A uuid is generated");

  const rows = await AITabStore.getAITabPagesByConvId("conv-create");
  Assert.equal(rows.length, 1, "One row persisted for the new tab");
  Assert.equal(rows[0].version, 1, "Persisted version is 1");
  Assert.equal(rows[0].slug, "slug-create", "slug persisted verbatim");
  Assert.equal(rows[0].title, "Created page", "title persisted");
  Assert.deepEqual(rows[0].context, { source: "tabs" }, "context round-trips");
  Assert.deepEqual(
    rows[0].components,
    [{ type: "header" }],
    "components round-trips"
  );
  Assert.deepEqual(
    rows[0].localState,
    { checked: true },
    "localState round-trips"
  );
});

add_task(async function test_edit_appends_new_version() {
  await AITabStore.create({
    convId: "conv-edit",
    slug: "slug-edit",
    title: "First",
  });

  const edited = await AITabStore.edit({
    convId: "conv-edit",
    slug: "slug-edit",
    title: "Second",
  });

  Assert.equal(edited.version, 2, "An edit appends version 2");

  const rows = await AITabStore.getAITabPagesByConvId("conv-edit");
  Assert.equal(rows.length, 2, "Both versions are retained");
  Assert.deepEqual(
    rows.map(r => r.version),
    [1, 2],
    "Versions are 1 then 2"
  );
  Assert.equal(rows[0].title, "First", "The original version is untouched");
  Assert.equal(rows[1].title, "Second", "The new version has the edited title");
  Assert.notEqual(rows[0].uuid, rows[1].uuid, "Each version is its own row");
});

add_task(async function test_versions_are_per_conversation() {
  const a = await AITabStore.create({
    convId: "conv-a",
    slug: "slug-a",
    title: "A",
  });
  const b = await AITabStore.create({
    convId: "conv-b",
    slug: "slug-b",
    title: "B",
  });

  Assert.equal(a.version, 1, "conv-a starts at version 1");
  Assert.equal(b.version, 1, "conv-b starts at version 1 independently");
});

add_task(async function test_get_by_slug_and_version() {
  await AITabStore.create({ convId: "conv-sv", slug: "sv-slug", title: "V1" });
  await AITabStore.edit({ convId: "conv-sv", slug: "sv-slug", title: "V2" });

  const v1 = await AITabStore.getBySlugAndVersion("sv-slug", 1);
  const v2 = await AITabStore.getBySlugAndVersion("sv-slug", 2);
  const missing = await AITabStore.getBySlugAndVersion("sv-slug", 99);

  Assert.equal(v1.title, "V1", "version 1 fetched by slug + version");
  Assert.equal(v2.title, "V2", "version 2 fetched by slug + version");
  Assert.equal(missing, null, "A missing version returns null");
});

add_task(async function test_create_rejects_existing_tab() {
  await AITabStore.create({
    convId: "conv-guard",
    slug: "guard-slug",
    title: "First",
  });

  await Assert.rejects(
    AITabStore.create({
      convId: "conv-guard",
      slug: "guard-slug-2",
      title: "Again",
    }),
    /use edit/,
    "create() on an existing tab is rejected"
  );
});

add_task(async function test_edit_rejects_unknown_tab() {
  await Assert.rejects(
    AITabStore.edit({
      convId: "conv-never-created",
      slug: "ghost",
      title: "Nope",
    }),
    /use create/,
    "edit() on an unknown tab is rejected"
  );
});

add_task(async function test_get_versions_by_slug() {
  await AITabStore.create({
    convId: "conv-hist",
    slug: "hist-slug",
    title: "V1",
  });
  await AITabStore.edit({
    convId: "conv-hist",
    slug: "hist-slug",
    title: "V2",
  });
  await AITabStore.edit({
    convId: "conv-hist",
    slug: "hist-slug",
    title: "V3",
  });

  const versions = await AITabStore.getVersionsBySlug("hist-slug");
  Assert.deepEqual(
    versions,
    [3, 2, 1],
    "All version numbers are returned, newest first"
  );

  const none = await AITabStore.getVersionsBySlug("no-such-slug");
  Assert.deepEqual(none, [], "An unknown slug returns an empty array");
});

add_task(async function test_get_by_slug_returns_latest() {
  await AITabStore.create({
    convId: "conv-latest",
    slug: "latest-slug",
    title: "V1",
  });
  await AITabStore.edit({
    convId: "conv-latest",
    slug: "latest-slug",
    title: "V2",
  });

  const page = await AITabStore.getBySlug("latest-slug");
  Assert.equal(page.version, 2, "getBySlug returns the latest version");
  Assert.equal(page.title, "V2", "The latest title is returned");

  const missing = await AITabStore.getBySlug("no-such-slug");
  Assert.equal(missing, null, "An unknown slug returns null");
});
