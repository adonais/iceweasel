/* Any copyright is dedicated to the Public Domain.
 *    http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests that configuration search engines installed by the user
 * are installed and persisted correctly.
 */

"use strict";

const { AppProvidedConfigEngine, UserInstalledConfigEngine } =
  ChromeUtils.importESModule(
    "moz-src:///toolkit/components/search/ConfigSearchEngine.sys.mjs"
  );

const CONFIG = [
  { identifier: "default" },
  {
    identifier: "additional",
    base: {
      name: "Additional Engine",
      urls: {
        search: {
          base: "https://example.net",
          params: [{ name: "pc", value: "{partnerCode}" }],
          searchTermParamName: "q",
        },
      },
      partnerCode: "old_partner_code",
    },
    variants: [
      {
        environment: { regions: ["de"] },
        partnerCode: "regional_partner_code",
      },
    ],
  },
];

const OVERRIDES_CONFIG = [
  {
    identifier: "additional",
    urls: {
      search: {
        params: [
          { name: "new_param", value: "new_value" },
          { name: "pc", value: "{partnerCode}" },
        ],
      },
    },
    partnerCode: "new_partner_code",
    telemetrySuffix: "tsfx",
    clickUrl: "https://example.org/somewhere",
  },
];

async function assertEngines(expectedNumber, message) {
  let engines = await SearchService.getVisibleEngines();
  Assert.equal(engines.length, expectedNumber, message);
}

async function restartSearchService() {
  await SearchService.reset();
  await SearchService.init(true);
}

add_setup(async function () {
  SearchTestUtils.setRemoteSettingsConfig(CONFIG);
  await SearchService.init();
  await SearchTestUtils.initXPCShellAddonManager();
});

async function install() {
  let engine =
    await SearchService.findContextualSearchEngineByHost("example.net");
  let settingsFileWritten = promiseAfterSettings();
  await SearchService.addSearchEngine(engine);
  await settingsFileWritten;

  await assertEngines(2, "New engine is installed");
}

add_task(install);

add_task(async function update() {
  let updatedConfig = structuredClone(CONFIG);
  let updatedName = "Updated Additional Engine";
  updatedConfig[1].base.name = updatedName;
  await SearchTestUtils.updateRemoteSettingsConfig(updatedConfig);
  await assertEngines(2, "Engine is persisted after reload");

  Assert.ok(
    SearchService.getEngineByName(updatedName),
    "The engines details are updated when configuration changes"
  );

  await restartSearchService();
  await assertEngines(2, "Engine is persisted after restart");
});

// search-config-overrides-v2 does currently not work with
// user installed config engines.
add_task(async function overridesConfigNotApplied() {
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG, OVERRIDES_CONFIG);
  let engine = SearchService.getEngineById("additional");
  Assert.equal(
    engine.getSubmission("foo").uri.spec,
    "https://example.net/?pc=old_partner_code&q=foo",
    "Uses old_partner_code initially"
  );

  await restartSearchService();
  engine = SearchService.getEngineById("additional");

  Assert.equal(
    engine.getSubmission("foo").uri.spec,
    "https://example.net/?pc=old_partner_code&q=foo",
    "Partner code was not overridden"
  );

  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG, undefined);
});

add_task(async function switchRegion() {
  let engine = SearchService.getEngineById("additional");
  Assert.ok(
    engine instanceof UserInstalledConfigEngine,
    "Starts as a UserInstalledConfigEngine"
  );
  Assert.equal(engine.partnerCode, "old_partner_code");

  // Switch to a region where the engine is app provided.
  await promiseSetHomeRegion("de");
  Assert.ok(
    engine instanceof AppProvidedConfigEngine,
    "Upgraded to AppProvidedConfigEngine"
  );
  Assert.equal(engine.partnerCode, "regional_partner_code");

  await restartSearchService();
  engine = SearchService.getEngineById("additional");
  Assert.ok(
    engine instanceof AppProvidedConfigEngine,
    "Still is AppProvidedConfigEngine"
  );
  Assert.equal(engine.partnerCode, "regional_partner_code");

  // Switch back to a region where the engine isn't app provided.
  await promiseSetHomeRegion("unknown");
  Assert.ok(
    engine instanceof UserInstalledConfigEngine,
    "Downgraded to UserInstalledConfigEngine"
  );
  Assert.equal(engine.partnerCode, "old_partner_code");

  await restartSearchService();
  engine = SearchService.getEngineById("additional");
  Assert.ok(
    engine instanceof UserInstalledConfigEngine,
    "Still is UserInstalledConfigEngine"
  );
  Assert.equal(engine.partnerCode, "old_partner_code");
});

add_task(async function removedFromConfig() {
  // Set as default so we can check if the default changed notification
  // is shown when the engine is removed from the search config.
  await SearchService.setDefault(
    SearchService.getEngineById("additional"),
    SearchService.CHANGE_REASON.UNKNOWN
  );

  let stub = sinon.stub(
    SearchService,
    "_showRemovalOfSearchEngineNotificationBox"
  );

  await SearchTestUtils.updateRemoteSettingsConfig([CONFIG[0]]);
  await assertEngines(1, "Engine was removed");

  Assert.ok(
    stub.calledOnce,
    "Removing the user config engine should show the notification box if default"
  );

  stub.restore();
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);
  await install();
});

// Tests whether an extension with `is_default: true` that's in the
// override allowlist overrides the user added config engine.
add_task(async function overriddenByExtension() {
  let settings = await RemoteSettings(SearchUtils.SETTINGS_ALLOWLIST_KEY);
  let remoteSettingsStub = sinon.stub(settings, "get").returns([
    {
      thirdPartyId: "additionalengine@tests.mozilla.org",
      overridesAppIdv2: "additional",
      urls: [
        {
          search_url: "https://overridden.example.net/",
          search_url_get_params: "?q={searchTerms}",
        },
      ],
    },
  ]);

  let assertOverridden = async function () {
    let engine = SearchService.getEngineById("additional");
    Assert.ok(
      engine instanceof UserInstalledConfigEngine,
      "Should still be a user installed config engine"
    );
    Assert.equal(engine.overriddenById, "additionalengine@tests.mozilla.org");
    Assert.equal(engine.telemetryId, "additional-addon");
    Assert.equal(
      engine.getSubmission("foo").uri.spec,
      "https://overridden.example.net/?q=foo"
    );
    await assertEngines(2, "No add-on engine was added");
  };

  info("Setting up extension override for the user installed config engine.");
  let settingsFileWritten = promiseAfterSettings();
  let extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: SearchTestUtils.createEngineManifest({
      name: "Additional Engine",
      is_default: true,
      search_url: "https://overridden.example.net/",
    }),
  });
  await extension.startup();
  await AddonTestUtils.waitForSearchProviderStartup(extension);
  await settingsFileWritten;
  await assertOverridden();

  info("Simulate restart and check the user installed config engine again.");
  await AddonTestUtils.promiseShutdownManager();
  SearchService.reset();
  await AddonTestUtils.promiseStartupManager();
  await SearchService.init(true);
  await extension.awaitStartup();
  await AddonTestUtils.waitForSearchProviderStartup(extension);
  await assertOverridden();

  remoteSettingsStub.restore();
  settingsFileWritten = promiseAfterSettings();
  await extension.unload();
  await settingsFileWritten;
});

add_task(async function remove() {
  let engine = SearchService.getEngineById("additional");
  let engineLoadPath = engine._loadPath;
  // Set the seen counter to some value so we can check if it was reset.
  SearchService._settings.setMetaDataAttribute("contextual-engines-seen", {
    [engineLoadPath]: -1,
  });

  let settingsFileWritten = promiseAfterSettings();
  await SearchService.removeEngine(engine);
  await settingsFileWritten;
  await assertEngines(1, "Engine was removed");

  await restartSearchService();
  await assertEngines(1, "Engine stays removed after restart");

  SearchService.restoreDefaultEngines();
  await assertEngines(1, "Engine stays removed after restore");

  let seenEngines = SearchService._settings.getMetaDataAttribute(
    "contextual-engines-seen"
  );
  Assert.ok(
    !Object.keys(seenEngines).includes(engineLoadPath),
    "Seen counter was reset."
  );
});
