/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.appInfo = getAppInfo();
ExtensionTestUtils.init(this);

const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
const BASE_URL = "http://example.com/data";

function makeAMOResponse(id, xpiURL) {
  return {
    page_size: 25,
    page_count: 1,
    count: xpiURL ? 1 : 0,
    next: null,
    previous: null,
    results: xpiURL
      ? [
          {
            guid: id,
            type: "extension",
            name: "Test Addon",
            current_version: {
              version: "1.0",
              files: [{ platform: "all", url: xpiURL }],
            },
          },
        ]
      : [],
  };
}

// force_installed and normal_installed without install_url are installed via
// AddonRepository; allowed and blocked are not auto-installed.
add_task(
  {
    pref_set: [
      ["extensions.install.requireSecureOrigin", false],
      ["extensions.getAddons.get.url", `${BASE_URL}/amo.json?guid=%IDS%`],
    ],
  },
  async function test_install_from_repository() {
    await AddonTestUtils.promiseStartupManager();

    const forceId = "force-installed-no-url@test";
    const normalId = "normal-installed-no-url@test";
    const allowedId = "allowed-no-url@test";
    const blockedId = "blocked-no-url@test";

    const xpiURLMap = {
      [forceId]: `${BASE_URL}/force.xpi`,
      [normalId]: `${BASE_URL}/normal.xpi`,
    };

    for (const [id, path] of [
      [forceId, "/data/force.xpi"],
      [normalId, "/data/normal.xpi"],
    ]) {
      server.registerFile(
        path,
        AddonTestUtils.createTempWebExtensionFile({
          manifest: {
            version: "1.0",
            browser_specific_settings: { gecko: { id } },
          },
        })
      );
    }

    server.registerPathHandler("/data/amo.json", (request, response) => {
      const guid = decodeURIComponent(
        request.queryString.replace(/^guid=/, "")
      );
      response.setHeader("Content-Type", "application/json");
      response.write(
        JSON.stringify(makeAMOResponse(guid, xpiURLMap[guid] ?? null))
      );
    });

    let forceExtension = ExtensionTestUtils.expectExtension(forceId);
    let normalExtension = ExtensionTestUtils.expectExtension(normalId);

    await Promise.all([
      forceExtension.awaitStartup(),
      normalExtension.awaitStartup(),
      setupPolicyEngineWithJson({
        policies: {
          ExtensionSettings: {
            [forceId]: { installation_mode: "force_installed" },
            [normalId]: { installation_mode: "normal_installed" },
            [allowedId]: { installation_mode: "allowed" },
            [blockedId]: { installation_mode: "blocked" },
          },
        },
      }),
    ]);

    const forceAddon = await AddonManager.getAddonByID(forceId);
    notEqual(
      forceAddon,
      null,
      "force_installed addon should be installed via AMO"
    );
    equal(forceAddon.version, "1.0", "force_installed addon version");

    const normalAddon = await AddonManager.getAddonByID(normalId);
    notEqual(
      normalAddon,
      null,
      "normal_installed addon should be installed via AMO"
    );
    equal(normalAddon.version, "1.0", "normal_installed addon version");

    equal(
      await AddonManager.getAddonByID(allowedId),
      null,
      "allowed addon should not be auto-installed"
    );
    equal(
      await AddonManager.getAddonByID(blockedId),
      null,
      "blocked addon should not be auto-installed"
    );

    await forceAddon.uninstall();
    await normalAddon.uninstall();
    await AddonTestUtils.promiseShutdownManager();
  }
);

// When the extension is not on AMO, log an error and do not install.
add_task(
  {
    pref_set: [
      ["extensions.getAddons.get.url", `${BASE_URL}/amo-empty.json?guid=%IDS%`],
    ],
  },
  async function test_not_on_amo_does_not_install() {
    await AddonTestUtils.promiseStartupManager();

    const id = "not-on-amo@test";
    server.registerPathHandler("/data/amo-empty.json", (request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.write(JSON.stringify(makeAMOResponse(id, null)));
    });

    const errorLogged = TestUtils.consoleMessageObserved(msg =>
      msg.wrappedJSObject.arguments[0]?.includes(
        `No XPI URL found on AMO for ${id}`
      )
    );

    await setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [id]: {
            installation_mode: "force_installed",
          },
        },
      },
    });
    await errorLogged;

    equal(
      await AddonManager.getAddonByID(id),
      null,
      "Addon should not be installed when not found on AMO"
    );

    await AddonTestUtils.promiseShutdownManager();
  }
);

// With only update_url, the newest compatible version in the update manifest is
// installed; a newer but incompatible entry is skipped. An entry for an
// unrelated add-on listed first in the manifest is ignored, confirming the
// lookup is keyed by extension ID rather than by response order.
add_task(
  {
    pref_set: [["extensions.checkUpdateSecurity", false]],
  },
  async function test_install_from_update_url() {
    await AddonTestUtils.promiseStartupManager();

    const id = "update-url-only@test";
    const unrelatedId = "unrelated-extension@test";

    for (const version of ["1.0", "2.0"]) {
      server.registerFile(
        `/data/update-url-only-${version}.xpi`,
        AddonTestUtils.createTempWebExtensionFile({
          manifest: {
            version,
            browser_specific_settings: { gecko: { id } },
          },
        })
      );
    }

    server.registerFile(
      "/data/unrelated-extension-5.0.xpi",
      AddonTestUtils.createTempWebExtensionFile({
        manifest: {
          version: "5.0",
          browser_specific_settings: { gecko: { id: unrelatedId } },
        },
      })
    );

    server.registerPathHandler("/data/update.json", (request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.write(
        JSON.stringify({
          addons: {
            [unrelatedId]: {
              updates: [
                {
                  version: "5.0",
                  update_link: `${BASE_URL}/unrelated-extension-5.0.xpi`,
                },
              ],
            },
            [id]: {
              updates: [
                {
                  version: "1.0",
                  update_link: `${BASE_URL}/update-url-only-1.0.xpi`,
                },
                {
                  version: "2.0",
                  update_link: `${BASE_URL}/update-url-only-2.0.xpi`,
                },
                {
                  version: "3.0",
                  update_link: `${BASE_URL}/update-url-only-3.0.xpi`,
                  applications: { gecko: { strict_min_version: "9999" } },
                },
              ],
            },
          },
        })
      );
    });

    let extension = ExtensionTestUtils.expectExtension(id);
    await Promise.all([
      extension.awaitStartup(),
      setupPolicyEngineWithJson({
        policies: {
          ExtensionSettings: {
            [id]: {
              installation_mode: "force_installed",
              update_url: `${BASE_URL}/update.json`,
            },
          },
        },
      }),
    ]);

    const addon = await AddonManager.getAddonByID(id);
    notEqual(addon, null, "Addon should be installed from the update manifest");
    equal(addon.version, "2.0", "Newest compatible version was installed");

    await addon.uninstall();
    await AddonTestUtils.promiseShutdownManager();
  }
);

// update_hash from the manifest is enforced against the downloaded XPI. No prefs
// needed: a strong update_hash keeps the http update_link past
// checkUpdateSecurity.
add_task(async function test_update_hash_mismatch_does_not_install() {
  await AddonTestUtils.promiseStartupManager();

  const id = "update-url-badhash@test";

  server.registerFile(
    "/data/badhash.xpi",
    AddonTestUtils.createTempWebExtensionFile({
      manifest: {
        version: "1.0",
        browser_specific_settings: { gecko: { id } },
      },
    })
  );

  server.registerPathHandler(
    "/data/update-badhash.json",
    (request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.write(
        JSON.stringify({
          addons: {
            [id]: {
              updates: [
                {
                  version: "1.0",
                  update_link: `${BASE_URL}/badhash.xpi`,
                  update_hash: `sha256:${"0".repeat(64)}`,
                },
              ],
            },
          },
        })
      );
    }
  );

  const downloadFailed = AddonTestUtils.promiseInstallEvent("onDownloadFailed");

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        [id]: {
          installation_mode: "force_installed",
          update_url: `${BASE_URL}/update-badhash.json`,
        },
      },
    },
  });
  await downloadFailed;

  equal(
    await AddonManager.getAddonByID(id),
    null,
    "Addon should not be installed when the update_hash does not match"
  );

  await AddonTestUtils.promiseShutdownManager();
});

// An update_url the URL parser rejects fails validation, which drops the whole
// entry, so the add-on is not installed from AMO either.
add_task(
  {
    pref_set: [
      ["extensions.getAddons.get.url", `${BASE_URL}/amo.json?guid=%IDS%`],
    ],
  },
  async function test_unparseable_update_url_does_not_fall_back_to_amo() {
    await AddonTestUtils.promiseStartupManager();

    const id = "update-url-unparseable@test";

    const errorLogged = TestUtils.consoleMessageObserved(msg =>
      msg.wrappedJSObject.arguments[0]?.includes(
        'update_url: String does not match format "moz-url"'
      )
    );

    await setupPolicyEngineWithJson({
      policies: {
        ExtensionSettings: {
          [id]: {
            installation_mode: "force_installed",
            update_url: "http://",
          },
        },
      },
    });
    await errorLogged;

    equal(
      await AddonManager.getAddonByID(id),
      null,
      "Addon should not be installed from AMO when update_url is unusable"
    );

    await AddonTestUtils.promiseShutdownManager();
  }
);

// An update_url naming the default add-on update service is discarded outright,
// so neither the install nor a later update check can reuse it, and the add-on
// still installs through the AMO fallback.
add_task(
  {
    pref_set: [
      ["extensions.getAddons.get.url", `${BASE_URL}/amo.json?guid=%IDS%`],
    ],
  },
  async function test_update_url_matching_amo_default_is_discarded() {
    await AddonTestUtils.promiseStartupManager();

    const id = "update-url-amo-default@test";
    const backgroundId = "update-url-amo-background@test";
    const defaults = Services.prefs.getDefaultBranch(null);
    const defaultUpdateHostname = new URL(
      defaults.getCharPref("extensions.update.url")
    ).hostname;
    const backgroundUpdateHostname = new URL(
      defaults.getCharPref("extensions.update.background.url")
    ).hostname;
    const xpiURL = `${BASE_URL}/update-url-amo-default.xpi`;

    server.registerFile(
      "/data/update-url-amo-default.xpi",
      AddonTestUtils.createTempWebExtensionFile({
        manifest: {
          version: "1.0",
          browser_specific_settings: { gecko: { id } },
        },
      })
    );

    server.registerPathHandler("/data/amo.json", (request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.write(JSON.stringify(makeAMOResponse(id, xpiURL)));
    });

    const warningLogged = TestUtils.consoleMessageObserved(msg =>
      msg.wrappedJSObject.arguments[0]?.includes(`Invalid update_url for ${id}`)
    );

    let extension = ExtensionTestUtils.expectExtension(id);
    await Promise.all([
      extension.awaitStartup(),
      setupPolicyEngineWithJson({
        policies: {
          ExtensionSettings: {
            [id]: {
              installation_mode: "force_installed",
              update_url: `http://${defaultUpdateHostname}:8080/update/VersionCheck.php`,
            },
            [backgroundId]: {
              installation_mode: "allowed",
              update_url: `http://${backgroundUpdateHostname}:8080/update/VersionCheck.php`,
            },
          },
        },
      }),
    ]);
    await warningLogged;

    const addon = await AddonManager.getAddonByID(id);
    notEqual(
      addon,
      null,
      "Addon should still be installed via AMO when update_url matches the default service"
    );
    equal(addon.version, "1.0", "Addon installed from the AMO fallback");

    equal(
      Services.policies.getExtensionSettings(id)?.update_url,
      undefined,
      "update_url should be discarded, not just skipped, so later update checks don't reuse it"
    );

    equal(
      Services.policies.getExtensionSettings(backgroundId)?.update_url,
      undefined,
      "The background update service hostname should be discarded too"
    );

    await addon.uninstall();
    await AddonTestUtils.promiseShutdownManager();
  }
);

// The "%...%" placeholders normal update checks substitute are an add-on manager
// implementation detail, not policy syntax: the schema's update_url pattern
// requires "%" to be followed by two hex digits. The whole ExtensionSettings
// entry is dropped when one property fails validation, so installation_mode goes
// with it and the add-on is never installed by any path.
add_task(async function test_update_url_with_placeholders_fails_validation() {
  await AddonTestUtils.promiseStartupManager();

  const id = "update-url-placeholders@test";

  const schemaErrorLogged = TestUtils.consoleMessageObserved(msg =>
    msg.wrappedJSObject.arguments[0]?.includes(
      "update_url: String does not match pattern."
    )
  );

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        [id]: {
          installation_mode: "force_installed",
          update_url: `${BASE_URL}/update-placeholders.json?item=%ITEM_ID%`,
        },
      },
    },
  });
  await schemaErrorLogged;

  equal(
    await AddonManager.getAddonByID(id),
    null,
    "Addon should not be installed when update_url fails schema validation"
  );

  await AddonTestUtils.promiseShutdownManager();
});
