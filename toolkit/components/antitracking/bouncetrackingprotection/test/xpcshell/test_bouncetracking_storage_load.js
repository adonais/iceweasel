/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that clears issued while the on-disk state is still being loaded are
// not undone by the load, and that writes issued in that time are merged with
// the loaded state.

const { Sqlite } = ChromeUtils.importESModule(
  "resource://gre/modules/Sqlite.sys.mjs"
);

const TYPE_BOUNCE_TRACKER = 0;
const TYPE_USER_ACTIVATION = 1;

let databasePath;

add_setup(function () {
  Services.prefs.setIntPref(
    "privacy.bounceTrackingProtection.mode",
    Ci.nsIBounceTrackingProtection.MODE_ENABLED
  );

  let dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dbFile.append("bounce-tracking-protection.sqlite");
  databasePath = dbFile.path;
});

async function readDatabase() {
  let db = await Sqlite.openConnection({ path: databasePath });
  let rows = await db.execute(
    "SELECT originAttributeSuffix, siteHost, entryType, timeStamp FROM sites ORDER BY siteHost"
  );
  await db.close();
  return rows.map(row => ({
    originAttributeSuffix: row.getResultByName("originAttributeSuffix"),
    siteHost: row.getResultByName("siteHost"),
    entryType: row.getResultByName("entryType"),
    timeStamp: row.getResultByName("timeStamp"),
  }));
}

add_task(async function test_operations_before_load() {
  let now = Date.now() * 1000;
  let older = now - 10 * 60 * 1000 * 1000;
  let rangeTimeStamp = now - 60 * 60 * 1000 * 1000;

  info("Populate the database before BTP storage is initialized.");
  let db = await Sqlite.openConnection({ path: databasePath });
  await db.setSchemaVersion(1);
  await db.execute(
    "CREATE TABLE sites (originAttributeSuffix TEXT NOT NULL, siteHost TEXT NOT NULL, entryType INTEGER NOT NULL, timeStamp INTEGER NOT NULL, PRIMARY KEY (originAttributeSuffix, siteHost))"
  );
  let rows = [
    ["", "kept.com", TYPE_USER_ACTIVATION, older],
    ["", "kept-tracker.com", TYPE_BOUNCE_TRACKER, older],
    ["", "activated.com", TYPE_USER_ACTIVATION, older],
    ["", "candidate.com", TYPE_BOUNCE_TRACKER, older],
    ["", "reactivated.com", TYPE_USER_ACTIVATION, older],
    ["", "migrated.com", TYPE_USER_ACTIVATION, now],
    ["", "site-cleared.com", TYPE_BOUNCE_TRACKER, older],
    ["", "range-cleared.com", TYPE_USER_ACTIVATION, rangeTimeStamp],
    ["^userContextId=2", "container.com", TYPE_USER_ACTIVATION, older],
    ["^userContextId=3", "pattern-cleared.com", TYPE_USER_ACTIVATION, older],
  ];
  for (let [originAttributeSuffix, siteHost, entryType, timeStamp] of rows) {
    await db.execute(
      "INSERT INTO sites VALUES (:originAttributeSuffix, :siteHost, :entryType, :timeStamp)",
      { originAttributeSuffix, siteHost, entryType, timeStamp }
    );
  }
  await db.close();

  // Getting the service starts loading the database in the background. The
  // loaded state is applied to memory in a separate main thread task, so it
  // can't be applied before this synchronous block has finished.
  let btp = Cc["@mozilla.org/bounce-tracking-protection;1"].getService(
    Ci.nsIBounceTrackingProtection
  );
  btp.testAddBounceTrackerCandidate({}, "activated.com", now);
  btp.testAddBounceTrackerCandidate({}, "candidate.com", now);
  btp.testAddUserActivation({}, "reactivated.com", now);
  btp.testAddUserActivation({}, "migrated.com", older);
  btp.clearBySiteHostAndOriginAttributes("site-cleared.com", {});
  btp.clearBySiteHostAndOriginAttributesPattern("pattern-cleared.com", {});
  btp.clearByTimeRange(rangeTimeStamp - 1000, rangeTimeStamp + 1000);
  btp.clearByOriginAttributesPattern(JSON.stringify({ userContextId: 2 }));

  await btp.testFlushStorage();

  Assert.deepEqual(
    btp
      .testGetUserActivationHosts({})
      .map(entry => [entry.siteHost, entry.timeStamp])
      .sort(),
    [
      ["activated.com", older],
      ["kept.com", older],
      ["migrated.com", now],
      ["reactivated.com", now],
    ],
    "Loaded user activations take precedence over candidates and the most recent activation is kept."
  );
  Assert.deepEqual(
    btp
      .testGetBounceTrackerCandidateHosts({})
      .map(entry => [entry.siteHost, entry.timeStamp])
      .sort(),
    [
      ["candidate.com", older],
      ["kept-tracker.com", older],
    ],
    "The loaded bounce time is kept and cleared candidates are not restored."
  );
  Assert.deepEqual(
    btp.testGetUserActivationHosts({ userContextId: 2 }),
    [],
    "The OA pattern clear is not undone by the load."
  );
  Assert.deepEqual(
    btp.testGetUserActivationHosts({ userContextId: 3 }),
    [],
    "The site host clear across OAs is not undone by the load."
  );

  // Flush the merged values the load wrote back.
  await btp.testFlushStorage();
  Assert.deepEqual(
    await readDatabase(),
    [
      {
        originAttributeSuffix: "",
        siteHost: "activated.com",
        entryType: TYPE_USER_ACTIVATION,
        timeStamp: older,
      },
      {
        originAttributeSuffix: "",
        siteHost: "candidate.com",
        entryType: TYPE_BOUNCE_TRACKER,
        timeStamp: older,
      },
      {
        originAttributeSuffix: "",
        siteHost: "kept-tracker.com",
        entryType: TYPE_BOUNCE_TRACKER,
        timeStamp: older,
      },
      {
        originAttributeSuffix: "",
        siteHost: "kept.com",
        entryType: TYPE_USER_ACTIVATION,
        timeStamp: older,
      },
      {
        originAttributeSuffix: "",
        siteHost: "migrated.com",
        entryType: TYPE_USER_ACTIVATION,
        timeStamp: now,
      },
      {
        originAttributeSuffix: "",
        siteHost: "reactivated.com",
        entryType: TYPE_USER_ACTIVATION,
        timeStamp: now,
      },
    ],
    "The database matches the in-memory state."
  );

  btp.clearAll();
  await btp.testFlushStorage();
});
