/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/
*/

// This tests the public Telemetry API for submitting pings.

"use strict";

const { ClientID } = ChromeUtils.importESModule(
  "resource://gre/modules/ClientID.sys.mjs"
);
const { TelemetryArchive } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryArchive.sys.mjs"
);

ChromeUtils.defineLazyGetter(this, "gPingsArchivePath", function () {
  return PathUtils.join(PathUtils.profileDir, "datareporting", "archived");
});

/**
 * Fakes the archive storage quota.
 *
 * @param {Integer} aArchiveQuota The new quota, in bytes.
 */
function fakeStorageQuota(aArchiveQuota) {
  let { Policy } = ChromeUtils.importESModule(
    "resource://gre/modules/TelemetryStorage.sys.mjs"
  );
  Policy.getArchiveQuota = () => aArchiveQuota;
}

/**
 * Lists all the valid archived pings and their metadata, sorted by creation date.
 *
 * @return {object[]} A list of objects with the extracted data in the form:
 *                  { timestamp: <number>,
 *                    id: <string>,
 *                    type: <string>,
 *                    size: <integer> }
 */
var getArchivedPingsInfo = async function () {
  let archivedPings = [];

  // Iterate through the subdirs of |gPingsArchivePath|.
  for (const dir of await IOUtils.getChildren(gPingsArchivePath)) {
    const { type } = await IOUtils.stat(dir);
    if (type != "directory") {
      continue;
    }

    // Then get a list of the files for the current subdir.
    for (const filePath of await IOUtils.getChildren(dir)) {
      const fileInfo = await IOUtils.stat(filePath);
      if (fileInfo.type == "directory") {
        continue;
      }
      let pingInfo = TelemetryStorage._testGetArchivedPingDataFromFileName(
        PathUtils.filename(filePath)
      );
      if (!pingInfo) {
        // This is not a valid archived ping, skip it.
        continue;
      }
      // Find the size of the ping and then add the info to the array.
      pingInfo.size = fileInfo.size;
      archivedPings.push(pingInfo);
    }
  }

  // Sort the list by creation date and then return it.
  archivedPings.sort((a, b) => b.timestamp - a.timestamp);
  return archivedPings;
};

add_task(async function test_setup() {
  do_get_profile(true);
  // Make sure we don't generate unexpected pings due to pref changes.
  await setEmptyPrefWatchlist();
});

add_task(async function test_archivedPings() {
  // TelemetryController should not be fully initialized at this point.
  // Submitting pings should still work fine.

  const PINGS = [
    {
      type: "test-ping-api-1",
      payload: { foo: "bar" },
      dateCreated: new Date(2010, 1, 1, 10, 0, 0),
    },
    {
      type: "test-ping-api-2",
      payload: { moo: "meh" },
      dateCreated: new Date(2010, 2, 1, 10, 0, 0),
    },
  ];

  // Submit pings and check the ping list.
  let expectedPingList = [];

  for (let data of PINGS) {
    fakeNow(data.dateCreated);
    data.id = await TelemetryController.submitExternalPing(
      data.type,
      data.payload
    );
    let list = await TelemetryArchive.promiseArchivedPingList();

    expectedPingList.push({
      id: data.id,
      type: data.type,
      timestampCreated: data.dateCreated.getTime(),
    });
    Assert.deepEqual(
      list,
      expectedPingList,
      "Archived ping list should contain submitted pings"
    );
  }

  // Check loading the archived pings.
  let checkLoadingPings = async function () {
    for (let data of PINGS) {
      let ping = await TelemetryArchive.promiseArchivedPingById(data.id);
      Assert.equal(ping.id, data.id, "Archived ping should have matching id");
      Assert.equal(
        ping.type,
        data.type,
        "Archived ping should have matching type"
      );
      Assert.equal(
        ping.creationDate,
        data.dateCreated.toISOString(),
        "Archived ping should have matching creation date"
      );
    }
  };

  await checkLoadingPings();

  // Check that we find the archived pings again by scanning after a restart.
  await TelemetryController.testReset();
  Services.fog.testResetFOG();

  let pingList = await TelemetryArchive.promiseArchivedPingList();
  Assert.deepEqual(
    expectedPingList,
    pingList,
    "Should have submitted pings in archive list after restart"
  );
  await checkLoadingPings();

  // Write invalid pings into the archive with both valid and invalid names.
  let writeToArchivedDir = async function (
    dirname,
    filename,
    content,
    compressed
  ) {
    const dirPath = PathUtils.join(gPingsArchivePath, dirname);
    await IOUtils.makeDirectory(dirPath, { ignoreExisting: true });
    const filePath = PathUtils.join(dirPath, filename);
    const options = { tmpPath: filePath + ".tmp", mode: "overwrite" };
    if (compressed) {
      options.compress = true;
    }
    await IOUtils.writeUTF8(filePath, content, options);
  };

  const FAKE_ID1 = "10000000-0123-0123-0123-0123456789a1";
  const FAKE_ID2 = "20000000-0123-0123-0123-0123456789a2";
  const FAKE_ID3 = "20000000-0123-0123-0123-0123456789a3";
  const FAKE_TYPE = "foo";

  // These should get rejected.
  await writeToArchivedDir("xx", "foo.json", "{}");
  await writeToArchivedDir("2010-02", "xx.xx.xx.json", "{}");
  // This one should get picked up...
  await writeToArchivedDir(
    "2010-02",
    "1." + FAKE_ID1 + "." + FAKE_TYPE + ".json",
    "{}"
  );
  // ... but get overwritten by this one.
  await writeToArchivedDir(
    "2010-02",
    "2." + FAKE_ID1 + "." + FAKE_TYPE + ".json",
    ""
  );
  // This should get picked up fine.
  await writeToArchivedDir(
    "2010-02",
    "3." + FAKE_ID2 + "." + FAKE_TYPE + ".json",
    ""
  );
  // This compressed ping should get picked up fine as well.
  await writeToArchivedDir(
    "2010-02",
    "4." + FAKE_ID3 + "." + FAKE_TYPE + ".jsonlz4",
    ""
  );

  expectedPingList.push({
    id: FAKE_ID1,
    type: "foo",
    timestampCreated: 2,
  });
  expectedPingList.push({
    id: FAKE_ID2,
    type: "foo",
    timestampCreated: 3,
  });
  expectedPingList.push({
    id: FAKE_ID3,
    type: "foo",
    timestampCreated: 4,
  });
  expectedPingList.sort((a, b) => a.timestampCreated - b.timestampCreated);

  // Reset the TelemetryArchive so we scan the archived dir again.
  await TelemetryController.testReset();

  // Check that we are still picking up the valid archived pings on disk,
  // plus the valid ones above.
  pingList = await TelemetryArchive.promiseArchivedPingList();
  Assert.deepEqual(
    expectedPingList,
    pingList,
    "Should have picked up valid archived pings"
  );
  await checkLoadingPings();

  // Now check that we fail to load the two invalid pings from above.
  Assert.ok(
    await promiseRejects(TelemetryArchive.promiseArchivedPingById(FAKE_ID1)),
    "Should have rejected invalid ping"
  );
  Assert.ok(
    await promiseRejects(TelemetryArchive.promiseArchivedPingById(FAKE_ID2)),
    "Should have rejected invalid ping"
  );
});

add_task(async function test_archiveCleanup() {
  const PING_TYPE = "foo";

  // Empty the archive.
  await IOUtils.remove(gPingsArchivePath, { recursive: true });

  Services.fog.testResetFOG();

  // Build the cache. Nothing should be evicted as there's no ping directory.
  await TelemetryController.testReset();
  await TelemetryStorage.testCleanupTaskPromise();
  await TelemetryArchive.promiseArchivedPingList();

  Assert.equal(
    Glean.telemetry.archiveScanPingCount.testGetValue().sum,
    0,
    "Telemetry must report 0 pings scanned if no archive dir exists."
  );
  // One directory out of four was removed as well.
  Assert.equal(
    Glean.telemetry.archiveEvictedOldDirs.testGetValue()?.sum ?? 0,
    0,
    "Telemetry must report 0 evicted dirs if no archive dir exists."
  );

  let expectedPrunedInfo = [];
  let expectedNotPrunedInfo = [];

  let checkArchive = async function () {
    // Check that the pruned pings are not on disk anymore.
    for (let prunedInfo of expectedPrunedInfo) {
      await Assert.rejects(
        TelemetryArchive.promiseArchivedPingById(prunedInfo.id),
        /TelemetryStorage.loadArchivedPing - no ping with id/,
        "Ping " + prunedInfo.id + " should have been pruned."
      );
      const pingPath = TelemetryStorage._testGetArchivedPingPath(
        prunedInfo.id,
        prunedInfo.creationDate,
        PING_TYPE
      );
      Assert.ok(
        !(await IOUtils.exists(pingPath)),
        "The ping should not be on the disk anymore."
      );
    }

    // Check that the expected pings are there.
    for (let expectedInfo of expectedNotPrunedInfo) {
      Assert.ok(
        await TelemetryArchive.promiseArchivedPingById(expectedInfo.id),
        "Ping" + expectedInfo.id + " should be in the archive."
      );
    }
  };

  // Create a ping which should be pruned because it is past the retention period.
  let date = fakeNow(2010, 1, 1, 1, 0, 0);
  let firstDate = date;
  let pingId = await TelemetryController.submitExternalPing(PING_TYPE, {}, {});
  expectedPrunedInfo.push({ id: pingId, creationDate: date });

  // Create a ping which should be kept because it is within the retention period.
  const oldestDirectoryDate = fakeNow(2010, 2, 1, 1, 0, 0);
  pingId = await TelemetryController.submitExternalPing(PING_TYPE, {}, {});
  expectedNotPrunedInfo.push({ id: pingId, creationDate: oldestDirectoryDate });

  // Create 20 other pings which are within the retention period, but would be affected
  // by the disk quota.
  for (let month of [3, 4]) {
    for (let minute = 0; minute < 10; minute++) {
      date = fakeNow(2010, month, 1, 1, minute, 0);
      pingId = await TelemetryController.submitExternalPing(PING_TYPE, {}, {});
      expectedNotPrunedInfo.push({ id: pingId, creationDate: date });
    }
  }

  // We expect all the pings we archived to be in this histogram.
  Assert.equal(
    Glean.telemetry.archiveSessionPingCount.testGetValue(),
    22,
    "All the pings must be live-accumulated in the histogram."
  );
  // Reset the histogram that will be populated by the archive scan.
  Services.fog.testResetFOG();

  // Move the current date 60 days ahead of the first ping.
  fakeNow(futureDate(firstDate, 60 * MILLISECONDS_PER_DAY));
  // Reset TelemetryArchive and TelemetryController to start the startup cleanup.
  await TelemetryController.testReset();
  // Wait for the cleanup to finish.
  await TelemetryStorage.testCleanupTaskPromise();
  // Then scan the archived dir.
  await TelemetryArchive.promiseArchivedPingList();

  // Check that the archive is in the correct state.
  await checkArchive();

  // Make sure the ping count is correct after the scan (one ping was removed).
  Assert.equal(
    Glean.telemetry.archiveScanPingCount.testGetValue().sum,
    21,
    "The histogram must count all the pings in the archive."
  );
  // One directory out of four was removed as well.
  Assert.equal(
    Glean.telemetry.archiveEvictedOldDirs.testGetValue().sum,
    1,
    "Telemetry must correctly report removed archive directories."
  );
  // Check that the remaining directories are correctly counted.
  Assert.equal(
    Glean.telemetry.archiveDirectoriesCount.testGetValue().sum,
    3,
    "Telemetry must correctly report the remaining archive directories."
  );
  // Check that the remaining directories are correctly counted.
  const oldestAgeInMonths = 1;
  Assert.equal(
    Glean.telemetry.archiveOldestDirectoryAge.testGetValue().sum,
    oldestAgeInMonths,
    "Telemetry must correctly report age of the oldest directory in the archive."
  );

  // We need to test the archive size before we hit the quota, otherwise a special
  // value is recorded.

  // Move the current date 60 days ahead of the second ping.
  fakeNow(futureDate(oldestDirectoryDate, 60 * MILLISECONDS_PER_DAY));
  // Reset TelemetryController and TelemetryArchive.
  await TelemetryController.testReset();
  Services.fog.testResetFOG();
  // Wait for the cleanup to finish.
  await TelemetryStorage.testCleanupTaskPromise();
  // Then scan the archived dir again.
  await TelemetryArchive.promiseArchivedPingList();

  // Move the oldest ping to the unexpected pings list.
  expectedPrunedInfo.push(expectedNotPrunedInfo.shift());
  // Check that the archive is in the correct state.
  await checkArchive();

  // Find how much disk space the archive takes.
  const archivedPingsInfo = await getArchivedPingsInfo();
  let archiveSizeInBytes = archivedPingsInfo.reduce(
    (lastResult, element) => lastResult + element.size,
    0
  );

  // Check that the correct values for quota probes are reported when no quota is hit.
  Assert.equal(
    Glean.telemetry.archiveSize.testGetValue().sum,
    Math.round(archiveSizeInBytes / 1024 / 1024),
    "Telemetry must report the correct archive size."
  );
  Assert.equal(
    Glean.telemetry.archiveEvictedOverQuota.testGetValue().sum,
    0,
    "Telemetry must report 0 evictions if quota is not hit."
  );
  // TODO(bug 2049040): The minimum duration is 1ms in Glean.
  Assert.deepEqual(
    Glean.telemetry.archiveEvictingOverQuota.testGetValue().sum,
    1000000,
    "Telemetry must report a null elapsed time if quota is not hit."
  );

  // Set the quota to 80% of the space.
  const testQuotaInBytes = archiveSizeInBytes * 0.8;
  fakeStorageQuota(testQuotaInBytes);

  // The storage prunes archived pings until we reach 90% of the requested storage quota.
  // Based on that, find how many pings should be kept.
  const safeQuotaSize = testQuotaInBytes * 0.9;
  let sizeInBytes = 0;
  let pingsWithinQuota = [];
  let pingsOutsideQuota = [];

  for (let pingInfo of archivedPingsInfo) {
    sizeInBytes += pingInfo.size;
    if (sizeInBytes >= safeQuotaSize) {
      pingsOutsideQuota.push({
        id: pingInfo.id,
        creationDate: new Date(pingInfo.timestamp),
      });
      continue;
    }
    pingsWithinQuota.push({
      id: pingInfo.id,
      creationDate: new Date(pingInfo.timestamp),
    });
  }

  expectedNotPrunedInfo = pingsWithinQuota;
  expectedPrunedInfo = expectedPrunedInfo.concat(pingsOutsideQuota);

  // Reset TelemetryArchive and TelemetryController to start the startup cleanup.
  await TelemetryController.testReset();
  await TelemetryStorage.testCleanupTaskPromise();
  await TelemetryArchive.promiseArchivedPingList();
  // Check that the archive is in the correct state.
  await checkArchive();

  Assert.equal(
    Glean.telemetry.archiveEvictedOverQuota.testGetValue().sum,
    pingsOutsideQuota.length,
    "Telemetry must correctly report the over quota pings evicted from the archive."
  );
  Assert.equal(
    Glean.telemetry.archiveSize.testGetValue().sum,
    300 * 1024 * 1024,
    "Archive quota was hit, a special size must be reported."
  );

  // Trigger a cleanup again and make sure we're not removing anything.
  await TelemetryController.testReset();
  await TelemetryStorage.testCleanupTaskPromise();
  await TelemetryArchive.promiseArchivedPingList();
  await checkArchive();

  const OVERSIZED_PING_ID = "9b21ec8f-f762-4d28-a2c1-44e1c4694f24";
  // Create and archive an oversized, uncompressed, ping.
  const OVERSIZED_PING = {
    id: OVERSIZED_PING_ID,
    type: PING_TYPE,
    creationDate: new Date().toISOString(),
    // Generate a ~2MB string to use as the payload.
    payload: generateRandomString(2 * 1024 * 1024),
  };
  await TelemetryArchive.promiseArchivePing(OVERSIZED_PING);

  // Get the size of the archived ping.
  const oversizedPingPath =
    TelemetryStorage._testGetArchivedPingPath(
      OVERSIZED_PING.id,
      new Date(OVERSIZED_PING.creationDate),
      PING_TYPE
    ) + "lz4";
  const archivedPingSizeMB = Math.floor(
    (await IOUtils.stat(oversizedPingPath)).size / 1024 / 1024
  );

  // We expect the oversized ping to be pruned when scanning the archive.
  expectedPrunedInfo.push({
    id: OVERSIZED_PING_ID,
    creationDate: new Date(OVERSIZED_PING.creationDate),
  });

  // Scan the archive.
  await TelemetryController.testReset();
  await TelemetryStorage.testCleanupTaskPromise();
  await TelemetryArchive.promiseArchivedPingList();
  // The following also checks that non oversized pings are not removed.
  await checkArchive();

  // Make sure we're correctly updating the related histograms.
  Assert.equal(
    Glean.telemetry.pingSizeExceededArchived.testGetValue(),
    1,
    "Telemetry must report 1 oversized ping in the archive."
  );
  Assert.equal(
    Glean.telemetry.discardedArchivedPingsSize.testGetValue().sum,
    archivedPingSizeMB * 1024 * 1024,
    "Telemetry must report the correct size for the oversized ping."
  );
});

add_task(async function test_clientId() {
  // Check that a ping submitted after the delayed telemetry initialization completed
  // should get a valid client id.
  await TelemetryController.testReset();
  const clientId = await ClientID.getClientID();
  const profileGroupId = await ClientID.getProfileGroupID();

  let id = await TelemetryController.submitExternalPing(
    "test-type",
    {},
    { addClientId: true }
  );
  let ping = await TelemetryArchive.promiseArchivedPingById(id);

  Assert.ok(!!ping, "Should have loaded the ping.");
  Assert.ok("clientId" in ping, "Ping should have a client id.");
  Assert.ok(UUID_REGEX.test(ping.clientId), "Client id is in UUID format.");
  Assert.equal(
    ping.clientId,
    clientId,
    "Ping client id should match the global client id."
  );
  Assert.ok("profileGroupId" in ping, "Ping should have a profile group id.");
  Assert.ok(
    UUID_REGEX.test(ping.profileGroupId),
    "Profile group id is in UUID format."
  );
  Assert.equal(
    ping.profileGroupId,
    profileGroupId,
    "Ping profile group id should match the global profile group id."
  );

  // We should have cached the client id now. Lets confirm that by
  // checking the client id on a ping submitted before the async
  // controller setup is finished.
  let promiseSetup = TelemetryController.testReset();
  id = await TelemetryController.submitExternalPing(
    "test-type",
    {},
    { addClientId: true }
  );
  ping = await TelemetryArchive.promiseArchivedPingById(id);
  Assert.equal(ping.clientId, clientId);

  // Finish setup.
  await promiseSetup;
});

add_task(async function test_InvalidPingType() {
  const TYPES = [
    "a",
    "-",
    "¿€€€?",
    "-foo-",
    "-moo",
    "zoo-",
    ".bar",
    "asfd.asdf",
  ];

  for (let type of TYPES) {
    Assert.ok(
      !(type in Glean.telemetry.invalidPingTypeSubmitted.testGetValue()),
      "Should not have counted this invalid ping yet: " + type
    );
    Assert.ok(
      promiseRejects(TelemetryController.submitExternalPing(type, {})),
      "Ping type should have been rejected."
    );
    Assert.equal(
      Glean.telemetry.invalidPingTypeSubmitted.testGetValue()[type],
      1,
      "Should have counted this as an invalid ping type."
    );
  }
});

add_task(async function test_InvalidPayloadType() {
  const PAYLOAD_TYPES = [19, "string", [1, 2, 3, 4], null, undefined];

  for (let i = 0; i < PAYLOAD_TYPES.length; i++) {
    Services.fog.testResetFOG();
    Assert.equal(
      Glean.telemetry.invalidPayloadSubmitted.testGetValue(),
      null,
      "Should not have counted this invalid payload yet: " +
        JSON.stringify(PAYLOAD_TYPES[i])
    );
    Assert.ok(
      await promiseRejects(
        TelemetryController.submitExternalPing("payload-test", PAYLOAD_TYPES[i])
      ),
      "Payload type should have been rejected."
    );
    Assert.equal(
      Glean.telemetry.invalidPayloadSubmitted.testGetValue(),
      1,
      "Should have counted this as an invalid payload type."
    );
  }
});

add_task(async function test_currentPingData() {
  await TelemetryController.testSetup();

  // Setup test data.
  let h = Telemetry.getHistogramById("TELEMETRY_TEST_COUNT");
  h.clear();
  Glean.testOnlyIpc.aCounterForHgram.add();
  let k = Telemetry.getKeyedHistogramById("TELEMETRY_TEST_KEYED_COUNT");
  k.clear();
  Glean.testOnlyIpc.aLabeledCounterForKeyedCountHgram.a.add(1);

  // Get current ping data objects and check that their data is sane.
  for (let subsession of [true, false]) {
    let ping = TelemetryController.getCurrentPingData(subsession);

    Assert.ok(!!ping, "Should have gotten a ping.");
    Assert.equal(ping.type, "main", "Ping should have correct type.");
    const expectedReason = subsession
      ? "gather-subsession-payload"
      : "gather-payload";
    Assert.equal(
      ping.payload.info.reason,
      expectedReason,
      "Ping should have the correct reason."
    );

    let id = "TELEMETRY_TEST_COUNT";
    Assert.ok(
      id in ping.payload.histograms,
      "Payload should have test count histogram."
    );
    Assert.equal(
      ping.payload.histograms[id].sum,
      1,
      "Test count value should match."
    );
    id = "TELEMETRY_TEST_KEYED_COUNT";
    Assert.ok(
      id in ping.payload.keyedHistograms,
      "Payload should have keyed test histogram."
    );
    Assert.equal(
      ping.payload.keyedHistograms[id].a.sum,
      1,
      "Keyed test value should match."
    );
  }
});

add_task(async function test_shutdown() {
  await TelemetryController.testShutdown();
});
