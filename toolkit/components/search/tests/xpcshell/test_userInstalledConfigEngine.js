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

async function assertEngines(expectedNumber, message) {
  let engines = await Services.search.getVisibleEngines();
  Assert.equal(engines.length, expectedNumber, message);
}

async function restartSearchService() {
  await Services.search.wrappedJSObject.reset();
  await Services.search.init(true);
}

add_setup(async function () {
  SearchTestUtils.setRemoteSettingsConfig(CONFIG);
  await Services.search.init();
});

add_task(async function install() {
  let engine =
    await Services.search.findContextualSearchEngineByHost("example.net");
  let settingsFileWritten = promiseAfterSettings();
  await Services.search.addSearchEngine(engine);
  await settingsFileWritten;

  await assertEngines(2, "New engine is installed");
});

add_task(async function update() {
  let updatedName = "Updated Additional Engine";
  CONFIG[1].base.name = updatedName;
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);
  await assertEngines(2, "Engine is persisted after reload");

  Assert.ok(
    Services.search.getEngineByName(updatedName),
    "The engines details are updated when configuration changes"
  );

  await restartSearchService();
  await assertEngines(2, "Engine is persisted after restart");
});

add_task(async function switchRegion() {
  let engine = Services.search.getEngineById("additional").wrappedJSObject;
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
  engine = Services.search.getEngineById("additional").wrappedJSObject;
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
  engine = Services.search.getEngineById("additional").wrappedJSObject;
  Assert.ok(
    engine instanceof UserInstalledConfigEngine,
    "Still is UserInstalledConfigEngine"
  );
  Assert.equal(engine.partnerCode, "old_partner_code");
});

add_task(async function remove() {
  let engine = Services.search.getEngineById("additional");
  let engineLoadPath = engine.wrappedJSObject._loadPath;
  // Set the seen counter to some value so we can check if it was reset.
  Services.search.wrappedJSObject._settings.setMetaDataAttribute(
    "contextual-engines-seen",
    { [engineLoadPath]: -1 }
  );

  let settingsFileWritten = promiseAfterSettings();
  await Services.search.removeEngine(engine);
  await settingsFileWritten;
  await assertEngines(1, "Engine was removed");

  await restartSearchService();
  await assertEngines(1, "Engine stays removed after restart");

  Services.search.restoreDefaultEngines();
  await assertEngines(1, "Engine stays removed after restore");

  let seenEngines =
    Services.search.wrappedJSObject._settings.getMetaDataAttribute(
      "contextual-engines-seen"
    );
  Assert.ok(
    !Object.keys(seenEngines).includes(engineLoadPath),
    "Seen counter was reset."
  );
});
