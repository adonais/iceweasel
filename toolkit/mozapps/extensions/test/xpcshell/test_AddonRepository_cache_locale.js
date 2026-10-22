"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PREF_GETADDONS_CACHE_ENABLED = "extensions.getAddons.cache.enabled";
const PREF_METADATA_LASTUPDATE = "extensions.getAddons.cache.lastUpdate";
Services.prefs.setBoolPref(PREF_GETADDONS_CACHE_ENABLED, true);

AddonTestUtils.createAppInfo(
  "xpcshell@tests.mozilla.org",
  "XPCShell",
  "42",
  "42"
);

let server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
server.registerDirectory("/data/", do_get_file("data"));

// Use %LOCALE% as the default pref does. It is set from appLocaleAsBCP47.
Services.prefs.setStringPref(
  PREF_GETADDONS_BYIDS,
  "http://example.com/addons.json?guids=%IDS%&locale=%LOCALE%"
);

const TEST_ADDON_ID = "test_AddonRepository_1@tests.mozilla.org";
const TEST_LANGPACK_UND_ID = "langpack-und@test.mozilla.org";

const repositoryAddons = {
  "test_AddonRepository_1@tests.mozilla.org": {
    name: "Repo Add-on 1",
    type: "extension",
    guid: TEST_ADDON_ID,
    current_version: {
      version: "2.1",
      files: [
        {
          platform: "all",
          size: 9,
          url: "http://example.com/repo/1/install.xpi",
        },
      ],
    },
  },
  "langpack-und@test.mozilla.org": {
    // included only to avoid exceptions in AddonRepository
    name: "und langpack",
    type: "language",
    guid: TEST_LANGPACK_UND_ID,
    current_version: {
      version: "1.1",
      files: [
        {
          platform: "all",
          size: 9,
          url: "http://example.com/repo/1/langpack.xpi",
        },
      ],
    },
  },
};

server.registerPathHandler("/addons.json", (request, response) => {
  let search = new URLSearchParams(request.queryString);
  let IDs = search.get("guids").split(",");
  let locale = search.get("locale");

  let repositoryData = {
    page_size: 25,
    page_count: 1,
    count: 0,
    next: null,
    previous: null,
    results: [],
  };
  for (let id of IDs) {
    let data = JSON.parse(JSON.stringify(repositoryAddons[id]));
    data.summary = `This is an ${locale} addon data object`;
    data.description = `Full Description ${locale}`;
    repositoryData.results.push(data);
  }
  repositoryData.count = repositoryData.results.length;

  // The request contains the IDs to retreive, but we're just handling the
  // two test addons so it's static data.
  response.setHeader("content-type", "application/json");
  response.write(JSON.stringify(repositoryData));
});

const ADDONS = [
  {
    manifest: {
      name: "XPI Add-on 1",
      version: "1.1",

      description: "XPI Add-on 1 - Description",
      developer: {
        name: "XPI Add-on 1 - Author",
      },

      homepage_url: "http://example.com/xpi/1/homepage.html",
      icons: {
        32: "icon.png",
      },

      options_ui: {
        page: "options.html",
      },

      browser_specific_settings: {
        gecko: { id: TEST_ADDON_ID },
      },
    },
  },
  {
    // Necessary to provide the "und" locale
    manifest: {
      name: "und Language Pack",
      version: "1.0",
      manifest_version: 2,
      browser_specific_settings: {
        gecko: {
          id: TEST_LANGPACK_UND_ID,
        },
      },
      sources: {
        browser: {
          base_path: "browser/",
        },
      },
      langpack_id: "und",
      languages: {
        und: {
          chrome_resources: {
            global: "chrome/und/locale/und/global/",
          },
          version: "20171001190118",
        },
      },
      author: "Mozilla Localization Task Force",
      description: "Language pack for Testy for und",
    },
  },
];
const ADDON_FILES = ADDONS.map(addon =>
  AddonTestUtils.createTempWebExtensionFile(addon)
);

const INTL_LOCALES_CHANGED = "intl:app-locales-changed";

function promiseLocaleChanged(requestedLocale) {
  return new Promise(resolve => {
    let localeObserver = {
      observe(aSubject, aTopic) {
        switch (aTopic) {
          case INTL_LOCALES_CHANGED: {
            let reqLocs = Services.locale.requestedLocales;
            equal(reqLocs[0], requestedLocale);
            equal(Services.locale.appLocaleAsBCP47, requestedLocale);
            Services.obs.removeObserver(localeObserver, INTL_LOCALES_CHANGED);
            resolve();
          }
        }
      },
    };
    Services.obs.addObserver(localeObserver, INTL_LOCALES_CHANGED);
    Services.locale.requestedLocales = [requestedLocale];
  });
}

function promiseMetaDataUpdate() {
  // This pref is a 1s resolution, set it to zero so the
  // next test can wait on it being updated again.
  Services.prefs.setIntPref(PREF_METADATA_LASTUPDATE, 0);
  return new Promise(resolve => {
    let listener = () => {
      Services.prefs.removeObserver(PREF_METADATA_LASTUPDATE, listener);
      resolve();
    };

    Services.prefs.addObserver(PREF_METADATA_LASTUPDATE, listener);
  });
}

function promiseLocale(locale) {
  return Promise.all([promiseLocaleChanged(locale), promiseMetaDataUpdate()]);
}

let AddonRepositoryUpdateSpy;

add_setup(async function setup() {
  const { AddonRepository } = ChromeUtils.importESModule(
    "resource://gre/modules/addons/AddonRepository.sys.mjs"
  );
  AddonRepositoryUpdateSpy = sinon.spy(
    AddonRepository,
    "backgroundUpdateCheck"
  );
  registerCleanupFunction(() => AddonRepositoryUpdateSpy.restore());

  await promiseStartupManager();

  const promisedMetadataUpdate = promiseMetaDataUpdate();

  for (let xpi of ADDON_FILES) {
    await promiseInstallFile(xpi);
  }

  // When a langpack is started up, it triggers locale negotiation and ends up
  // triggering "intl:app-locales-changed" that triggers an update check.
  // This assertion checks current behavior, it does not necessarily show that
  // the behavior makes sense; in fact I question whether it makes sense to
  // force an update check of addon metadata during browser startup.
  equal(
    AddonRepositoryUpdateSpy.callCount,
    1,
    "Starting up a langpack triggers a metadata update check"
  );
  AddonRepositoryUpdateSpy.resetHistory();
  await promisedMetadataUpdate;
  equal(
    AddonRepositoryUpdateSpy.callCount,
    0,
    "No other unexpected metadata update checks"
  );
});

add_task(async function test_locale_change() {
  // In tests we default to en-US; The install of the langpack in setup already
  // triggered an update check that ought have cached the add-on data.
  equal(Services.locale.appLocaleAsBCP47, "en-US", "Locale is en-US");
  let addon = await AddonRepository.getCachedAddonByID(TEST_ADDON_ID);
  Assert.ok(addon.description.includes("en-US"), "description is en-us");
  Assert.ok(
    addon.fullDescription.includes("en-US"),
    "fullDescription is en-us"
  );

  // Wait for the last update timestamp to be updated.
  await promiseLocale("und");

  addon = await AddonRepository.getCachedAddonByID(TEST_ADDON_ID);

  Assert.ok(
    addon.description.includes("und"),
    `description is ${addon.description}`
  );
  Assert.ok(
    addon.fullDescription.includes("und"),
    `fullDescription is ${addon.fullDescription}`
  );
  equal(AddonRepositoryUpdateSpy.callCount, 1, "updated after change to und");

  await promiseLocale("en-US");
  equal(AddonRepositoryUpdateSpy.callCount, 2, "updated after change to en-US");
  addon = await AddonRepository.getCachedAddonByID(TEST_ADDON_ID);
  Assert.ok(addon.description.includes("en-US"), "description is en-us");

  AddonRepositoryUpdateSpy.resetHistory();
});

// Regression test for bug 2052032: Previously the logic eagerly performed an
// update check whenever the set of available locales changed (i.e. when a
// langpack was registered at startup or update), which caused performance
// issues. This check verifies that there is no update check when the primary
// language is unchanged.
add_task(async function no_update_check_when_primary_language_is_unchanged() {
  const langpackUnd = await AddonManager.getAddonByID(TEST_LANGPACK_UND_ID);
  Assert.deepEqual(
    Services.locale.availableLocales.toSorted(),
    ["en-US", "und"],
    "Initially has default en-US locale and und from langpack"
  );
  let updated = TestUtils.topicObserved(INTL_LOCALES_CHANGED);
  await langpackUnd.disable();
  await updated;
  Assert.deepEqual(
    Services.locale.availableLocales.toSorted(),
    ["en-US"],
    "After disabling und langpack, it is gone from availableLocales"
  );

  updated = TestUtils.topicObserved(INTL_LOCALES_CHANGED);
  await langpackUnd.enable();
  await updated;
  Assert.deepEqual(
    Services.locale.availableLocales.toSorted(),
    ["en-US", "und"],
    "After enabling und langpack, it is back in availableLocales"
  );
  equal(Services.locale.appLocaleAsBCP47, "en-US", "Locale is still en-US");

  equal(
    AddonRepositoryUpdateSpy.callCount,
    0,
    "When the primary language is unchanged, no update check is forced"
  );
  AddonRepositoryUpdateSpy.resetHistory();
});
