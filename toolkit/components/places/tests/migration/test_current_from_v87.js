/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function hasUserContextIdColumn(db) {
  let rows = await db.execute(
    "SELECT 1 FROM pragma_table_info('moz_historyvisits') WHERE name = 'userContextId'"
  );
  return rows.length === 1;
}

async function fetchVisitIds(db) {
  let rows = await db.execute("SELECT id FROM moz_historyvisits ORDER BY id");
  return rows.map(r => r.getResultByName("id"));
}

async function fetchUserContextIds(db, url) {
  let rows = await db.execute(
    `SELECT v.userContextId FROM moz_historyvisits v
     JOIN moz_places h ON h.id = v.place_id
     WHERE h.url_hash = hash(:url) AND h.url = :url
     ORDER BY v.visit_date`,
    { url }
  );
  return rows.map(r => r.getResultByName("userContextId"));
}

let gVisitIds;

add_task(async function setup() {
  let path = await setupPlacesDatabase("places_v87.sqlite");

  let db = await Sqlite.openConnection({ path });

  Assert.equal(
    await db.getSchemaVersion(),
    87,
    "The fixture should be at schema version 87"
  );
  Assert.ok(
    !(await hasUserContextIdColumn(db)),
    "moz_historyvisits should not have userContextId before migration"
  );

  gVisitIds = await fetchVisitIds(db);
  Assert.greater(gVisitIds.length, 0, "There should be visits to migrate");

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

add_task(async function userContextId_column_was_added() {
  const db = await PlacesUtils.promiseDBConnection();

  Assert.ok(
    await hasUserContextIdColumn(db),
    "moz_historyvisits should have userContextId after migration"
  );
  Assert.deepEqual(
    await fetchVisitIds(db),
    gVisitIds,
    "All visits should survive the migration"
  );

  let columns = await db.execute(
    `SELECT "notnull", dflt_value FROM pragma_table_info('moz_historyvisits')
     WHERE name = 'userContextId'`
  );
  Assert.equal(
    columns[0].getResultByName("notnull"),
    1,
    "userContextId should be NOT NULL"
  );
  Assert.equal(
    columns[0].getResultByName("dflt_value"),
    "0",
    "userContextId should default to 0"
  );

  let rows = await db.execute(
    "SELECT COUNT(*) AS count FROM moz_historyvisits WHERE userContextId <> 0"
  );
  Assert.equal(
    rows[0].getResultByName("count"),
    0,
    "Existing visits should belong to the default container"
  );
});

add_task(async function userContextId_is_stored() {
  const url = "https://example.com/container-page";
  await PlacesUtils.history.insert({
    url,
    visits: [
      { date: new Date(Date.now() - 2000) },
      { date: new Date(Date.now() - 1000), userContextId: 0 },
      { date: new Date(), userContextId: 2 },
    ],
  });

  const db = await PlacesUtils.promiseDBConnection();
  Assert.deepEqual(
    await fetchUserContextIds(db, url),
    [0, 0, 2],
    "The default container should be stored as 0"
  );
});
