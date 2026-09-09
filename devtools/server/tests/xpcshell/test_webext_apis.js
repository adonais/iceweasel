/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

ExtensionTestUtils.init(this);

add_setup(async () => {
  Services.prefs.setBoolPref("extensions.blocklist.enabled", false);
  await startupAddonsManager();
});

// If this test case fails, please reach out to webext peers because
// https://github.com/mozilla/web-ext relies on the APIs tested here.
add_task(async function test_webext_run_apis() {
  const client = await CommandsFactory.spawnClientToDebugSystemPrincipal();
  const addons = await client.mainRoot.getFront("addons");

  // installTemporaryAddon
  const addonId = "test-addons-actor@mozilla.org";
  const addonPath = getFilePath("addons/web-extension", false, true);
  const promiseStarted = AddonTestUtils.promiseWebExtensionStartup(addonId);
  const addon = await addons.installTemporaryAddon(
    addonPath,
    // The openDevTools parameter is not always passed by web-ext. This test
    // omits it, to make sure that the request without the flag is accepted.
    false
  );
  await promiseStarted;

  ok(addon, "addonsActor allows to install a temporary add-on");
  equal(addon.id, addonId, "temporary add-on is the expected one");
  equal(addon.actor, false, "temporary add-on does not have an actor");

  // listAddons
  let addonsList = await client.mainRoot.listAddons();
  ok(Array.isArray(addonsList), "listAddons() returns a list of add-ons");
  equal(addonsList.length, 1, "expected an add-on installed");

  const installedAddon = addonsList[0];
  equal(installedAddon.id, addonId, "installed add-on is the expected one");
  ok(installedAddon.actorID, "returned add-on has an actor");

  // reload
  const promiseReloaded = AddonTestUtils.promiseAddonEvent("onInstalled");
  const promiseRestarted = AddonTestUtils.promiseWebExtensionStartup(addonId);
  await installedAddon.reload();
  await Promise.all([promiseReloaded, promiseRestarted]);

  // uninstallAddon
  const promiseUninstalled = new Promise(resolve => {
    const listener = {};
    listener.onUninstalled = uninstalledAddon => {
      if (uninstalledAddon.id == addonId) {
        AddonManager.removeAddonListener(listener);
        resolve();
      }
    };
    AddonManager.addAddonListener(listener);
  });
  await addons.uninstallAddon(addonId);
  await promiseUninstalled;

  addonsList = await client.mainRoot.listAddons();
  equal(addonsList.length, 0, "expected no add-on installed");

  // Attempt to uninstall an add-on that is (no longer) installed.
  try {
    await addons.uninstallAddon(addonId);
    ok(false, "should throw");
  } catch (error) {
    Assert.stringContains(
      error?.message,
      `Could not uninstall add-on "${addonId}"`,
      "expected error"
    );
  }

  // Attempt to uninstall a non-temporarily loaded extension, which we do not
  // allow at the moment. We start by loading an extension, then we call the
  // `uninstallAddon`.
  const id = "not-a-temporary@extension";
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id } },
    },
    useAddonManager: "permanent",
  });
  await extension.startup();

  try {
    await addons.uninstallAddon(id);
    ok(false, "should throw");
  } catch (error) {
    Assert.stringContains(
      error?.message,
      `Could not uninstall add-on "${id}"`,
      "expected error"
    );
  }

  await extension.unload();

  await client.close();
});
