/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

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

add_setup(async function setup() {
  await AddonTestUtils.promiseStartupManager();
});

add_task(async function test_runtime_blocked_hosts() {
  const { setEnterpriseGuards } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionPermissions.sys.mjs"
  );
  const globalId = "guarded-global@test";
  const perExtId = "guarded-per-ext@test";

  let extGlobal = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: globalId } },
      host_permissions: ["<all_urls>"],
    },
    useAddonManager: "temporary",
  });
  let extPerExt = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: perExtId } },
      host_permissions: ["<all_urls>"],
    },
    useAddonManager: "temporary",
  });
  await extGlobal.startup();
  await extPerExt.startup();

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          runtime_blocked_hosts: ["*://*.blocked.example"],
          runtime_allowed_hosts: ["*://allowed.blocked.example"],
        },
        [perExtId]: {
          runtime_blocked_hosts: ["*://*.per-ext.example"],
        },
      },
    },
  });

  let globalPolicy = WebExtensionPolicy.getByID(globalId);
  let perExtPolicy = WebExtensionPolicy.getByID(perExtId);

  equal(globalPolicy.guardSets.length, 1, "global guard applied to extGlobal");
  equal(
    perExtPolicy.guardSets.length,
    1,
    "per-extension guard applied to extPerExt"
  );

  ok(
    !globalPolicy.canAccessURI(
      Services.io.newURI("https://sub.blocked.example/")
    ),
    "global runtime_blocked_hosts denies matching URL"
  );
  ok(
    globalPolicy.canAccessURI(
      Services.io.newURI("https://allowed.blocked.example/")
    ),
    "runtime_allowed_hosts carves out exception"
  );
  ok(
    globalPolicy.canAccessURI(Services.io.newURI("https://other.example/")),
    "global runtime_blocked_hosts does not affect unrelated URL"
  );

  ok(
    !perExtPolicy.canAccessURI(
      Services.io.newURI("https://sub.per-ext.example/")
    ),
    "per-extension runtime_blocked_hosts denies matching URL"
  );
  ok(
    perExtPolicy.canAccessURI(
      Services.io.newURI("https://sub.blocked.example/")
    ),
    "per-extension entry overrides global (global block does not apply)"
  );

  await extGlobal.unload();
  await extPerExt.unload();
  setEnterpriseGuards({});
});

add_task(async function test_runtime_blocked_hosts_all_urls() {
  const { setEnterpriseGuards } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionPermissions.sys.mjs"
  );
  const id = "guarded-all-urls@test";
  let ext = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id } },
      host_permissions: ["<all_urls>"],
    },
    useAddonManager: "temporary",
  });
  await ext.startup();

  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          runtime_blocked_hosts: ["<all_urls>"],
          runtime_allowed_hosts: ["*://carveout.example"],
        },
      },
    },
  });

  let policy = WebExtensionPolicy.getByID(id);
  equal(policy.guardSets.length, 1, "guard applied for <all_urls> deny");
  ok(
    !policy.canAccessURI(Services.io.newURI("https://blocked.example/")),
    "<all_urls> denies arbitrary URL"
  );
  ok(
    policy.canAccessURI(Services.io.newURI("https://carveout.example/")),
    "runtime_allowed_hosts carves out exception from <all_urls>"
  );

  await ext.unload();
  setEnterpriseGuards({});
});

add_task(async function test_runtime_blocked_hosts_invalid_pattern() {
  const { setEnterpriseGuards } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionPermissions.sys.mjs"
  );
  const id = "guarded-invalid@test";
  let ext = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id } },
      host_permissions: ["<all_urls>"],
    },
    useAddonManager: "temporary",
  });
  await ext.startup();

  let stopConsoleListener = TestUtils.listenForConsoleMessages();
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          runtime_blocked_hosts: ["*://*.example.com/*"],
        },
      },
    },
  });
  let messages = await stopConsoleListener();

  let policy = WebExtensionPolicy.getByID(id);
  equal(
    policy.guardSets.length,
    0,
    "guards not applied when policy contains pattern with path"
  );

  ok(
    messages.some(
      m =>
        m.level == "error" &&
        m.arguments[0].includes("Host pattern must not include a path")
    ),
    "Got expected error message for invalid host pattern"
  );

  await ext.unload();
  setEnterpriseGuards({});
});

add_task(async function test_runtime_blocked_hosts_malformed_pattern() {
  const { setEnterpriseGuards } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionPermissions.sys.mjs"
  );
  const id = "guarded-malformed@test";
  let ext = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id } },
      host_permissions: ["<all_urls>"],
    },
    useAddonManager: "temporary",
  });
  await ext.startup();

  let stopConsoleListener = TestUtils.listenForConsoleMessages();
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          // Passes the no-path regex but the scheme is not permitted,
          // so MatchPatternSet rejects it.
          runtime_blocked_hosts: ["bogus://example.com"],
        },
      },
    },
  });
  let messages = await stopConsoleListener();

  let policy = WebExtensionPolicy.getByID(id);
  equal(
    policy.guardSets.length,
    0,
    "guards not applied when policy contains malformed pattern"
  );

  ok(
    messages.some(
      m =>
        m.level == "error" &&
        m.arguments[0].includes(
          "Invalid runtime_blocked_hosts/runtime_allowed_hosts"
        )
    ),
    "Got expected error message for malformed pattern"
  );

  await ext.unload();
  setEnterpriseGuards({});
});
