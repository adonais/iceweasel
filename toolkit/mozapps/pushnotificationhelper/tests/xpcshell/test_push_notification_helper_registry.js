/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  PushNotificationHelperRegistry,
  buildRegistryKeyPath,
  buildRegistryValueName,
  withRegistryKey,
} = ChromeUtils.importESModule(
  "resource://gre/modules/PushNotificationHelperRegistry.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { WindowsPushNotificationHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/WindowsPushNotificationHelper.sys.mjs"
);

function valueNames(key) {
  const names = [];
  for (let i = 0; i < key.valueCount; i++) {
    names.push(key.getValueName(i));
  }
  return names;
}

function installDir() {
  return Services.dirsvc.get("GreBinD", Ci.nsIFile).path;
}

function profileDir() {
  return Services.dirsvc.get("ProfD", Ci.nsIFile).path;
}

add_setup(() => {
  // Gives Services.appinfo a name and a vendor, so the key lands under an
  // xpcshell-specific path rather than the real application's one
  updateAppInfo();

  // Makes ProfD available
  do_get_profile();

  // Creates the key, so the tasks can open it
  withRegistryKey(() => {}, { create: true });

  registerCleanupFunction(() => {
    try {
      const parent = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
        Ci.nsIWindowsRegKey
      );
      parent.open(
        parent.ROOT_KEY_CURRENT_USER,
        buildRegistryKeyPath().replace(/\\Notification Helper$/, ""),
        parent.ACCESS_ALL | parent.WOW64_64
      );
      try {
        parent.removeChild("Notification Helper");
      } finally {
        parent.close();
      }
    } catch (e) {
      // The key was never created
    }
  });
});

add_task(function test_value_name_shape() {
  PushNotificationHelperRegistry.add(installDir(), profileDir());

  withRegistryKey(key => {
    Assert.deepEqual(
      valueNames(key),
      [buildRegistryValueName(installDir(), profileDir())],
      "the value name is the install directory and the profile directory"
    );
  });

  PushNotificationHelperRegistry.remove(installDir(), profileDir());
});

add_task(function test_add_then_remove() {
  Assert.ok(
    !PushNotificationHelperRegistry.has(installDir(), profileDir()),
    "no entry before anything is recorded"
  );

  PushNotificationHelperRegistry.add(installDir(), profileDir());

  Assert.ok(
    PushNotificationHelperRegistry.has(installDir(), profileDir()),
    "the entry exists after recording"
  );

  withRegistryKey(key => {
    Assert.equal(
      key.readIntValue(buildRegistryValueName(installDir(), profileDir())),
      1,
      "the entry holds a marker value"
    );
  });

  PushNotificationHelperRegistry.remove(installDir(), profileDir());

  Assert.ok(
    !PushNotificationHelperRegistry.has(installDir(), profileDir()),
    "the entry is gone after removal"
  );

  // Removing an absent entry is fine
  PushNotificationHelperRegistry.remove(installDir(), profileDir());
});

add_task(function test_add_twice_keeps_one_entry() {
  PushNotificationHelperRegistry.add(installDir(), profileDir());
  PushNotificationHelperRegistry.add(installDir(), profileDir());

  withRegistryKey(key => {
    const mine = valueNames(key).filter(
      name => name == buildRegistryValueName(installDir(), profileDir())
    );
    Assert.equal(mine.length, 1, "recording twice keeps a single entry");
  });

  PushNotificationHelperRegistry.remove(installDir(), profileDir());
});

add_task(function test_prune_removes_dead_profiles_of_this_install() {
  const existingDir = do_get_tempdir().path;
  const missingDir = existingDir + "\\no such dir with spaces and ünïcode";

  const liveEntry = buildRegistryValueName(installDir(), existingDir);
  const deadEntry = buildRegistryValueName(installDir(), missingDir);
  const deadEntryUpperCase = buildRegistryValueName(
    installDir().toUpperCase(),
    missingDir
  );
  const foreignEntry = buildRegistryValueName(
    "C:\\No Such Install",
    missingDir
  );
  const unrelatedValue = "InitialNotificationShown";

  withRegistryKey(key => {
    for (const name of [
      liveEntry,
      deadEntry,
      deadEntryUpperCase,
      foreignEntry,
      unrelatedValue,
    ]) {
      key.writeIntValue(name, 1);
    }
  });

  PushNotificationHelperRegistry.prune(installDir());

  withRegistryKey(key => {
    const names = valueNames(key);
    Assert.ok(names.includes(liveEntry), "an existing profile is kept");
    Assert.ok(!names.includes(deadEntry), "a missing profile is pruned");
    Assert.ok(
      !names.includes(deadEntryUpperCase),
      "the install directory match ignores case"
    );
    Assert.ok(
      names.includes(foreignEntry),
      "another install's entries are left alone"
    );
    Assert.ok(
      names.includes(unrelatedValue),
      "a value without a separator is left alone"
    );

    for (const name of [liveEntry, foreignEntry, unrelatedValue]) {
      key.removeValue(name);
    }
  });
});

add_task(function test_entries_for_profile() {
  const profile = "C:\\Profiles\\Removed";
  const otherInstall = "C:\\Other Install";
  const mine = buildRegistryValueName(installDir(), profile);
  const theirs = buildRegistryValueName(otherInstall, profile.toUpperCase());
  const otherProfile = buildRegistryValueName(
    installDir(),
    "C:\\Profiles\\Kept"
  );
  const unrelatedValue = "InitialNotificationShown";

  withRegistryKey(key => {
    for (const name of [mine, theirs, otherProfile, unrelatedValue]) {
      key.writeIntValue(name, 1);
    }
  });

  Assert.deepEqual(
    PushNotificationHelperRegistry.getInstallDirsForProfile(profile).sort(),
    [installDir(), otherInstall].sort(),
    "the helpers of every install are found, whatever the case"
  );

  PushNotificationHelperRegistry.remove(installDir(), profile);
  PushNotificationHelperRegistry.remove(installDir(), profile);

  withRegistryKey(key => {
    const names = valueNames(key);
    Assert.ok(!names.includes(mine), "the value is removed");
    Assert.ok(names.includes(theirs), "other values are left alone");

    for (const name of [theirs, otherProfile, unrelatedValue]) {
      key.removeValue(name);
    }
  });
});

add_task(async function test_stop_for_profile_removes_the_entries() {
  const profile = "C:\\Profiles\\Removed";
  // A directory without a helper in it, so nothing is launched
  const noHelperInstall = do_get_tempdir().path;
  const mine = buildRegistryValueName(noHelperInstall, profile);
  const other = buildRegistryValueName(noHelperInstall, "C:\\Profiles\\Kept");

  withRegistryKey(key => {
    key.writeIntValue(mine, 1);
    key.writeIntValue(other, 1);
  });

  await WindowsPushNotificationHelper.stopForProfile(profile);

  withRegistryKey(key => {
    const names = valueNames(key);
    Assert.ok(!names.includes(mine), "the profile's entry is removed");
    Assert.ok(names.includes(other), "another profile's entry is kept");
    key.removeValue(other);
  });
});
