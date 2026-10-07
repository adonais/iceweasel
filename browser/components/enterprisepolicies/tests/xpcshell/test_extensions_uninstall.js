/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { PolicyFailures } = ChromeUtils.importESModule(
  "resource://gre/modules/PoliciesHelpers.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.appInfo = getAppInfo();

const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
const BASE_URL = "http://example.com/data";
const ADDON_ID = "uninstall-policy@tests.mozilla.org";
const OTHER_ADDON_ID = "other-policy@tests.mozilla.org";
const UNINSTALL_MARKER =
  "browser.policies.runOncePerModification.extensionsUninstall";
const INSTALL_MARKER =
  "browser.policies.runOncePerModification.extensionsInstall";

function createXPI(version, id = ADDON_ID) {
  return AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      version,
      browser_specific_settings: { gecko: { id } },
    },
  });
}

add_setup(async function () {
  await AddonTestUtils.promiseStartupManager();
  server.registerFile("/data/v1.xpi", createXPI("1.0"));
  server.registerFile("/data/v2.xpi", createXPI("2.0"));
  server.registerFile("/data/other.xpi", createXPI("1.0", OTHER_ADDON_ID));
});

function applyPolicies(policies) {
  return setupPolicyEngineWithJson({ policies });
}

async function installOutsidePolicy() {
  await AddonTestUtils.promiseInstallFile(createXPI("1.0"));
  const addon = await AddonManager.getAddonByID(ADDON_ID);
  notEqual(addon, null, "The add-on is installed outside of policy");
  return addon;
}

async function ensureAbsent(id = ADDON_ID) {
  const addon = await AddonManager.getAddonByID(id);
  if (addon) {
    const uninstalled = AddonTestUtils.promiseAddonEvent("onUninstalled");
    await addon.uninstall();
    await uninstalled;
  }
}

add_task(async function test_preseeded_marker_does_not_suppress_uninstall() {
  EnterprisePolicyTesting.resetRunOnceState();
  await installOutsidePolicy();
  Services.prefs.setStringPref(UNINSTALL_MARKER, JSON.stringify([ADDON_ID]));

  const uninstalled = AddonTestUtils.promiseAddonEvent("onUninstalled");
  await applyPolicies({ Extensions: { Uninstall: [ADDON_ID] } });
  await uninstalled;

  equal(
    await AddonManager.getAddonByID(ADDON_ID),
    null,
    "The add-on was uninstalled despite the pre-seeded marker"
  );
});

add_task(async function test_uninstall_is_reapplied_after_a_reinstall() {
  equal(
    Services.prefs.getStringPref(UNINSTALL_MARKER),
    JSON.stringify([ADDON_ID]),
    "The marker matches the list applied by the previous task"
  );
  await installOutsidePolicy();

  const uninstalled = AddonTestUtils.promiseAddonEvent("onUninstalled");
  await applyPolicies({ Extensions: { Uninstall: [ADDON_ID] } });
  await uninstalled;

  equal(
    await AddonManager.getAddonByID(ADDON_ID),
    null,
    "The add-on was uninstalled again although the list is unchanged"
  );
});

add_task(
  async function test_forbidden_addon_removed_with_both_markers_seeded() {
    EnterprisePolicyTesting.resetRunOnceState();
    await installOutsidePolicy();
    Services.prefs.setStringPref(UNINSTALL_MARKER, JSON.stringify([ADDON_ID]));
    Services.prefs.setStringPref(
      INSTALL_MARKER,
      JSON.stringify([`${BASE_URL}/v2.xpi`])
    );

    const uninstalled = AddonTestUtils.promiseAddonEvent("onUninstalled");
    await applyPolicies({
      Extensions: { Uninstall: [ADDON_ID], Install: [`${BASE_URL}/v2.xpi`] },
    });
    await uninstalled;

    equal(
      await AddonManager.getAddonByID(ADDON_ID),
      null,
      "The add-on installed outside of policy was uninstalled"
    );
  }
);

add_task(
  async function test_policy_installed_addon_kept_while_lists_unchanged() {
    EnterprisePolicyTesting.resetRunOnceState();
    await ensureAbsent();
    const policies = {
      Extensions: { Uninstall: [ADDON_ID], Install: [`${BASE_URL}/v1.xpi`] },
    };

    const installed = AddonTestUtils.promiseInstallEvent("onInstallEnded");
    await applyPolicies(policies);
    await installed;
    let addon = await AddonManager.getAddonByID(ADDON_ID);
    equal(addon.version, "1.0", "The policy installed the add-on");
    equal(
      addon.installTelemetryInfo?.source,
      "enterprise-policy",
      "The add-on records the policy as its install source"
    );

    const installDate = addon.installDate.getTime();
    await applyPolicies(policies);
    addon = await AddonManager.getAddonByID(ADDON_ID);
    equal(addon?.version, "1.0", "The add-on is still installed");
    equal(
      addon?.installDate.getTime(),
      installDate,
      "Re-applying the unchanged policy did not uninstall and reinstall it"
    );
  }
);

add_task(async function test_changed_uninstall_list_reinstalls_from_new_url() {
  EnterprisePolicyTesting.resetRunOnceState();
  await ensureAbsent();

  let installed = AddonTestUtils.promiseInstallEvent("onInstallEnded");
  await applyPolicies({ Extensions: { Install: [`${BASE_URL}/v1.xpi`] } });
  await installed;
  let addon = await AddonManager.getAddonByID(ADDON_ID);
  equal(addon.version, "1.0", "The policy installed the add-on");
  const dateBefore = addon.installDate.getTime();

  const policies = {
    Extensions: { Uninstall: [ADDON_ID], Install: [`${BASE_URL}/v2.xpi`] },
  };
  const uninstalled = AddonTestUtils.promiseAddonEvent("onUninstalled");
  installed = AddonTestUtils.promiseInstallEvent("onInstallEnded");
  await applyPolicies(policies);
  await uninstalled;
  await installed;
  addon = await AddonManager.getAddonByID(ADDON_ID);
  equal(
    addon.version,
    "2.0",
    "Adding the add-on to Uninstall reinstalled it from the Install URL"
  );
  const installDate = addon.installDate.getTime();
  notEqual(
    installDate,
    dateBefore,
    "It was replaced rather than updated in place, so installDate moved"
  );

  await applyPolicies(policies);
  addon = await AddonManager.getAddonByID(ADDON_ID);
  equal(addon?.version, "2.0", "The reinstalled add-on is still installed");
  equal(
    addon?.installDate.getTime(),
    installDate,
    "The reinstalled add-on is left alone"
  );
});

add_task(
  async function test_changed_install_list_removes_policy_installed_addon() {
    EnterprisePolicyTesting.resetRunOnceState();
    await ensureAbsent();
    await ensureAbsent(OTHER_ADDON_ID);

    let installed = AddonTestUtils.promiseInstallEvent("onInstallEnded");
    await applyPolicies({
      Extensions: { Uninstall: [ADDON_ID], Install: [`${BASE_URL}/v1.xpi`] },
    });
    await installed;
    const addon = await AddonManager.getAddonByID(ADDON_ID);
    equal(
      addon.installTelemetryInfo?.source,
      "enterprise-policy",
      "The policy installed the add-on"
    );

    const uninstalled = AddonTestUtils.promiseAddonEvent("onUninstalled");
    installed = AddonTestUtils.promiseInstallEvent("onInstallEnded");
    await applyPolicies({
      Extensions: {
        Uninstall: [ADDON_ID],
        Install: [`${BASE_URL}/other.xpi`],
      },
    });
    await uninstalled;
    await installed;
    equal(
      await AddonManager.getAddonByID(ADDON_ID),
      null,
      "The add-on the Install list no longer covers was uninstalled"
    );
    notEqual(
      await AddonManager.getAddonByID(OTHER_ADDON_ID),
      null,
      "The add-on the Install list now names was installed"
    );

    await ensureAbsent(OTHER_ADDON_ID);
  }
);

add_task(async function test_extensionsettings_install_takes_precedence() {
  EnterprisePolicyTesting.resetRunOnceState();
  await ensureAbsent();
  await installOutsidePolicy();

  // No install_url with the add-on already present, so ExtensionSettings
  // starts no install of its own and nothing is in flight at task end.
  await applyPolicies({
    ExtensionSettings: {
      [ADDON_ID]: { installation_mode: "force_installed" },
    },
    Extensions: { Uninstall: [ADDON_ID] },
  });

  notEqual(
    await AddonManager.getAddonByID(ADDON_ID),
    null,
    "The add-on ExtensionSettings installs was not uninstalled"
  );
  const failures = PolicyFailures.getAll().Extensions ?? [];
  equal(failures.length, 1, "The conflict is reported against Extensions");
  ok(
    failures[0].includes(ADDON_ID),
    `The failure names the add-on: ${failures[0]}`
  );
});

add_task(async function cleanup() {
  await applyPolicies({});
  await ensureAbsent();
  await ensureAbsent(OTHER_ADDON_ID);
  EnterprisePolicyTesting.resetRunOnceState();
  await AddonTestUtils.promiseShutdownManager();
});
