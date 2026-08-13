/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that we can create a backup of the preferences state to
 * a file asynchronously.
 */
add_task(async function test_backupPrefFile() {
  // Create a backup of the preferences state to a file.
  Services.prefs.setBoolPref("test.backup", true);

  let backupFilePath = PathUtils.join(PathUtils.tempDir, "prefs-backup.js");
  let backupFile = await IOUtils.getFile(backupFilePath);
  await Services.prefs.backupPrefFile(backupFile);

  // Verify that the backup file was created and contains the expected content.
  let backupContent = await IOUtils.read(backupFilePath, { encoding: "utf-8" });

  let sawTestValue = false;

  // Now parse the backup file and verify that it contains the expected
  // preference value. We'll not worry about any of the other preferences.
  let observer = {
    onStringPref() {},
    onIntPref() {},
    onBoolPref(kind, name, value, _isSticky, _isLocked) {
      if (name == "test.backup" && value) {
        sawTestValue = true;
      }
    },
    onError(message) {
      Assert.ok(false, "Error while parsing backup file: " + message);
    },
  };
  Services.prefs.parsePrefsFromBuffer(backupContent, observer);

  Assert.ok(
    sawTestValue,
    "The backup file contains the expected preference value."
  );

  // Clean up the backup file.
  await IOUtils.remove(backupFilePath);
});

/**
 * Regression test for bug 2053962.
 *
 * When several backupPrefFile() calls are issued in the same main-thread turn,
 * a later call used to observe an earlier call's not-yet-flushed data still
 * sitting in the shared sPendingWriteData slot. It would then take a coalescing
 * early-return path that dropped the call's MozPromise without ever resolving,
 * rejecting, or disconnecting it, crashing with a diagnostic assert
 * ("MozPromise::ThenValue ... destroyed without being either disconnected,
 * resolved, or rejected"). The same path also left the backup's (filtered) data
 * in the slot, so it could be written to the wrong file.
 *
 * Every backup must settle its promise and receive its own content.
 */
add_task(async function test_concurrent_backups_bug2053962() {
  const kIdPref = "test.backup.concurrent.id";
  // Make it a known user pref so the override map can target it and so it is
  // written to the backup files.
  Services.prefs.setIntPref(kIdPref, -1);

  const kCount = 20;

  // Resolve every nsIFile and build every override map up front, so the
  // backupPrefFile() calls below run in a single synchronous burst with no
  // main-thread yield in between. That is what makes one call observe the
  // previous call's data in sPendingWriteData.
  let files = [];
  let overrideMaps = [];
  for (let i = 0; i < kCount; i++) {
    let path = PathUtils.join(
      PathUtils.tempDir,
      `prefs-backup-bug2053962-${i}.js`
    );
    files.push(await IOUtils.getFile(path));

    let overrideMap = Cc["@mozilla.org/pref-override-map;1"].createInstance(
      Ci.nsIPrefOverrideMap
    );
    // Give each backup a distinct value for kIdPref, so we can detect a backup
    // being written with another backup's data.
    overrideMap.addEntry(kIdPref, i);
    overrideMaps.push(overrideMap);
  }

  // The synchronous burst. No awaits in this loop.
  let promises = [];
  for (let i = 0; i < kCount; i++) {
    promises.push(Services.prefs.backupPrefFile(files[i], overrideMaps[i]));
  }

  // Before the fix this either crashed (diagnostic builds) or hung here as a
  // dropped promise never settled.
  await Promise.all(promises);

  // Each backup must contain its own override value, not another backup's.
  for (let i = 0; i < kCount; i++) {
    let content = await IOUtils.read(files[i].path, { encoding: "utf-8" });

    let seenId = null;
    Services.prefs.parsePrefsFromBuffer(content, {
      onStringPref() {},
      onIntPref(_kind, name, value) {
        if (name == kIdPref) {
          seenId = value;
        }
      },
      onBoolPref() {},
      onError(message) {
        Assert.ok(false, `Error while parsing backup ${i}: ${message}`);
      },
    });

    Assert.equal(seenId, i, `Backup ${i} contains its own override value.`);
  }

  // Clean up.
  for (let file of files) {
    await IOUtils.remove(file.path);
  }
});
