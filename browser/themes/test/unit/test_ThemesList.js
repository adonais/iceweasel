/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_INSTALL_SOURCE = "about:addons";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { getThemesList, TESTING_XPI_BASE_URL } = ChromeUtils.importESModule(
  "moz-src:///browser/themes/ThemesList.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();

add_setup(async function setup() {
  AddonTestUtils.createAppInfo(
    "xpcshell@tests.mozilla.org",
    "XPCShell",
    "1",
    "1.9.2"
  );
  await AddonTestUtils.promiseStartupManager();
});

add_task(async function test_getThemesList_installSource_mandatory() {
  await Assert.rejects(
    getThemesList({}),
    /getThemesList installSource option is mandatory/,
    "getThemesList rejects when installSource is not passed"
  );
  await Assert.rejects(
    getThemesList({ installSource: "" }),
    /getThemesList installSource option is mandatory/,
    "getThemesList rejects when installSource is an empty string"
  );
});

add_task(async function test_getThemesList() {
  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });

  Assert.ok(
    manager.hasThemeId("default-theme@mozilla.org"),
    "hasThemeId returns true for default-theme@mozilla.org"
  );
  Assert.ok(
    manager.hasThemeId("nova-sun@mozilla.org"),
    "hasThemeId returns true for nova-sun@mozilla.org"
  );
  Assert.ok(
    !manager.hasThemeId("unknown-theme@mozilla.org"),
    "hasThemeId returns false for an unmanaged ID"
  );

  Assert.ok(
    manager.isBuiltIn("default-theme@mozilla.org"),
    "default-theme@mozilla.org is the built-in theme"
  );
  Assert.ok(
    !manager.isBuiltIn("nova-sun@mozilla.org"),
    "nova-sun@mozilla.org is not a built-in theme"
  );
});

// TODO(Bug 2053217) rework this test to use a test-only helper
// to override the themes metadata used by ThemesList.sys.mjs.
add_task(async function test_getThemesInfo() {
  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  const themes = manager.getThemesInfo();

  Assert.ok(Array.isArray(themes), "getThemesInfo returns an Array");
  Assert.ok(
    themes.some(t => t.id === "default-theme@mozilla.org"),
    "includes default-theme@mozilla.org"
  );
  Assert.ok(
    themes.some(t => t.id === "nova-sun@mozilla.org"),
    "includes nova-sun@mozilla.org"
  );
  Assert.ok(
    !themes.some(t => t.id === "unknown-theme@mozilla.org"),
    "does not include unmanaged IDs"
  );
  const ids = themes.map(t => t.id);
  Assert.equal(new Set(ids).size, ids.length, "all IDs are unique");

  // Verify themePickerColors are included
  const defaultTheme = themes.find(t => t.id === "default-theme@mozilla.org");
  Assert.ok(defaultTheme?.themePickerColors, "includes themePickerColors");
  Assert.ok(defaultTheme.themePickerColors.light, "has light variant");
  Assert.ok(defaultTheme.themePickerColors.dark, "has dark variant");
});

// TODO(Bug 2053217): update the expected themes list once this metadata
// moves into a themes_list.json file.
add_task(async function test_getThemesInfo_showInCompactLayout() {
  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });

  const allThemes = manager.getThemesInfo();
  const compactLayoutThemes = manager.getThemesInfo({
    showInCompactLayout: true,
  });

  const expectedCompactLayoutThemes = [
    "default-theme@mozilla.org",
    "nova-sun@mozilla.org",
    "nova-flare@mozilla.org",
    "nova-lagoon@mozilla.org",
    "nova-pine@mozilla.org",
    "nova-ash@mozilla.org",
  ];

  Assert.equal(
    compactLayoutThemes.length,
    expectedCompactLayoutThemes.length,
    "compact layout returns expected number of themes"
  );

  for (const themeId of expectedCompactLayoutThemes) {
    Assert.ok(
      compactLayoutThemes.some(t => t.id === themeId),
      `compact layout includes ${themeId}`
    );
  }

  const nonCompactLayoutTheme = allThemes.find(
    t => !expectedCompactLayoutThemes.includes(t.id)
  );
  Assert.ok(
    !compactLayoutThemes.some(t => t.id === nonCompactLayoutTheme.id),
    `compact layout excludes theme ${nonCompactLayoutTheme.id}`
  );
});

add_task(async function test_updateThemeState_unknownThemeId_logsError() {
  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  const stopListening = TestUtils.listenForConsoleMessages();
  const result = await manager.updateThemeState(
    "unknown-theme@mozilla.org",
    true
  );
  const consoleMessages = await stopListening();

  Assert.strictEqual(result, false, "returns false for unmanaged theme ID");
  Assert.ok(
    consoleMessages.some(
      msg =>
        msg.wrappedJSObject.level === "error" &&
        msg.wrappedJSObject.arguments?.[0]?.includes(
          "ThemesList.updateThemeState can only update themes managed by it"
        )
    ),
    "console.error fired for unmanaged theme ID"
  );
});

add_task(async function test_updateThemeState_disable() {
  const THEME_ID = "nova-sun@mozilla.org";
  const xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      name: "Nova Sun",
      version: "1.0",
      theme: {},
      browser_specific_settings: { gecko: { id: THEME_ID } },
    },
  });
  await AddonTestUtils.promiseInstallFile(xpi);

  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  let result = await manager.updateThemeState(THEME_ID, false);
  Assert.strictEqual(result, true, "returns true after disable");
  let addon = await AddonManager.getAddonByID(THEME_ID);
  Assert.ok(addon.userDisabled, "Theme ends up userDisabled after disable");
  await addon.uninstall();

  // Disabling a non installed Nova theme should be a no-op and don't raise
  // any error.
  result = await manager.updateThemeState(THEME_ID, false);
  Assert.strictEqual(result, true, "returns true when addon is absent");
});

add_task(async function test_updateThemeState_enable_alreadyInstalledTheme() {
  const THEME_ID = "nova-sun@mozilla.org";
  const xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      name: "Nova Sun",
      version: "1.0",
      theme: {},
      browser_specific_settings: { gecko: { id: THEME_ID } },
    },
  });
  await AddonTestUtils.promiseInstallFile(xpi);

  let addon = await AddonManager.getAddonByID(THEME_ID);
  await addon.disable();

  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  const result = await manager.updateThemeState(THEME_ID, true);
  Assert.strictEqual(
    result,
    true,
    "returns true after enabling existing addon"
  );

  addon = await AddonManager.getAddonByID(THEME_ID);
  Assert.ok(addon.isActive, "Theme is active after enable");
  await addon.uninstall();
});

add_task(
  async function test_updateThemeState_enable_installViaAddonRepository() {
    const THEME_ID = "nova-sun@mozilla.org";
    const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
    const xpi = AddonTestUtils.createTempWebExtensionFile({
      manifest: {
        name: "Nova Sun",
        version: "1.0",
        theme: {},
        browser_specific_settings: { gecko: { id: THEME_ID } },
      },
    });
    server.registerFile("/theme.xpi", xpi);
    AddonTestUtils.registerJSON(server, "/addons.json", {
      page_size: 1,
      page_count: 1,
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          guid: THEME_ID,
          name: "Nova Sun",
          type: "statictheme",
          current_version: {
            version: "1.0",
            files: [{ platform: "all", url: "http://example.com/theme.xpi" }],
          },
        },
      ],
    });

    Services.prefs.setCharPref(
      "extensions.getAddons.get.url",
      "http://example.com/addons.json"
    );

    const manager = await getThemesList({
      installSource: TEST_INSTALL_SOURCE,
    });
    const result = await manager.updateThemeState(THEME_ID, true);
    Assert.strictEqual(
      result,
      true,
      "returns true after install via AddonRepository"
    );

    const addon = await AddonManager.getAddonByID(THEME_ID);
    Assert.ok(
      addon?.isActive,
      "Theme installed and enabled via AddonRepository"
    );
    Assert.strictEqual(
      addon.installTelemetryInfo?.source,
      TEST_INSTALL_SOURCE,
      "installTelemetryInfo.source reflects the installSource passed to getThemesList"
    );
    Assert.strictEqual(
      addon.installTelemetryInfo?.method,
      "FirefoxThemesList",
      "installTelemetryInfo.method is set to FirefoxThemesList"
    );
    await addon.uninstall();
    Services.prefs.clearUserPref("extensions.getAddons.get.url");
  }
);

add_task(async function test_updateThemeState_enable_noSourceUri_logsError() {
  const THEME_ID = "nova-sun@mozilla.org";
  const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });
  AddonTestUtils.registerJSON(server, "/addons.json", {
    page_size: 1,
    page_count: 1,
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        guid: THEME_ID,
        name: "Nova Sun",
        type: "statictheme",
        current_version: {
          version: "1.0",
          files: [],
        },
      },
    ],
  });

  Services.prefs.setCharPref(
    "extensions.getAddons.get.url",
    "http://example.com/addons.json"
  );

  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  const stopListening = TestUtils.listenForConsoleMessages();
  const result = await manager.updateThemeState(THEME_ID, true);
  const consoleMessages = await stopListening();

  Assert.strictEqual(
    result,
    false,
    "returns false when XPI URL cannot be resolved"
  );
  Assert.ok(
    consoleMessages.some(
      msg =>
        msg.wrappedJSObject.level === "error" &&
        msg.wrappedJSObject.arguments?.[0]?.includes(
          "Unable to resolve the XPI url for the theme"
        )
    ),
    "console.error fired with the expected message"
  );

  const addon = await AddonManager.getAddonByID(THEME_ID);
  Assert.equal(addon, null, "No install was attempted");
  Services.prefs.clearUserPref("extensions.getAddons.get.url");
});

// TODO(Bug 2053220): restrict this test task to non-release channels
// along with restricting use of the related about:config pref.
add_task(async function test_updateThemeState_enable_installViaTestingUrl() {
  const THEME_ID = "nova-sun@mozilla.org";
  const server = AddonTestUtils.createHttpServer();
  const port = server.identity.primaryPort;
  const xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      name: "Nova Sun",
      version: "1.0",
      theme: {},
      browser_specific_settings: { gecko: { id: THEME_ID } },
    },
  });
  server.registerFile(`/${THEME_ID}.xpi`, xpi);

  Services.prefs.setCharPref(TESTING_XPI_BASE_URL, `http://localhost:${port}`);

  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  const result = await manager.updateThemeState(THEME_ID, true);
  Assert.strictEqual(
    result,
    true,
    "returns true after install via testing xpiBaseUrl"
  );

  const addon = await AddonManager.getAddonByID(THEME_ID);
  Assert.ok(
    addon?.isActive,
    "Theme installed and enabled via testing xpiBaseUrl"
  );
  await addon.uninstall();
  Services.prefs.clearUserPref(TESTING_XPI_BASE_URL);
});

add_task(async function test_updateThemeState_installListener() {
  const THEME_ID = "nova-sun@mozilla.org";
  const server = AddonTestUtils.createHttpServer();
  const port = server.identity.primaryPort;
  const xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      name: "Nova Sun",
      version: "1.0",
      theme: {},
      browser_specific_settings: { gecko: { id: THEME_ID } },
    },
  });
  server.registerFile(`/${THEME_ID}.xpi`, xpi);

  Services.prefs.setCharPref(TESTING_XPI_BASE_URL, `http://localhost:${port}`);

  const firedEvents = [];
  let installEndedAddon = null;
  const installListener = {
    onDownloadStarted: _install => firedEvents.push("onDownloadStarted"),
    onInstallEnded: (_install, addon) => {
      firedEvents.push("onInstallEnded");
      installEndedAddon = addon;
    },
  };

  const manager = await getThemesList({
    installSource: TEST_INSTALL_SOURCE,
  });
  await manager.updateThemeState(THEME_ID, true, installListener);

  Assert.ok(
    firedEvents.includes("onDownloadStarted"),
    "installListener.onDownloadStarted was called"
  );
  Assert.ok(
    firedEvents.includes("onInstallEnded"),
    "installListener.onInstallEnded was called"
  );
  Assert.equal(
    installEndedAddon?.id,
    THEME_ID,
    "onInstallEnded received the installed addon"
  );

  const addon = await AddonManager.getAddonByID(THEME_ID);
  await addon.uninstall();
  Services.prefs.clearUserPref(TESTING_XPI_BASE_URL);
});
