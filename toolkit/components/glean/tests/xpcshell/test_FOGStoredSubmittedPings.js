/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(function test_setup() {
  // Give FOG a temp profile to init within.
  do_get_profile();

  // We need to initialize it once, otherwise operations will be stuck in the pre-init queue.
  Services.fog.initializeFOG();
});

add_task(function test_fog_submitted_pings_stored() {
  // TODO: Bug 2074576: `testGetValue` is used throughout this test as a proxy to `glean.block_on_dispatcher`.
  Services.fog.setLogPings(true);
  Services.fog.setStoreSubmittedPingsEnabled(false);
  GleanPings.testPing.submit();

  Assert.equal(
    Services.fog.getAllStoredSubmittedPings().length,
    0,
    "There should be no stored submitted pings yet."
  );

  Services.fog.setStoreSubmittedPingsEnabled(true);
  GleanPings.testPing.submit();
  const pings = Services.fog.getAllStoredSubmittedPings();
  Assert.greater(
    pings.length,
    0,
    "There should at least one stored submitted ping."
  );
  Assert.equal(
    pings.filter(p => p.ping === "test-ping").length,
    1,
    "test-ping should have been one of the submitted pings"
  );

  GleanPings.pingForPingStorageTest.submit();
  Assert.greater(
    Services.fog.getAllStoredSubmittedPings().length,
    1,
    "There should at least two stored submitted pings."
  );
  Assert.equal(
    Services.fog.getStoredSubmittedPingsByName("ping-for-ping-storage-test")
      .length,
    1,
    "There should one stored submitted 'additional-ping-for-ping-storage-test' ping."
  );

  Services.fog.clearStoredSubmittedPings();
  Assert.equal(
    Services.fog.getAllStoredSubmittedPings().length,
    0,
    "There should be no stored submitted pings anymore."
  );
});
