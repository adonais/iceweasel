/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ProfileKekPassword } = ChromeUtils.importESModule(
  "resource://gre/modules/ProfileKekPassword.sys.mjs"
);

const PREF = "security.lockstore.unlock.enabled";
// Duplicated deliberately, so a change to the module's own refs fails here;
// keep in step with ProfileKekPassword.sys.mjs and ProfileKek.h.
const KEK_ID = "profile";
const PW_KEK = `lockstore::kek::password:${KEK_ID}`;
const LOCAL_KEK = `lockstore::kek::local:${KEK_ID}`;

const PW = "correct horse battery staple";
const PW2 = "rotated_password_42";

function getLockstore() {
  return Cc["@mozilla.org/security/lockstore;1"].getService(Ci.nsILockstore);
}

// The module keys everything off one fixed KEK id, so every task reuses the
// same records. Delete them between tasks, DEKs first: deleteKek refuses
// while any DEK is still wrapped under the KEK.
async function resetLockstore() {
  const ls = getLockstore();
  for (const dekName of await ls.listDeks()) {
    await ls.deleteDek(dekName);
  }
  for (const kekRef of [PW_KEK, LOCAL_KEK]) {
    if (await ls.kekExists(kekRef)) {
      await ls.deleteKek(kekRef);
    }
  }
}

async function createLocalKek() {
  return getLockstore().createKek("local", KEK_ID, "", 0);
}

async function createPasswordKek(password) {
  return getLockstore().createKek(
    "password",
    KEK_ID,
    password,
    Number.MAX_SAFE_INTEGER
  );
}

async function assertRejects(promise, message) {
  let threw = false;
  try {
    await promise;
  } catch (e) {
    threw = true;
  }
  Assert.ok(threw, message);
}

add_setup(async function () {
  do_get_profile();
  Services.prefs.setBoolPref(PREF, true);
  registerCleanupFunction(() => Services.prefs.clearUserPref(PREF));
});

add_task(async function test_exists_false_when_pref_disabled() {
  await resetLockstore();
  await createPasswordKek(PW);

  Services.prefs.setBoolPref(PREF, false);
  Assert.ok(
    !(await ProfileKekPassword.exists()),
    "exists() reports false with the link disabled even though the KEK is there"
  );
  Services.prefs.setBoolPref(PREF, true);

  Assert.ok(
    await ProfileKekPassword.exists(),
    "exists() reports the KEK once the link is enabled"
  );
});

add_task(async function test_exists_false_without_kek() {
  await resetLockstore();
  Assert.ok(
    !(await ProfileKekPassword.exists()),
    "exists() is false with no password KEK"
  );
});

add_task(async function test_update_is_a_noop_when_pref_disabled() {
  await resetLockstore();

  Services.prefs.setBoolPref(PREF, false);
  await ProfileKekPassword.update("", PW);
  Services.prefs.setBoolPref(PREF, true);

  Assert.ok(
    !(await getLockstore().kekExists(PW_KEK)),
    "no password KEK is minted while the link is disabled"
  );
});

add_task(async function test_update_sets_first_password() {
  await resetLockstore();

  await ProfileKekPassword.update("", PW);

  const ls = getLockstore();
  Assert.ok(await ls.kekExists(PW_KEK), "password KEK created");
  Assert.ok(
    ls.isKekUnlocked(PW_KEK),
    "the freshly created KEK is unlocked for the session"
  );
});

add_task(async function test_update_empty_to_empty_is_a_noop() {
  await resetLockstore();

  await ProfileKekPassword.update("", "");

  const ls = getLockstore();
  Assert.ok(!(await ls.kekExists(PW_KEK)), "no password KEK minted");
  Assert.ok(!(await ls.kekExists(LOCAL_KEK)), "no local KEK minted");
});

add_task(async function test_update_migrates_existing_deks_onto_password() {
  await resetLockstore();
  const ls = getLockstore();
  await createLocalKek();
  await ls.createDek("places.sqlite", LOCAL_KEK, true, 32);
  const before = await ls.getDek("places.sqlite", LOCAL_KEK);

  await ProfileKekPassword.update("", PW);

  Assert.ok(await ls.kekExists(PW_KEK), "password KEK created");
  Assert.ok(
    !(await ls.kekExists(LOCAL_KEK)),
    "the emptied local KEK is dropped, so the DEK is no longer readable " +
      "without the primary password"
  );
  Assert.deepEqual(
    await ls.listKeks("places.sqlite"),
    [PW_KEK],
    "the DEK is wrapped under the password KEK alone"
  );
  Assert.deepEqual(
    await ls.getDek("places.sqlite", PW_KEK),
    before,
    "the DEK bytes survive the migration"
  );
});

add_task(async function test_update_changes_password_and_keeps_deks() {
  await resetLockstore();
  const ls = getLockstore();
  await createPasswordKek(PW);
  await ls.createDek("places.sqlite", PW_KEK, true, 32);
  const before = await ls.getDek("places.sqlite", PW_KEK);

  await ProfileKekPassword.update(PW, PW2);

  Assert.ok(await ls.kekExists(PW_KEK), "the password KEK is still there");
  Assert.ok(
    ls.isKekUnlocked(PW_KEK),
    "the session unlock is restored after the change"
  );
  Assert.deepEqual(
    await ls.getDek("places.sqlite", PW_KEK),
    before,
    "the DEK bytes survive the password change"
  );

  await ls.lockKek(PW_KEK);
  await assertRejects(
    ls.unlockKek(PW_KEK, PW, 60_000),
    "the old password no longer unlocks the KEK"
  );
  await ls.unlockKek(PW_KEK, PW2, 60_000);
});

add_task(async function test_update_wrong_old_password_rejects() {
  await resetLockstore();
  const ls = getLockstore();
  await createPasswordKek(PW);
  await ls.lockKek(PW_KEK);

  await assertRejects(
    ProfileKekPassword.update("not-the-password", PW2),
    "update() surfaces the failed unlock rather than rewrapping"
  );

  await ls.unlockKek(PW_KEK, PW, 60_000);
  Assert.ok(
    await ls.kekExists(PW_KEK),
    "the KEK is still keyed to the original password"
  );
});

add_task(async function test_update_removes_password_and_falls_back_to_local() {
  await resetLockstore();
  const ls = getLockstore();
  await createPasswordKek(PW);
  await ls.createDek("places.sqlite", PW_KEK, true, 32);
  const before = await ls.getDek("places.sqlite", PW_KEK);

  await ProfileKekPassword.update(PW, "");

  Assert.ok(
    !(await ls.kekExists(PW_KEK)),
    "the emptied password KEK is dropped"
  );
  Assert.ok(await ls.kekExists(LOCAL_KEK), "the local KEK took over");
  Assert.deepEqual(
    await ls.getDek("places.sqlite", LOCAL_KEK),
    before,
    "the DEK bytes survive the rollback, so the profile stays readable"
  );
});

add_task(async function test_discard_unlocked_preserves_deks() {
  await resetLockstore();
  const ls = getLockstore();
  await createPasswordKek(PW);
  await ls.createDek("places.sqlite", PW_KEK, true, 32);
  const before = await ls.getDek("places.sqlite", PW_KEK);
  Assert.ok(ls.isKekUnlocked(PW_KEK), "precondition: the KEK is unlocked");

  await ProfileKekPassword.discard();

  Assert.ok(!(await ls.kekExists(PW_KEK)), "the password KEK is gone");
  Assert.deepEqual(
    await ls.getDek("places.sqlite", LOCAL_KEK),
    before,
    "an unlocked discard moves the DEKs to the local KEK instead of " +
      "destroying them"
  );
});

add_task(async function test_discard_locked_drops_unrecoverable_deks() {
  await resetLockstore();
  const ls = getLockstore();
  await createPasswordKek(PW);
  await createLocalKek();
  await ls.createDek("places.sqlite", PW_KEK, true, 32);
  await ls.createDek("cookies.sqlite", LOCAL_KEK, true, 32);
  const survivor = await ls.getDek("cookies.sqlite", LOCAL_KEK);
  await ls.lockKek(PW_KEK);

  await ProfileKekPassword.discard();

  Assert.ok(!(await ls.kekExists(PW_KEK)), "the password KEK is gone");
  Assert.ok(
    !(await ls.dekExists("places.sqlite")),
    "a DEK nothing can unwrap again is deleted"
  );
  Assert.ok(
    await ls.dekExists("cookies.sqlite"),
    "a DEK under the local KEK is untouched"
  );
  Assert.deepEqual(
    await ls.getDek("cookies.sqlite", LOCAL_KEK),
    survivor,
    "the surviving DEK is still readable"
  );
});

add_task(async function test_discard_ignores_the_pref() {
  await resetLockstore();
  const ls = getLockstore();
  await createPasswordKek(PW);

  Services.prefs.setBoolPref(PREF, false);
  await ProfileKekPassword.discard();
  Services.prefs.setBoolPref(PREF, true);

  // A KEK that outlived the pref going off is exactly the one the reset
  // leaves keyed to a destroyed password, so discard() ignores the pref.
  Assert.ok(
    !(await ls.kekExists(PW_KEK)),
    "discard() drops the password KEK even with the link disabled"
  );
});

add_task(async function test_discard_without_kek_is_a_noop() {
  await resetLockstore();
  await ProfileKekPassword.discard();
  Assert.ok(
    !(await getLockstore().kekExists(PW_KEK)),
    "discard() with nothing to discard does nothing"
  );
});

// The helpers below take the lockstore as an argument, so their failure paths
// can be driven with a stub rather than by breaking the real keystore.

add_task(async function test_moveDeks_rolls_back_the_target_on_failure() {
  const deleted = [];
  const stub = {
    migrateDeks: () => Promise.reject(new Error("migrate failed")),
    deleteKek: kekRef => {
      deleted.push(kekRef);
      return Promise.resolve();
    },
  };

  await assertRejects(
    ProfileKekPassword.moveDeks(stub, PW_KEK, LOCAL_KEK),
    "a failed migration is reported to the caller"
  );
  Assert.deepEqual(
    deleted,
    [LOCAL_KEK],
    "only the empty target KEK is dropped; the source still holds the DEKs"
  );
});

add_task(async function test_moveDeks_drops_the_emptied_source() {
  const deleted = [];
  const stub = {
    migrateDeks: () => Promise.resolve(),
    deleteKek: kekRef => {
      deleted.push(kekRef);
      return Promise.resolve();
    },
  };

  await ProfileKekPassword.moveDeks(stub, PW_KEK, LOCAL_KEK);

  Assert.deepEqual(deleted, [PW_KEK], "the emptied source KEK is dropped");
});

add_task(async function test_moveDeks_survives_a_failed_cleanup() {
  const stub = {
    migrateDeks: () => Promise.resolve(),
    deleteKek: () => Promise.reject(new Error("delete failed")),
  };

  // A leftover source KEK is harmless; it must not turn a completed
  // migration into a reported failure.
  await ProfileKekPassword.moveDeks(stub, PW_KEK, LOCAL_KEK);
  Assert.ok(true, "moveDeks resolved despite the cleanup failure");
});

add_task(async function test_changePassword_skips_unlock_when_locked() {
  const calls = [];
  const stub = {
    isKekUnlocked: () => false,
    changeKekPassword: () => {
      calls.push("change");
      return Promise.resolve();
    },
    unlockKek: () => {
      calls.push("unlock");
      return Promise.resolve();
    },
  };

  await ProfileKekPassword.changePassword(stub, PW, PW2);

  Assert.deepEqual(
    calls,
    ["change"],
    "a KEK that was locked to begin with is not unlocked as a side effect"
  );
});

add_task(async function test_changePassword_tolerates_failed_unlock() {
  const stub = {
    isKekUnlocked: () => true,
    changeKekPassword: () => Promise.resolve(),
    unlockKek: () => Promise.reject(new Error("unlock failed")),
  };

  // A failed restore leaves the KEK locked, which no longer concerns the
  // password change itself: the next startup prompts and unlocks it.
  await ProfileKekPassword.changePassword(stub, PW, PW2);
  Assert.ok(true, "changePassword resolved despite the failed relock");
});
