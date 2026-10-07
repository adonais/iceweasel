/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PushNotificationHelperRegistry } = ChromeUtils.importESModule(
  "resource://gre/modules/PushNotificationHelperRegistry.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);

const SEPARATOR = "|";

function vendorName() {
  return Services.appinfo.vendor || "Mozilla";
}

function helperKeyPath() {
  return `Software\\${vendorName()}\\${Services.appinfo.name}\\Notification Helper`;
}

function openHelperKey() {
  const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
    Ci.nsIWindowsRegKey
  );
  key.create(
    key.ROOT_KEY_CURRENT_USER,
    helperKeyPath(),
    key.ACCESS_READ | key.ACCESS_WRITE | key.WOW64_64
  );
  return key;
}

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

add_setup(() => {
  // Gives Services.appinfo a name and a vendor, so the key lands under an
  // xpcshell-specific path rather than the real application's one
  updateAppInfo();

  // Makes ProfD available
  do_get_profile();

  registerCleanupFunction(() => {
    try {
      const parent = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
        Ci.nsIWindowsRegKey
      );
      parent.open(
        parent.ROOT_KEY_CURRENT_USER,
        `Software\\${vendorName()}\\${Services.appinfo.name}`,
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
  const profD = Services.dirsvc.get("ProfD", Ci.nsIFile).path;

  Assert.equal(
    PushNotificationHelperRegistry.valueName,
    installDir() + SEPARATOR + profD,
    "the value name is the install directory and the profile directory"
  );
});

add_task(function test_add_then_remove() {
  Assert.ok(
    !PushNotificationHelperRegistry.has(),
    "no entry before anything is recorded"
  );

  PushNotificationHelperRegistry.add();

  Assert.ok(
    PushNotificationHelperRegistry.has(),
    "the entry exists after recording"
  );

  const key = openHelperKey();
  try {
    Assert.equal(
      key.readIntValue(PushNotificationHelperRegistry.valueName),
      1,
      "the entry holds a marker value"
    );
  } finally {
    key.close();
  }

  PushNotificationHelperRegistry.remove();

  Assert.ok(
    !PushNotificationHelperRegistry.has(),
    "the entry is gone after removal"
  );

  // Removing an absent entry is fine
  PushNotificationHelperRegistry.remove();
});

add_task(function test_add_twice_keeps_one_entry() {
  PushNotificationHelperRegistry.add();
  PushNotificationHelperRegistry.add();

  const key = openHelperKey();
  try {
    const mine = valueNames(key).filter(
      name => name == PushNotificationHelperRegistry.valueName
    );
    Assert.equal(mine.length, 1, "recording twice keeps a single entry");
  } finally {
    key.close();
  }

  PushNotificationHelperRegistry.remove();
});

add_task(function test_prune_removes_dead_profiles_of_this_install() {
  const existingDir = do_get_tempdir().path;
  const missingDir = existingDir + "\\no such dir with spaces and ünïcode";

  const liveEntry = installDir() + SEPARATOR + existingDir;
  const deadEntry = installDir() + SEPARATOR + missingDir;
  const deadEntryUpperCase =
    installDir().toUpperCase() + SEPARATOR + missingDir;
  const foreignEntry = "C:\\No Such Install" + SEPARATOR + missingDir;
  const unrelatedValue = "InitialNotificationShown";

  let key = openHelperKey();
  try {
    for (const name of [
      liveEntry,
      deadEntry,
      deadEntryUpperCase,
      foreignEntry,
      unrelatedValue,
    ]) {
      key.writeIntValue(name, 1);
    }
  } finally {
    key.close();
  }

  PushNotificationHelperRegistry.prune();

  key = openHelperKey();
  try {
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
  } finally {
    key.close();
  }
});
