/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const EXPECTED_LOGINS = LoginTestUtils.testData.loginList();

let migrationCount = 0;

function assertMigrationCount() {
  const migrationValue = Glean.pwmgr.migration.testGetValue();
  if (!migrationValue) {
    return;
  }
  const migrationStartedEvents = migrationValue.filter(
    ({ extra }) => extra.value === "started"
  );
  const migrationSuccessEvents = migrationValue.filter(
    ({ extra }) => extra.value === "success"
  );
  const errorEvents = migrationValue.filter(
    ({ extra }) =>
      extra.value === "decryptionError" || extra.value === "encryptionError"
  );
  Assert.equal(
    migrationCount,
    migrationStartedEvents.length,
    "Should have received the correct number of migrationStarted events"
  );
  Assert.equal(
    migrationCount,
    migrationSuccessEvents.length,
    "Should have received the correct number of migrationFinished events"
  );
  Assert.deepEqual([], errorEvents, "Should have received no error events");
}

async function reencryptAllLogins() {
  assertMigrationCount();
  await Services.logins.reencryptAllLogins();
  migrationCount += 1;
  assertMigrationCount();
}

add_setup(async function () {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("security.sdr.mechanism");
    Services.logins.removeAllLogins();
  });

  do_get_profile();
  Services.fog.initializeFOG();

  Services.prefs.setIntPref("security.sdr.mechanism", 0);
  Services.logins.removeAllLogins();
  await Services.logins.addLogins(EXPECTED_LOGINS);
});

add_task(async function test_before_reencrypt() {
  await LoginTestUtils.checkLogins(
    EXPECTED_LOGINS,
    "Logins should have the expected value before any reencryption"
  );
});

add_task(async function test_reencrypt_same_mechanism() {
  await reencryptAllLogins();

  await LoginTestUtils.checkLogins(
    EXPECTED_LOGINS,
    "Logins should stay the same after regular migration"
  );
});

add_task(async function test_reencrypt_new_mechanism() {
  Services.prefs.setIntPref("security.sdr.mechanism", 1);

  await reencryptAllLogins();

  await LoginTestUtils.checkLogins(
    EXPECTED_LOGINS,
    "Logins should stay the same after regular migration"
  );
});

add_task(async function test_reencrypt_mixed_mechanism() {
  Services.prefs.setIntPref("security.sdr.mechanism", 0);

  // Reencrypt single login with different mechanism
  await Services.logins.modifyLoginAsync(
    EXPECTED_LOGINS[0],
    EXPECTED_LOGINS[0].clone()
  );

  Services.prefs.setIntPref("security.sdr.mechanism", 1);

  // Reencrypt all logins, of which one now is encrypted with a different
  // mechanism
  await reencryptAllLogins();

  await LoginTestUtils.checkLogins(
    EXPECTED_LOGINS,
    "Logins should stay the same after mixed migration"
  );
});

add_task(async function test_reencrypt_race() {
  const reencryptionPromise = reencryptAllLogins();

  const newLogins = EXPECTED_LOGINS.slice();

  newLogins.splice(0, 1);
  Services.logins.removeLogin(EXPECTED_LOGINS[0]);

  newLogins[0] = EXPECTED_LOGINS[1].clone();
  newLogins[0].password = "different password";
  await Services.logins.modifyLoginAsync(EXPECTED_LOGINS[1], newLogins[0]);

  await reencryptionPromise;

  await LoginTestUtils.checkLogins(
    newLogins,
    "In case of other racing login modifications, they should prevail"
  );
});

add_task(async function test_reencrypt_no_logins_present() {
  Services.logins.removeAllLogins();

  await reencryptAllLogins();

  await LoginTestUtils.checkLogins(
    [],
    "The reencryption should go through without problems if no logins are present at all"
  );
});
