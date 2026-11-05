/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.appInfo = getAppInfo();
AddonTestUtils.usePrivilegedSignatures = false;
ExtensionTestUtils.init(this);

const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
const BASE_URL = `http://example.com/data`;

let addonID = "policytest2@mozilla.com";

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
});

add_task(
  {
    // Allow insecure (http) update URLs in this test.
    pref_set: [
      ["extensions.checkUpdateSecurity", false],
      // Fake default url where we expect the background update check requests
      // to be directed to when there isn't an update_url override provided
      // through the enterprise policies settings.
      ["extensions.update.background.url", `${BASE_URL}/default_update.json`],
    ],
  },
  async function test_update_url_policy() {
    const XPI_FROM_DEFAULT_UPDATE_URL = `${BASE_URL}/policy_updating_from_default.xpi`;
    const XPI_FROM_POLICIES_UPDATE_URL = `${BASE_URL}/policy_updating_from_policies.xpi`;

    const defaultFakeUpdates = [
      {
        version: "2.0",
        update_link: XPI_FROM_DEFAULT_UPDATE_URL,
      },
    ];
    const policiesFakeUpdates = [
      {
        version: "2.0",
        update_link: XPI_FROM_POLICIES_UPDATE_URL,
      },
    ];

    let defaultUpdateURLHit = false;
    let policiesUpdateURLHit = false;

    server.registerPathHandler(
      "/data/default_update.json",
      (request, response) => {
        defaultUpdateURLHit = true;
        response.setHeader("Content-Type", "application/json");
        response.write(
          JSON.stringify({
            addons: {
              [addonID]: {
                updates: defaultFakeUpdates,
              },
            },
          })
        );
      }
    );

    server.registerPathHandler(
      "/data/policy_update.json",
      (request, response) => {
        policiesUpdateURLHit = true;
        response.setHeader("Content-Type", "application/json");
        response.write(
          JSON.stringify({
            addons: {
              [addonID]: {
                updates: policiesFakeUpdates,
              },
            },
          })
        );
      }
    );

    const verifyAddonUpdateCheck = async (expected, msg) => {
      defaultUpdateURLHit = false;
      policiesUpdateURLHit = false;

      // Trigger the update check.
      const updateFound = await AddonTestUtils.promiseFindAddonUpdates(addon);

      Assert.ok(
        updateFound?.updateAvailable,
        "Got an add-on update as expected"
      );

      const actual = {
        defaultUpdateURLHit,
        policiesUpdateURLHit,
        update_link: updateFound?.updateAvailable?.sourceURI.spec,
      };
      Assert.deepEqual(actual, expected, msg);
      await updateFound?.updateAvailable?.cancel();
    };

    let install = await AddonManager.getInstallForURL(
      BASE_URL + "/policy_test.xpi"
    );
    await install.install();
    let addon = await AddonManager.getAddonByID(addonID);
    Assert.notEqual(addon, null, "Addon should be installed");

    info(
      "Verify add-on update checks default update url before enterprise policies data is set"
    );
    // Sanity check (the default add-ons update url is used by default).
    await verifyAddonUpdateCheck(
      {
        defaultUpdateURLHit: true,
        policiesUpdateURLHit: false,
        update_link: XPI_FROM_DEFAULT_UPDATE_URL,
      },
      "Expect addon update check to have been initially requested on the default update url"
    );

    info(
      "Verify add-on update checks default update url on invalid update url in enterprise policies data"
    );
    let stopConsoleListener = TestUtils.listenForConsoleMessages();
    await setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [addonID]: {
            update_url: "not-a-valid-url",
          },
        },
      },
    });
    const messages = await stopConsoleListener();
    const updateURLValidationError = messages.find(
      msg =>
        msg.level == "error" &&
        msg.arguments[0].includes(addonID) &&
        msg.arguments[0].includes("update_url")
    );
    Assert.ok(
      updateURLValidationError,
      "Got expected validation error for the invalid update_url"
    );

    await verifyAddonUpdateCheck(
      {
        defaultUpdateURLHit: true,
        policiesUpdateURLHit: false,
        update_link: XPI_FROM_DEFAULT_UPDATE_URL,
      },
      "Expect addon update check to be requested on the default update url on invalid policies update_url"
    );

    info(
      "Verify add-on update checks policy overridden update url after enterprise policies data is set"
    );
    await setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [addonID]: {
            update_url: `${BASE_URL}/policy_update.json`,
          },
        },
      },
    });
    await verifyAddonUpdateCheck(
      {
        defaultUpdateURLHit: false,
        policiesUpdateURLHit: true,
        update_link: XPI_FROM_POLICIES_UPDATE_URL,
      },
      "Expect addon update check hits the custom update url set in the policies data"
    );

    info(
      "Verify add-on update checks default update url after enterprise policies update_url is removed"
    );
    await setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [addonID]: {
            // Override the addonID setting with a new non-empty object
            // without the update_url set (an empty object would
            // not update the settings loaded in the previous step
            // of this same test).
            installation_mode: "allowed",
          },
        },
      },
    });
    await verifyAddonUpdateCheck(
      {
        defaultUpdateURLHit: true,
        policiesUpdateURLHit: false,
        update_link: XPI_FROM_DEFAULT_UPDATE_URL,
      },
      "Expect addon update check hits the default update url after policies data removal"
    );

    await addon.uninstall();
  }
);
