/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MockRegistry } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistry.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { WindowsLaunchOnLogin } = ChromeUtils.importESModule(
  "resource://gre/modules/launchonlogin/WindowsLaunchOnLogin.sys.mjs"
);

const RUN_KEY = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
const ROOT = Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER;

let registry;
let prefix;
let liveExe;
let missingExe;

function setRunValue(name, value, type = Ci.nsIWindowsRegKey.TYPE_STRING) {
  registry.setValue(ROOT, RUN_KEY, name, value, type);
}

async function runValueNames() {
  let names = [];
  await WindowsLaunchOnLogin.withLaunchOnLoginRegistryKey(wrk => {
    for (let i = 0; i < wrk.valueCount; i++) {
      names.push(wrk.getValueName(i));
    }
  });
  return names.sort();
}

async function resetRunKey() {
  await WindowsLaunchOnLogin.withLaunchOnLoginRegistryKey(wrk => {
    for (let name of Array.from({ length: wrk.valueCount }, (_, i) =>
      wrk.getValueName(i)
    )) {
      wrk.removeValue(name);
    }
  });
}

/**
 * Finds a drive letter with no drive behind it, or null if every letter is
 * taken on this machine.
 */
async function findMissingDrive() {
  for (let code = "Z".charCodeAt(0); code >= "D".charCodeAt(0); code--) {
    let root = String.fromCharCode(code) + ":\\";
    if (!(await IOUtils.exists(root))) {
      return root;
    }
  }
  return null;
}

add_setup(async () => {
  updateAppInfo({ name: "Firefox" });
  registry = new MockRegistry();
  setRunValue("", "");
  registerCleanupFunction(() => registry.shutdown());

  prefix = WindowsLaunchOnLogin.getLaunchOnLoginRegistryNamePrefix();
  Assert.equal(prefix, "Mozilla-Firefox-", "Prefix is vendor and app name");
  Assert.ok(
    WindowsLaunchOnLogin.getLaunchOnLoginRegistryName().startsWith(prefix),
    "Own registry name uses the shared prefix"
  );

  let tmp = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "lol-missing-executables"
  );
  registerCleanupFunction(() => IOUtils.remove(tmp, { recursive: true }));
  liveExe = PathUtils.join(tmp, "live", "firefox.exe");
  await IOUtils.makeDirectory(PathUtils.parent(liveExe));
  await IOUtils.writeUTF8(liveExe, "");
  missingExe = PathUtils.join(tmp, "missing", "firefox.exe");
  Assert.ok(!(await IOUtils.exists(missingExe)), "Missing exe does not exist");
});

add_task(async function test_parse_command() {
  const parse = c => WindowsLaunchOnLogin._getExecutablePathFromCommand(c);
  Assert.equal(
    parse('"C:\\Program Files\\Mozilla Firefox\\firefox.exe" -os-autostart'),
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe"
  );
  Assert.equal(
    parse("C:\\firefox\\firefox.exe -os-autostart"),
    "C:\\firefox\\firefox.exe"
  );
  Assert.equal(parse("C:\\firefox\\firefox.exe"), "C:\\firefox\\firefox.exe");
  Assert.equal(parse('"unterminated'), null);
  Assert.equal(parse('""'), null);
  Assert.equal(parse(""), null);
});

add_task(async function test_is_executable_missing() {
  Assert.ok(
    await WindowsLaunchOnLogin._isExecutableMissing(missingExe),
    "Missing file on an existing drive is missing"
  );
  Assert.ok(
    !(await WindowsLaunchOnLogin._isExecutableMissing(liveExe)),
    "Existing file is not missing"
  );
  Assert.ok(
    !(await WindowsLaunchOnLogin._isExecutableMissing(
      "\\\\server\\share\\firefox.exe"
    )),
    "UNC path is never considered missing"
  );
  Assert.ok(
    !(await WindowsLaunchOnLogin._isExecutableMissing("firefox.exe")),
    "Relative path is never considered missing"
  );
  let missingDrive = await findMissingDrive();
  if (missingDrive) {
    Assert.ok(
      !(await WindowsLaunchOnLogin._isExecutableMissing(
        missingDrive + "firefox\\firefox.exe"
      )),
      "File on a missing drive is not considered missing"
    );
  } else {
    info("Every drive letter is in use, skipping missing drive check");
  }
});

add_task(async function test_remove_values_for_missing_executables() {
  await resetRunKey();
  let ownName = WindowsLaunchOnLogin.getLaunchOnLoginRegistryName();
  let quote = s => WindowsLaunchOnLogin.quoteString(s);
  let missingDrive = await findMissingDrive();

  setRunValue(
    prefix + "MISSING000000001",
    quote(missingExe) + " -os-autostart"
  );
  setRunValue(prefix + "MISSING000000002", missingExe + " -os-autostart");
  setRunValue(prefix + "LIVE000000000001", quote(liveExe) + " -os-autostart");
  setRunValue(ownName, quote(missingExe) + " -os-autostart");
  setRunValue("OtherApp", quote(missingExe));
  setRunValue("Mozilla-OtherProduct-0000000000000001", quote(missingExe));
  setRunValue(prefix + "UNC0000000000001", '"\\\\server\\share\\firefox.exe"');
  setRunValue(prefix + "GARBAGE000000001", '"unterminated');
  setRunValue(
    prefix + "BINARY0000000001",
    "\x01",
    Ci.nsIWindowsRegKey.TYPE_BINARY
  );
  if (missingDrive) {
    setRunValue(
      prefix + "NODRIVE000000001",
      quote(missingDrive + "firefox\\firefox.exe") + " -os-autostart"
    );
  }

  let removed;
  await WindowsLaunchOnLogin.withLaunchOnLoginRegistryKey(async wrk => {
    removed =
      await WindowsLaunchOnLogin._removeLaunchOnLoginValuesForMissingExecutables(
        wrk
      );
  });

  Assert.deepEqual(
    removed.sort(),
    [prefix + "MISSING000000001", prefix + "MISSING000000002"],
    "Only values for this application pointing at a deleted exe were removed"
  );

  let expected = [
    prefix + "LIVE000000000001",
    ownName,
    "OtherApp",
    "Mozilla-OtherProduct-0000000000000001",
    prefix + "UNC0000000000001",
    prefix + "GARBAGE000000001",
    prefix + "BINARY0000000001",
  ];
  if (missingDrive) {
    expected.push(prefix + "NODRIVE000000001");
  }
  Assert.deepEqual(
    await runValueNames(),
    expected.sort(),
    "Every other value survived"
  );
});

add_task(
  async function test_create_key_removes_values_for_missing_executables() {
    await resetRunKey();
    let ownName = WindowsLaunchOnLogin.getLaunchOnLoginRegistryName();
    let quote = s => WindowsLaunchOnLogin.quoteString(s);

    setRunValue(
      prefix + "MISSING000000003",
      quote(missingExe) + " -os-autostart"
    );
    setRunValue(prefix + "LIVE000000000002", quote(liveExe) + " -os-autostart");

    await WindowsLaunchOnLogin.createLaunchOnLoginRegistryKey();

    Assert.deepEqual(
      await runValueNames(),
      [prefix + "LIVE000000000002", ownName].sort(),
      "Creating our value removed the one for a missing exe and kept the live one"
    );
    await WindowsLaunchOnLogin.withLaunchOnLoginRegistryKey(wrk => {
      Assert.equal(
        wrk.readStringValue(ownName),
        quote(Services.dirsvc.get("XREExeF", Ci.nsIFile).path) +
          " -os-autostart",
        "Own value points at the running executable"
      );
    });
  }
);
