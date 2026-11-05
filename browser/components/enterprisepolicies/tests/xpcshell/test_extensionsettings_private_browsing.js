/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.appInfo = getAppInfo();
AddonTestUtils.usePrivilegedSignatures = false;
ExtensionTestUtils.init(this);

add_setup(async function setup() {
  await AddonTestUtils.promiseStartupManager();
});

add_task(async function test_private_browsing() {
  async function assertPrivateBrowsingAccess({
    addonId,
    extensionSettings,
    extensionManifest = {},
    expectedPrivateBrowsingAccess,
    message,
  }) {
    await setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [addonId]: { ...extensionSettings },
        },
      },
    });

    let ext = ExtensionTestUtils.loadExtension({
      manifest: {
        browser_specific_settings: {
          gecko: { id: addonId },
        },
        ...extensionManifest,
      },
      useAddonManager: "temporary",
      background() {
        browser.test.onMessage.addListener(async msg => {
          switch (msg) {
            case "checkPrivateBrowsing": {
              let isAllowed =
                await browser.extension.isAllowedIncognitoAccess();
              browser.test.sendMessage("privateBrowsing", isAllowed);
              break;
            }
          }
        });
      },
    });

    await ext.startup();

    ext.sendMessage("checkPrivateBrowsing");
    let isAllowedIncognitoAccess = await ext.awaitMessage("privateBrowsing");
    Assert.equal(
      isAllowedIncognitoAccess,
      expectedPrivateBrowsingAccess,
      message
    );

    let addon = await AddonManager.getAddonByID(ext.id);
    // Sanity check (to ensure the test extension used in this test are not privileged).
    ok(!addon.isPrivileged, "Addon should not be privileged");

    let expectLocked = typeof extensionSettings?.private_browsing === "boolean";
    Assert.equal(
      !(
        addon.permissions & AddonManager.PERM_CAN_CHANGE_PRIVATEBROWSING_ACCESS
      ),
      expectLocked,
      `Addon should ${expectLocked ? "NOT" : ""} be able to change private browsing setting.`
    );

    await ext.unload();
  }

  await assertPrivateBrowsingAccess({
    addonId: "privatebrowsing-granted-nonprivileged@test",
    extensionSettings: { private_browsing: true },
    expectedPrivateBrowsingAccess: true,
    message:
      "Should have access to private browsing (set to true in policy extension setting)",
  });

  await assertPrivateBrowsingAccess({
    addonId: "privatebrowsing-revoked-nonprivileged@test",
    extensionSettings: { private_browsing: false },
    expectedPrivateBrowsingAccess: false,
    message:
      "Should NOT have access to private browsing (set to false in policy extension setting)",
  });

  await assertPrivateBrowsingAccess({
    addonId: "privatebrowsing-nosetting-nonprivileged@test",
    extensionSettings: {},
    expectedPrivateBrowsingAccess: false,
    message:
      "Should NOT have access to private browsing (NOT set in policy extension setting)",
  });

  await assertPrivateBrowsingAccess({
    addonId: "privatebrowsing-notallowed-nonprivileged@test",
    extensionSettings: { private_browsing: true },
    extensionManifest: {
      incognito: "not_allowed",
    },
    expectedPrivateBrowsingAccess: false,
    message:
      "incognito 'not_allowed' extensions should NOT have access to private browser",
  });
});
