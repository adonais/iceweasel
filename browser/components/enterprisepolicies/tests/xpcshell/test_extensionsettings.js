/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { PolicyFailures } = ChromeUtils.importESModule(
  "resource://gre/modules/PoliciesHelpers.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.appInfo = getAppInfo();
AddonTestUtils.usePrivilegedSignatures = false;
ExtensionTestUtils.init(this);

const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
const BASE_URL = `http://example.com/data`;

let addonID = "policytest2@mozilla.com";
let themeID = "policytheme@mozilla.com";
let policyOnlyID = "policy_installed_only@mozilla.com";

let fileURL;

function waitForAddonInstall(addonId) {
  return new Promise(resolve => {
    let listener = {
      onInstallEnded(install, addon) {
        if (addon.id == addonId) {
          AddonManager.removeInstallListener(listener);
          resolve();
        }
      },
      onDownloadFailed() {
        AddonManager.removeInstallListener(listener);
        resolve();
      },
      onInstallFailed() {
        AddonManager.removeInstallListener(listener);
        resolve();
      },
    };
    AddonManager.addInstallListener(listener);
  });
}

add_setup(async function setup() {
  await AddonTestUtils.promiseStartupManager();

  let webExtensionFile = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      browser_specific_settings: {
        gecko: {
          id: addonID,
        },
      },
    },
  });
  server.registerFile("/data/policy_test.xpi", webExtensionFile);
  fileURL = Services.io
    .newFileURI(webExtensionFile)
    .QueryInterface(Ci.nsIFileURL);

  let policyOnlyExtensionFile = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      name: "Enterprise Policy Only Test Extension",
      browser_specific_settings: {
        gecko: {
          id: policyOnlyID,
          admin_install_only: true,
        },
      },
    },
  });
  server.registerFile(
    "/data/policy_installed_only.xpi",
    policyOnlyExtensionFile
  );

  server.registerFile(
    "/data/amosigned-sha1only.xpi",
    do_get_file("amosigned-sha1only.xpi")
  );
});

add_task(async function test_extensionsettings() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "extension1@mozilla.com": {
          blocked_install_message: "Extension1 error message.",
        },
        "*": {
          blocked_install_message: "Generic error message.",
        },
      },
    },
  });

  let extensionSettings = Services.policies.getExtensionSettings(
    "extension1@mozilla.com"
  );
  equal(
    extensionSettings.blocked_install_message,
    "Extension1 error message.",
    "Should have extension specific message."
  );
  extensionSettings = Services.policies.getExtensionSettings(
    "extension2@mozilla.com"
  );
  equal(
    extensionSettings.blocked_install_message,
    "Generic error message.",
    "Should have generic message."
  );
});

add_task(async function test_force_installed_updates_disabled() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "force@mozilla.com": {
          installation_mode: "force_installed",
          install_url: "https://example.com/test.xpi",
        },
        "force_explicit@mozilla.com": {
          installation_mode: "force_installed",
          install_url: "https://example.com/test.xpi",
          updates_disabled: true,
        },
        "normal@mozilla.com": {
          installation_mode: "normal_installed",
          install_url: "https://example.com/test.xpi",
        },
      },
    },
  });

  equal(
    Services.policies.getExtensionSettings("force@mozilla.com")
      .updates_disabled,
    false,
    "force_installed with no updates_disabled should default to false"
  );
  equal(
    Services.policies.getExtensionSettings("force_explicit@mozilla.com")
      .updates_disabled,
    true,
    "force_installed with explicit updates_disabled: true should be respected"
  );
  ok(
    !(
      "updates_disabled" in
      Services.policies.getExtensionSettings("normal@mozilla.com")
    ),
    "non-force_installed should not synthesize updates_disabled"
  );
});

add_task(async function test_invalid_entry_does_not_discard_the_others() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          blocked_install_message: "Generic error message.",
        },
        "broken@mozilla.com": {
          update_url: "not-a-valid-url",
        },
        "good@mozilla.com": {
          blocked_install_message: "Good error message.",
        },
      },
    },
  });

  equal(
    Services.policies.getExtensionSettings("good@mozilla.com")
      .blocked_install_message,
    "Good error message.",
    "A valid entry still applies alongside an invalid one."
  );
  equal(
    Services.policies.getExtensionSettings("broken@mozilla.com")
      .blocked_install_message,
    "Generic error message.",
    "The invalid entry is dropped and falls back to the generic one."
  );
});

add_task(async function test_quoted_booleans_are_accepted() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "force@mozilla.com": {
          installation_mode: "force_installed",
          install_url: "https://example.com/test.xpi",
          updates_disabled: "true",
        },
        "normal@mozilla.com": {
          installation_mode: "normal_installed",
          install_url: "https://example.com/test.xpi",
          private_browsing: "false",
        },
      },
    },
  });

  strictEqual(
    Services.policies.getExtensionSettings("force@mozilla.com")
      .updates_disabled,
    true,
    'updates_disabled: "true" is read as the boolean true'
  );
  strictEqual(
    Services.policies.getExtensionSettings("normal@mozilla.com")
      .private_browsing,
    false,
    'private_browsing: "false" is read as the boolean false'
  );
});

add_task(async function test_addon_blocked() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "policytest2@mozilla.com": {
          installation_mode: "blocked",
        },
      },
    },
  });

  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_test.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Addon should not be null");
  equal(install.addon.appDisabled, true, "Addon should be disabled");
  await install.addon.uninstall();
});

add_task(async function test_addon_allowed() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "policytest2@mozilla.com": {
          installation_mode: "allowed",
        },
        "*": {
          installation_mode: "blocked",
        },
      },
    },
  });

  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_test.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Addon should not be null");
  await assertManagementAPIInstallType(install.addon.id, "normal");
  equal(install.addon.appDisabled, false, "Addon should not be disabled");
  equal(
    Services.policies.isAddonRequiredByPolicy(install.addon.id),
    false,
    "Addon should NOT be marked as installed by enterprise policy"
  );

  await install.addon.uninstall();
});

add_task(async function test_addon_uninstalled() {
  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_test.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Addon should not be null");

  await Promise.all([
    AddonTestUtils.promiseAddonEvent("onUninstalled"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "*": {
            installation_mode: "blocked",
          },
        },
      },
    }),
  ]);
  let addon = await AddonManager.getAddonByID(addonID);
  equal(addon, null, "Addon should be null");
});

add_task(async function test_addon_forceinstalled() {
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "policytest2@mozilla.com": {
            installation_mode: "force_installed",
            install_url: BASE_URL + "/policy_test.xpi",
          },
        },
      },
    }),
  ]);
  let addon = await AddonManager.getAddonByID(addonID);
  notEqual(addon, null, "Addon should not be null");
  equal(addon.appDisabled, false, "Addon should not be disabled");
  equal(
    addon.permissions & AddonManager.PERM_CAN_UNINSTALL,
    0,
    "Addon should not be able to be uninstalled."
  );
  equal(
    addon.permissions & AddonManager.PERM_CAN_DISABLE,
    0,
    "Addon should not be able to be disabled."
  );
  await assertManagementAPIInstallType(addon.id, "admin");

  await addon.uninstall();
});

add_task(async function test_addon_uninstalled_by_allowed_types() {
  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_test.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Addon should not be null");

  await Promise.all([
    AddonTestUtils.promiseAddonEvent("onUninstalled"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "*": {
            allowed_types: ["theme"],
          },
        },
      },
    }),
  ]);
  let addon = await AddonManager.getAddonByID(addonID);
  equal(
    addon,
    null,
    "Addon should be uninstalled due to allowed_types restriction"
  );
});

add_task(async function test_addon_allowed_exempted_from_allowed_types() {
  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_test.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Addon should not be null");

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        [addonID]: {
          installation_mode: "allowed",
        },
        "*": {
          allowed_types: ["theme"],
        },
      },
    },
  });
  let addon = await AddonManager.getAddonByID(addonID);
  notEqual(
    addon,
    null,
    "Explicitly allowed addon should survive allowed_types restriction"
  );
  await addon.uninstall();
});

add_task(async function test_allowed_types_blocks_new_install() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          allowed_types: ["theme"],
        },
      },
    },
  });
  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_test.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Addon should not be null");
  equal(
    install.addon.appDisabled,
    true,
    "Addon should be disabled due to allowed_types restriction"
  );
  await install.addon.uninstall();
});

add_task(async function test_allowed_type_survives_allowed_types() {
  let themeFile = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      browser_specific_settings: {
        gecko: {
          id: themeID,
        },
      },
      theme: {},
    },
  });
  server.registerFile("/data/policy_theme_survives.xpi", themeFile);

  let install = await AddonManager.getInstallForURL(
    BASE_URL + "/policy_theme_survives.xpi"
  );
  await install.install();
  notEqual(install.addon, null, "Theme should be installed");

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          allowed_types: ["theme"],
        },
      },
    },
  });
  let addon = await AddonManager.getAddonByID(themeID);
  notEqual(
    addon,
    null,
    "Theme should survive allowed_types: ['theme'] restriction"
  );
  await addon.uninstall();
});

add_task(async function test_addon_normalinstalled() {
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "policytest2@mozilla.com": {
            installation_mode: "normal_installed",
            install_url: BASE_URL + "/policy_test.xpi",
          },
        },
      },
    }),
  ]);
  let addon = await AddonManager.getAddonByID(addonID);
  notEqual(addon, null, "Addon should not be null");
  equal(addon.appDisabled, false, "Addon should not be disabled");
  equal(
    addon.permissions & AddonManager.PERM_CAN_UNINSTALL,
    0,
    "Addon should not be able to be uninstalled."
  );
  notEqual(
    addon.permissions & AddonManager.PERM_CAN_DISABLE,
    0,
    "Addon should be able to be disabled."
  );
  await assertManagementAPIInstallType(addon.id, "admin");

  await addon.uninstall();
});

add_task(async function test_extensionsettings_string() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: '{"*": {"installation_mode": "blocked"}}',
    },
  });

  let extensionSettings = Services.policies.getExtensionSettings("*");
  equal(extensionSettings.installation_mode, "blocked");
});

add_task(async function test_extensionsettings_string() {
  let restrictedDomains = Services.prefs.getCharPref(
    "extensions.webextensions.restrictedDomains"
  );
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings:
        '{"*": {"restricted_domains": ["example.com","example.org"]}}',
    },
  });

  let newRestrictedDomains = Services.prefs.getCharPref(
    "extensions.webextensions.restrictedDomains"
  );
  equal(newRestrictedDomains, restrictedDomains + ",example.com,example.org");
});

add_task(async function test_theme() {
  let themeFile = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      browser_specific_settings: {
        gecko: {
          id: themeID,
        },
      },
      theme: {},
    },
  });

  server.registerFile("/data/policy_theme.xpi", themeFile);

  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "policytheme@mozilla.com": {
            installation_mode: "normal_installed",
            install_url: BASE_URL + "/policy_theme.xpi",
          },
        },
      },
    }),
  ]);
  let currentTheme = Services.prefs.getCharPref("extensions.activeThemeID");
  equal(currentTheme, themeID, "Theme should be active");
  let addon = await AddonManager.getAddonByID(themeID);
  await addon.uninstall();
});

add_task(async function test_addon_normalinstalled_file() {
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "policytest2@mozilla.com": {
            installation_mode: "normal_installed",
            install_url: fileURL.spec,
          },
        },
      },
    }),
  ]);
  let addon = await AddonManager.getAddonByID(addonID);
  notEqual(addon, null, "Addon should not be null");
  equal(addon.appDisabled, false, "Addon should not be disabled");
  equal(
    addon.permissions & AddonManager.PERM_CAN_UNINSTALL,
    0,
    "Addon should not be able to be uninstalled."
  );
  notEqual(
    addon.permissions & AddonManager.PERM_CAN_DISABLE,
    0,
    "Addon should be able to be disabled."
  );
  await assertManagementAPIInstallType(addon.id, "admin");

  await addon.uninstall();
});

add_task(async function test_allow_weak_signatures() {
  // Make sure weak signatures are restricted.
  const resetWeakSignaturePref =
    AddonTestUtils.setWeakSignatureInstallAllowed(false);

  const id = "amosigned-xpi@tests.mozilla.org";
  const perAddonSettings = {
    installation_mode: "normal_installed",
    install_url: BASE_URL + "/amosigned-sha1only.xpi",
  };

  info(
    "Sanity check: expect install to fail if not allowed through enterprise policy settings"
  );
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onDownloadFailed"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [id]: { ...perAddonSettings },
        },
      },
    }),
  ]);
  let addon = await AddonManager.getAddonByID(id);
  equal(addon, null, "Add-on not installed");

  info(
    "Expect install to be allowed through per-addon enterprise policy settings"
  );
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [id]: {
            ...perAddonSettings,
            temporarily_allow_weak_signatures: true,
          },
        },
      },
    }),
  ]);
  addon = await AddonManager.getAddonByID(id);
  notEqual(addon, null, "Add-on not installed");
  await addon.uninstall();

  info(
    "Expect install to be allowed through global enterprise policy settings"
  );
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "*": { temporarily_allow_weak_signatures: true },
          [id]: { ...perAddonSettings },
        },
      },
    }),
  ]);
  addon = await AddonManager.getAddonByID(id);
  notEqual(addon, null, "Add-on installed");
  await addon.uninstall();

  info(
    "Expect install to fail if allowed globally but disallowed by per-addon settings"
  );
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onDownloadFailed"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "*": { temporarily_allow_weak_signatures: true },
          [id]: {
            ...perAddonSettings,
            temporarily_allow_weak_signatures: false,
          },
        },
      },
    }),
  ]);
  addon = await AddonManager.getAddonByID(id);
  equal(addon, null, "Add-on not installed");

  info(
    "Expect install to be allowed through per addon setting when globally disallowed"
  );
  await Promise.all([
    AddonTestUtils.promiseInstallEvent("onInstallEnded"),
    setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          "*": { temporarily_allow_weak_signatures: false },
          [id]: {
            ...perAddonSettings,
            temporarily_allow_weak_signatures: true,
          },
        },
      },
    }),
  ]);
  addon = await AddonManager.getAddonByID(id);
  notEqual(addon, null, "Add-on installed");
  await addon.uninstall();

  resetWeakSignaturePref();
});

add_task(async function test_policy_installed_only_addon() {
  const cleanupTestAddon = async () => {
    const addon = await AddonManager.getAddonByID(policyOnlyID);
    if (addon) {
      await addon.uninstall();
    }
  };
  registerCleanupFunction(cleanupTestAddon);

  info(
    "Expect the test addon to install successfully when installed by the policy"
  );
  let installPromise = waitForAddonInstall(policyOnlyID);
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        [policyOnlyID]: {
          install_url: `${BASE_URL}/policy_installed_only.xpi`,
          installation_mode: "force_installed",
          updates_disabled: true,
        },
      },
    },
  });
  await installPromise;
  let addon = await AddonManager.getAddonByID(policyOnlyID);
  Assert.notEqual(addon, null, "Addon expected to be installed successfully.");
  Assert.deepEqual(
    addon.installTelemetryInfo,
    { source: "enterprise-policy" },
    "Got the expected addon.installTelemetryInfo"
  );

  info(
    "Remove the ExtensionSettings and verify the addon becomes appDisabled on XPIDatabase.verifySignatures calls"
  );
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        // NOTE: an empty ExtensionSettings config would not be reflected
        // by data returned by Services.policy.getExtensionSettings calls,
        // on the contrary setting new policy data with an unrelated addon-id
        // forces the ExtensionSettings data to be refreshed.
        "someother-addon@test": { updates_disabled: true },
      },
    },
  });

  {
    const { XPIExports } = ChromeUtils.importESModule(
      "resource://gre/modules/addons/XPIExports.sys.mjs"
    );
    await XPIExports.XPIDatabase.verifySignatures();
  }

  addon = await AddonManager.getAddonByID(policyOnlyID);
  Assert.notEqual(addon, null, "Addon expected to still be installed");
  Assert.equal(addon.appDisabled, true, "Expect the addon to be appDisabled");

  await cleanupTestAddon();
  addon = await AddonManager.getAddonByID(policyOnlyID);
  Assert.equal(addon, null, "Addon expected to not be installed anymore");

  info(
    "Expect the test addon to NOT install successfully when not installed by the policy"
  );
  // Setting back the extension settings with installation_mode set to force_installed
  // will install the extension again, and so we need to wait for that and uninstall
  // it first (otherwise the addon may endup being installed when the test task is
  // completed and trigger an intermittent failure).
  installPromise = waitForAddonInstall(policyOnlyID);
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        [policyOnlyID]: {
          install_url: `${BASE_URL}/policy_installed_only.xpi`,
          installation_mode: "force_installed",
          updates_disabled: true,
        },
      },
    },
  });
  await installPromise;
  await cleanupTestAddon();

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        // NOTE: an empty ExtensionSettings config would not be reflected
        // by data returned by Services.policy.getExtensionSettings calls,
        // on the contrary setting new policy data with an unrelated addon-id
        // forces the ExtensionSettings data to be refreshed.
        "someother-addon@test": { updates_disabled: true },
      },
    },
  });

  const { messages } = await AddonTestUtils.promiseConsoleOutput(async () => {
    installPromise = waitForAddonInstall(policyOnlyID);
    const install = await AddonManager.getInstallForURL(
      `${BASE_URL}/policy_installed_only.xpi`,
      { telemetryInfo: { source: "not-enterprise-policy" } }
    );
    await Assert.rejects(
      install.install(),
      /Install failed/,
      "Expect the install method to reject"
    );
    await installPromise;

    addon = await AddonManager.getAddonByID(policyOnlyID);
    Assert.equal(addon, null, "Addon expected to not be installed");
  });

  AddonTestUtils.checkMessages(
    messages,
    {
      expected: [
        {
          message:
            /This addon can only be installed through Enterprise Policies/,
        },
      ],
    },
    "Got the expect error logged on installing enterprise only extension"
  );
});

// If the addon ID provided in the policy does not match the downloaded addon,
// the addon should not be installed, and a useful policy failure message
// should be logged.
add_task(async function test_addon_install_id_mismatch() {
  const installURLs = {
    file: fileURL.spec,
    http: BASE_URL + "/policy_test.xpi",
  };

  for (const installMode of ["normal_installed", "force_installed"]) {
    for (const [installProtocol, installURL] of Object.entries(installURLs)) {
      // Run the test case.
      const descriptionPrefix = `[${installMode}, ${installProtocol}]: `;
      const {
        messages,
        result: [[install]],
      } = await AddonTestUtils.promiseConsoleOutput(() =>
        Promise.all([
          AddonTestUtils.promiseInstallEvent("onDownloadFailed"),
          setupPolicyEngineWithJson({
            policies: {
              ExtensionSettings: {
                "incorrect-id@mozilla.com": {
                  installation_mode: installMode,
                  install_url: installURL,
                },
              },
            },
          }),
        ])
      );

      // Check that the addon was rejected with the right errors.
      const addon = await AddonManager.getAddonByID(addonID);
      equal(
        addon,
        null,
        descriptionPrefix + "Addon should not be installed when the ID is wrong"
      );
      equal(
        AddonManager.errorToString(install.error),
        "ERROR_INCORRECT_ID",
        descriptionPrefix + "Correct install.error type should be given"
      );
      ok(
        messages.some(({ message }) =>
          message.includes(
            "Expected addon ID incorrect-id@mozilla.com instead of policytest2@mozilla.com"
          )
        ),
        descriptionPrefix + "Addon ID mismatch error should be logged"
      );
      ok(
        PolicyFailures.getAll().ExtensionSettings.some(message =>
          message.includes(
            `Download failed - ERROR_INCORRECT_ID - ${installURL} - ` +
              "Expected incorrect-id@mozilla.com instead of policytest2@mozilla.com"
          )
        ),
        descriptionPrefix +
          "Failure policy should be logged with addon ID mismatch details"
      );
    }
  }
});

// Test the edge-case of an incompatible file: addon policy install, where the
// addon ID provided by the policy also does not match.
add_task(async function test_addon_install_id_mismatch_incompatible_file() {
  const incompatibleFile = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      browser_specific_settings: {
        gecko: {
          id: addonID,
          strict_min_version: "9999",
        },
      },
    },
  });
  const installURL = Services.io.newFileURI(incompatibleFile).spec;

  const {
    messages,
    result: [[install]],
  } = await AddonTestUtils.promiseConsoleOutput(() =>
    Promise.all([
      AddonTestUtils.promiseInstallEvent("onDownloadFailed"),
      setupPolicyEngineWithJson({
        policies: {
          ExtensionSettings: {
            "incorrect-id@mozilla.com": {
              installation_mode: "normal_installed",
              install_url: installURL,
            },
          },
        },
      }),
    ])
  );

  ok(install.addon.appDisabled, "The add-on is incompatible");

  // Check that the addon was rejected with the right errors.
  const addon = await AddonManager.getAddonByID(addonID);
  equal(
    addon,
    null,
    "An incompatible addon should not be installed when the ID is also wrong"
  );
  equal(
    AddonManager.errorToString(install.error),
    "ERROR_INCORRECT_ID",
    "Correct install.error type should be given"
  );
  ok(
    messages.some(({ message }) =>
      message.includes(
        "Expected addon ID incorrect-id@mozilla.com instead of policytest2@mozilla.com"
      )
    ),
    "Addon ID mismatch error should still be logged for incompatible addons"
  );
  ok(
    PolicyFailures.getAll().ExtensionSettings.some(message =>
      message.includes(
        `Download failed - ERROR_INCORRECT_ID - ${installURL} - ` +
          "Expected incorrect-id@mozilla.com instead of policytest2@mozilla.com"
      )
    ),
    "Failure policy should be logged with addon ID mismatch details"
  );
});
