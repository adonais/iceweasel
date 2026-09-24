/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Regression test for the explicit-target half of the sPendingWriteData
 * coalescing bug (see also test_backupPrefFile.js, bug 2053962).
 *
 * savePrefFile(aFile), for an aFile other than the profile's prefs.js, used to
 * hand its snapshot to the shared sPendingWriteData slot. If an asynchronous
 * prefs.js write was already parked there, the call took a coalescing
 * early-return and aFile was silently never written, even though savePrefFile()
 * reported success. Affected callers include profile migration and the browser
 * toolbox, both of which save prefs to a file in another profile.
 *
 * Dirtying a pref schedules that asynchronous prefs.js write, and nsIPrefService
 * .dirty says when it has been handed off: the flag is cleared in the same
 * main-thread turn that parks the snapshot in sPendingWriteData and dispatches
 * the background write. So a true -> false transition across the yield below
 * marks the one turn whose savePrefFile() has to cope with an occupied slot.
 *
 * The loop body is deliberately free of any await other than that single yield:
 * a scheduled write can only be dispatched while the main thread is in the
 * event loop, so the yield is the only point at which the slot can be filled.
 */

const kPref = "test.savePrefFile.explicit.target";
const kIterations = 2;
// Enough concurrent backups to keep the pref-write task queue busy, so that the
// background write dispatched during the yield below is still waiting its turn
// when savePrefFile() decides what to do about the shared slot. Without this
// backlog the slot could be drained again before savePrefFile() looks at it,
// and the turn would test nothing.
const kFillerCount = 4;
// Safety bound only; the loop normally exits as soon as the write scheduled
// 500ms out (PREF_DELAY_MS in Preferences.cpp) is handed off.
const kTimeoutMs = 10000;

function nextMainThreadTask() {
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

// A fresh nsIFile every time, because nsIFile caches what it has stat()ed.
function diskFile(path) {
  let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  return file;
}

function readIntPrefFromFile(contents, name) {
  let value = null;
  Services.prefs.parsePrefsFromBuffer(contents, {
    onStringPref() {},
    onIntPref(_kind, prefName, prefValue) {
      if (prefName == name) {
        value = prefValue;
      }
    },
    onBoolPref() {},
    onError(message) {
      Assert.ok(false, "Error while parsing saved pref file: " + message);
    },
  });
  return value;
}

add_task(async function test_savePrefFile_explicit_target_not_coalesced() {
  let targetPath = PathUtils.join(
    PathUtils.tempDir,
    "prefs-explicit-target.js"
  );
  let targetFile = await IOUtils.getFile(targetPath);

  let fillerPaths = [];
  let fillerFiles = [];
  for (let i = 0; i < kFillerCount; i++) {
    let path = PathUtils.join(PathUtils.tempDir, `prefs-queue-filler-${i}.js`);
    fillerPaths.push(path);
    fillerFiles.push(await IOUtils.getFile(path));
  }

  // Tracked so that cleanup doesn't try to remove a file that a backup is
  // still writing, should the test bail out mid-iteration.
  let pending = [];

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(kPref);
    await Promise.allSettled(pending);
    for (let path of [targetPath, ...fillerPaths]) {
      await IOUtils.remove(path, { ignoreAbsent: true });
    }
  });

  for (let iteration = 0; iteration < kIterations; iteration++) {
    // Dirty the prefs, which is what schedules the asynchronous prefs.js write.
    Services.prefs.setIntPref(kPref, iteration);

    // Only a main-thread turn can clear this, so it is still set here.
    let wasDirty = Services.prefs.dirty;
    Assert.ok(
      wasDirty,
      `Iteration ${iteration}: setting a pref scheduled a prefs.js write.`
    );

    let turns = 0;
    let missed = false;
    let sawHandoff = false;
    let deadline = Date.now() + kTimeoutMs;
    while (!sawHandoff && !missed && Date.now() < deadline) {
      turns++;

      if (diskFile(targetPath).exists()) {
        diskFile(targetPath).remove(false);
      }

      // Give the shared pref-write task queue a backlog to work through.
      for (let file of fillerFiles) {
        pending.push(Services.prefs.backupPrefFile(file));
      }

      // The only yield in this loop. If the scheduled write is due, its
      // runnable runs now: it parks the prefs.js snapshot in sPendingWriteData
      // and dispatches a background write stuck behind the fillers above.
      await nextMainThreadTask();

      let isDirty = Services.prefs.dirty;
      sawHandoff = wasDirty && !isDirty;
      wasDirty = isDirty;

      // Whatever state the shared slot is in, this has to write targetFile. The
      // failure mode is a silent no-op: it reports success either way.
      Services.prefs.savePrefFile(targetFile);

      missed = !diskFile(targetPath).exists();
    }

    info(`Iteration ${iteration}: ${turns} main-thread turns.`);

    Assert.ok(
      !missed,
      `Iteration ${iteration}: savePrefFile() wrote the file it was given.`
    );
    // Either the handoff was observed, or the check above caught the bug before
    // it could be. Both mean the loop covered the window; neither happening
    // would mean it timed out and proved nothing.
    Assert.ok(
      sawHandoff || missed,
      `Iteration ${iteration}: the loop covered the window where the ` +
        `asynchronous prefs.js write was pending.`
    );

    await Promise.all(pending);
    pending = [];

    Services.prefs.savePrefFile(targetFile);
    let contents = await IOUtils.read(targetPath);
    Assert.equal(
      readIntPrefFromFile(contents, kPref),
      iteration,
      `Iteration ${iteration}: the file holds the current pref value.`
    );
  }
});
