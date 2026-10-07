/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// AutoConfig reads its inputs from the installation, not from the profile:
// nsReadConfig clears the profile's values of the AutoConfig input prefs
// before evaluating the .cfg, which can still set them with pref().

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const REMOTE_ENV = "AUTOCONFIG_TEST_REMOTE_URL";

const AUTOCONFIG_INPUT_PREFS = [
  "general.config.filename",
  "general.config.vendor",
  "autoadmin.global_config_url",
  "autoadmin.offline_failover",
  "autoadmin.append_emailaddr",
  "autoadmin.refresh_interval",
  "autoadmin.failover_to_cached",
];

add_task(async function test_profile_prefs() {
  let prefs = Services.prefs.getBranch(null);
  let defPrefs = Services.prefs.getDefaultBranch(null);

  let greD = Services.dirsvc.get("GreD", Ci.nsIFile);
  let defaultPrefD = Services.dirsvc.get("PrfDef", Ci.nsIFile);
  let testDir = do_get_cwd();

  let autoConfigJS = testDir.clone();
  autoConfigJS.append("autoconfig.js");
  autoConfigJS.copyTo(defaultPrefD, "autoconfig.js");

  let installedCfg = greD.clone();
  installedCfg.append("autoconfig.cfg");

  registerCleanupFunction(() => {
    for (let [dir, name] of [
      [defaultPrefD, "autoconfig.js"],
      [greD, "autoconfig.cfg"],
    ]) {
      let file = dir.clone();
      file.append(name);
      if (file.exists()) {
        file.remove(false);
      }
    }
    Services.env.set(REMOTE_ENV, "");
    Services.prefs.resetPrefs();
  });

  let remoteCfg = testDir.clone();
  remoteCfg.append("autoconfig-remote.jsc");
  let remoteUrl = Services.io.newFileURI(remoteCfg).spec;
  Services.env.set(REMOTE_ENV, remoteUrl);

  // Make sure nsReadConfig is initialized.
  Cc["@mozilla.org/readconfig;1"].getService(Ci.nsISupports);

  // Evaluates the named .cfg as the shipped AutoConfig file. The user values
  // stand in for what a profile's prefs.js or user.js would set, the default
  // values for what the administrator configured.
  function readConfig(cfgName, { userPrefs = {}, defaultPrefs = {} } = {}) {
    Services.prefs.resetPrefs();
    if (installedCfg.exists()) {
      installedCfg.remove(false);
    }
    let cfg = testDir.clone();
    cfg.append(cfgName);
    cfg.copyTo(greD, "autoconfig.cfg");
    for (let [name, value] of Object.entries(defaultPrefs)) {
      defPrefs.setStringPref(name, value);
    }
    for (let [name, value] of Object.entries(userPrefs)) {
      prefs.setStringPref(name, value);
    }
    Services.obs.notifyObservers(
      Services.prefs,
      "prefservice:before-read-userprefs"
    );
    equal(
      "cfg",
      prefs.getStringPref("_autoconfig_.test.admin"),
      `${cfgName} is applied`
    );
  }

  // nsAutoConfig fetches the remote file on this notification. Only the first
  // fetch in the process is synchronous, so wait for the pref it sets.
  async function awaitRemoteFetch(message) {
    let fetched = TestUtils.waitForPrefChange("_autoconfig_.test.remote");
    Services.obs.notifyObservers(null, "profile-after-change");
    await fetched;
    equal("remote", prefs.getStringPref("_autoconfig_.test.remote"), message);
  }

  // Profile values do not set the URL or the other nsAutoConfig inputs. This
  // runs first so that no nsAutoConfig instance exists yet.
  readConfig("autoconfig-admin.cfg", {
    userPrefs: Object.fromEntries(
      AUTOCONFIG_INPUT_PREFS.map(name => [name, remoteUrl])
    ),
  });
  for (let name of AUTOCONFIG_INPUT_PREFS) {
    ok(
      !prefs.prefHasUserValue(name),
      `the profile value of ${name} is dropped`
    );
  }
  Services.obs.notifyObservers(null, "profile-after-change");
  ok(
    !prefs.prefHasUserValue("_autoconfig_.test.remote"),
    "the profile-set URL is not fetched"
  );

  // Profile values cannot fail the vendor check.
  readConfig("autoconfig-admin.cfg", {
    userPrefs: {
      "general.config.vendor": "notautoconfig",
      "general.config.filename": "notautoconfig.cfg",
    },
    defaultPrefs: { "autoadmin.global_config_url": remoteUrl },
  });
  await awaitRemoteFetch(
    "the remote file is fetched despite the profile vendor"
  );

  // pref() in the .cfg still sets the vendor and defaultPref() sets the URL.
  readConfig("autoconfig-admin-pref.cfg", {
    userPrefs: {
      "general.config.vendor": "notautoconfig",
      "autoadmin.global_config_url": "file:///nonexistent.jsc",
    },
  });
  equal(
    "autoconfig",
    prefs.getStringPref("general.config.vendor"),
    "pref() in the .cfg sets the vendor"
  );
  equal(
    remoteUrl,
    defPrefs.getStringPref("autoadmin.global_config_url"),
    "defaultPref() in the .cfg sets the URL"
  );
  ok(
    !prefs.prefHasUserValue("autoadmin.global_config_url"),
    "the profile-set URL is dropped"
  );
  await awaitRemoteFetch("the URL set with defaultPref() is fetched");

  // pref() in the .cfg sets the URL too.
  readConfig("autoconfig-admin-url-pref.cfg", {
    userPrefs: { "autoadmin.global_config_url": "file:///nonexistent.jsc" },
  });
  equal(
    remoteUrl,
    prefs.getStringPref("autoadmin.global_config_url"),
    "pref() in the .cfg sets the URL"
  );
  await awaitRemoteFetch("the URL set with pref() is fetched");
});
