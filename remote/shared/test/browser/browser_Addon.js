/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Addon: "chrome://remote/content/shared/Addon.sys.mjs",
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  AddonManagerPrivate: "resource://gre/modules/AddonManager.sys.mjs",
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
});

add_task(async function test_getAddons() {
  const addonPath = getSupportFilePath("webextensions/amosigned.xpi");
  const addonId = await lazy.Addon.installWithPath(addonPath, true, false);
  const addon = await lazy.AddonManager.getAddonByID(addonId);
  try {
    const addons = await lazy.Addon.getAddons("extension", {
      includeHidden: false,
    });
    const info = addons.find(candidate => candidate.id === addonId);
    ok(info, "The installed extension is listed");
    const policy = WebExtensionPolicy.getByID(addonId);
    ok(policy, "The installed extension has an active policy");
    Assert.deepEqual(info, {
      id: addonId,
      name: "XPI Test",
      version: "2.2",
      manifestVersion: 2,
      isActive: true,
      isSystem: false,
      hidden: false,
      temporarilyInstalled: true,
      sourceURL: addon.sourceURI.spec,
      policy: {
        uuid: policy.mozExtensionHostname,
        baseURL: policy.baseURL,
        extensionURL: policy.getURL(""),
        backgroundScripts: [],
      },
    });

    await addon.disable();
    const disabledAddons = await lazy.Addon.getAddons("extension", {
      includeHidden: false,
    });
    const disabledInfo = disabledAddons.find(
      candidate => candidate.id === addonId
    );
    Assert.deepEqual(disabledInfo, {
      ...info,
      isActive: false,
      policy: null,
    });
  } finally {
    await addon.uninstall();
  }
});

add_task(async function test_getAddons_filters() {
  const addons = [
    { id: "visible@remote.test", type: "extension", hidden: false },
    { id: "hidden@remote.test", type: "extension", hidden: true },
    { id: "theme@remote.test", type: "theme", hidden: false },
  ];
  const provider = {
    async getAddonsByTypes(types) {
      return addons.filter(addon => !types || types.includes(addon.type));
    },
  };
  lazy.AddonManagerPrivate.registerProvider(provider);
  try {
    for (const { type, options, expected } of [
      {
        expected: ["visible@remote.test", "theme@remote.test"],
      },
      {
        type: "extension",
        expected: ["visible@remote.test"],
      },
      {
        type: "extension",
        options: { includeHidden: true },
        expected: ["visible@remote.test", "hidden@remote.test"],
      },
      {
        type: "extension",
        options: { includeHidden: false },
        expected: ["visible@remote.test"],
      },
      {
        type: null,
        options: { includeHidden: false },
        expected: ["visible@remote.test", "theme@remote.test"],
      },
      { type: "theme", expected: ["theme@remote.test"] },
      { type: "unknown", expected: [] },
    ]) {
      const result = await lazy.Addon.getAddons(type, options);
      const ids = result
        .filter(info => addons.some(addon => addon.id === info.id))
        .map(info => info.id);
      Assert.deepEqual(
        ids,
        expected,
        `Expected addons for type=${type}, options=${JSON.stringify(options)}`
      );
    }
  } finally {
    lazy.AddonManagerPrivate.unregisterProvider(provider);
  }
});

add_task(async function test_installWithPath() {
  const addonPath = getSupportFilePath("webextensions/amosigned.xpi");
  const addonId = await lazy.Addon.installWithPath(addonPath, true, false);
  try {
    is(addonId, "amosigned-xpi@tests.mozilla.org");
  } finally {
    const addon = await lazy.AddonManager.getAddonByID(addonId);
    await addon.uninstall();
  }
});

add_task(async function test_installWithPath_failure() {
  await Assert.rejects(
    lazy.Addon.installWithPath("", true, false),
    /UnknownError: Expected absolute path/,
    "Expected error was returned"
  );
});

add_task(async function test_installWithBase64() {
  const addonPath = getSupportFilePath("webextensions/amosigned.xpi");
  const addonBase64 = await readFileAsBase64(addonPath);
  const addonId = await lazy.Addon.installWithBase64(addonBase64, true, false);
  try {
    is(addonId, "amosigned-xpi@tests.mozilla.org");
  } finally {
    const addon = await lazy.AddonManager.getAddonByID(addonId);
    await addon.uninstall();
  }
});

add_task(async function test_installWithBase64_failure() {
  await Assert.rejects(
    lazy.Addon.installWithBase64("", true, false),
    /InvalidWebExtensionError: Could not install Add-on: Component returned failure code/,
    "Expected error was returned"
  );
});

add_task(async function test_uninstall() {
  const addonPath = getSupportFilePath("webextensions/amosigned.xpi");
  const file = new lazy.FileUtils.File(addonPath);
  await lazy.AddonManager.installTemporaryAddon(file);
  is(await lazy.Addon.uninstall("amosigned-xpi@tests.mozilla.org"), undefined);
});

add_task(async function test_uninstall_failure() {
  await Assert.rejects(
    lazy.Addon.uninstall("test"),
    /NoSuchWebExtensionError: Add-on with ID "test" is not installed/,
    "Expected error was returned"
  );
});
