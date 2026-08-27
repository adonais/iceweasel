/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const ORIGINS_COLUMNS = [
  "id",
  "prefix",
  "host",
  "frecency",
  "recalc_frecency",
  "alt_frecency",
  "recalc_alt_frecency",
  "block_until_ms",
  "block_pages_until_ms",
];

// An origin the fixture already contains, to exercise the upsert conflict.
const KNOWN_PREFIX = "https://";
const KNOWN_HOST = "www.mozilla.org";

async function fetchOrigins(db) {
  let rows = await db.execute(
    `SELECT ${ORIGINS_COLUMNS.join(", ")} FROM moz_origins ORDER BY id`
  );
  return rows.map(r => ORIGINS_COLUMNS.map(c => r.getResultByName(c)));
}

async function fetchPages(db) {
  let rows = await db.execute(
    "SELECT id, origin_id FROM moz_places ORDER BY id"
  );
  return rows.map(r => [
    r.getResultByName("id"),
    r.getResultByName("origin_id"),
  ]);
}

async function fetchOriginId(db, prefix, host) {
  let rows = await db.execute(
    "SELECT id FROM moz_origins WHERE prefix = :prefix AND host = :host",
    { prefix, host }
  );
  return rows.length ? rows[0].getResultByName("id") : null;
}

async function fetchUniqueIndexColumns(db) {
  let indexes = await db.execute(
    "SELECT name FROM pragma_index_list('moz_origins') WHERE origin = 'u'"
  );
  Assert.equal(
    indexes.length,
    1,
    "moz_origins should have a single unique index"
  );
  let columns = await db.execute(
    "SELECT name FROM pragma_index_info(:index) ORDER BY seqno",
    { index: indexes[0].getResultByName("name") }
  );
  return columns.map(r => r.getResultByName("name"));
}

let gOrigins;
let gPages;

add_task(async function setup() {
  let path = await setupPlacesDatabase("places_v86.sqlite");

  let db = await Sqlite.openConnection({ path });

  Assert.equal(
    await db.getSchemaVersion(),
    86,
    "The fixture should be at schema version 86"
  );
  Assert.deepEqual(
    await fetchUniqueIndexColumns(db),
    ["prefix", "host"],
    "moz_origins should be keyed on (prefix, host) before migration"
  );

  gOrigins = await fetchOrigins(db);
  gPages = await fetchPages(db);
  Assert.greater(gOrigins.length, 0, "There should be origins to migrate");
  Assert.ok(
    gPages.some(([, originId]) => originId !== null),
    "There should be pages referencing an origin"
  );
  Assert.ok(
    await fetchOriginId(db, KNOWN_PREFIX, KNOWN_HOST),
    "There should be a known origin to conflict with later on"
  );

  await db.close();
});

add_task(async function database_is_valid() {
  // Accessing the database for the first time triggers migration.
  Assert.equal(
    PlacesUtils.history.databaseStatus,
    PlacesUtils.history.DATABASE_STATUS_UPGRADED
  );

  const db = await PlacesUtils.promiseDBConnection();
  Assert.equal(await db.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
});

add_task(async function moz_origins_was_rebuilt() {
  const db = await PlacesUtils.promiseDBConnection();

  Assert.deepEqual(
    await fetchUniqueIndexColumns(db),
    ["host", "prefix"],
    "moz_origins should be keyed on (host, prefix) after migration"
  );
});

add_task(async function contents_are_preserved() {
  const db = await PlacesUtils.promiseDBConnection();

  Assert.deepEqual(
    await fetchOrigins(db),
    gOrigins,
    "All origins should survive the rebuild unchanged"
  );
  Assert.deepEqual(
    await fetchPages(db),
    gPages,
    "All pages should keep pointing to their origin"
  );
});

add_task(async function foreign_key_is_intact() {
  const db = await PlacesUtils.promiseDBConnection();

  let keys = await db.execute(
    `SELECT "table", "from", "to" FROM pragma_foreign_key_list('moz_places')`
  );
  Assert.deepEqual(
    keys.map(r => [
      r.getResultByName("table"),
      r.getResultByName("from"),
      r.getResultByName("to"),
    ]),
    [["moz_origins", "origin_id", "id"]],
    "moz_places should still reference the rebuilt moz_origins"
  );

  let violations = await db.execute("SELECT * FROM pragma_foreign_key_check()");
  Assert.equal(
    violations.length,
    0,
    "There should be no foreign key violations"
  );
});

add_task(async function origins_are_still_usable() {
  const db = await PlacesUtils.promiseDBConnection();
  let knownId = await fetchOriginId(db, KNOWN_PREFIX, KNOWN_HOST);

  await PlacesTestUtils.addVisits(`${KNOWN_PREFIX}${KNOWN_HOST}/new-page`);
  Assert.equal(
    await fetchOriginId(db, KNOWN_PREFIX, KNOWN_HOST),
    knownId,
    "Visiting a known origin should update it rather than add a new one"
  );

  await PlacesTestUtils.addVisits("https://example.com/new-page");
  Assert.ok(
    await fetchOriginId(db, "https://", "example.com"),
    "Visiting an unknown origin should add it"
  );
});
