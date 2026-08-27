/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MessagingSystemAllowlists } = ChromeUtils.importESModule(
  "resource://messaging-system/lib/MessagingSystemAllowlists.sys.mjs"
);

// Minimal stand-in for a RemoteSettings client that lets the test control the
// records returned by get() and fire sync events.
function makeFakeClient(records) {
  let syncListener = null;
  return {
    on(name, cb) {
      if (name === "sync") {
        syncListener = cb;
      }
    },
    off(name, cb) {
      if (name === "sync" && syncListener === cb) {
        syncListener = null;
      }
    },
    async get() {
      return records;
    },
    fireSync(current) {
      syncListener?.({ data: { current } });
    },
  };
}

function useClient(client) {
  MessagingSystemAllowlists._resetForTest();
  const original = MessagingSystemAllowlists.RemoteSettings;
  MessagingSystemAllowlists.RemoteSettings = () => client;
  registerCleanupFunction(() => {
    MessagingSystemAllowlists.RemoteSettings = original;
    MessagingSystemAllowlists._resetForTest();
  });
}

add_task(async function test_loads_records() {
  useClient(
    makeFakeClient([
      { id: "a", list: "actionOnly", value: "FOO_ACTION" },
      { id: "b", list: "actionOnly", value: "BAR_ACTION" },
      { id: "c", list: "setPref", value: "foo.pref" },
      { id: "d", list: "unknown", value: "ignored" },
      { id: "e", list: "actionOnly", value: 123 },
      { id: "f", list: "setPref", value: 123 },
    ])
  );

  await MessagingSystemAllowlists.ensureInit();

  Assert.deepEqual(
    MessagingSystemAllowlists.getActionOnlyActions().sort(),
    ["BAR_ACTION", "FOO_ACTION"],
    "actionOnly records are collected while unknown list and non-string values are ignored"
  );
  Assert.deepEqual(
    MessagingSystemAllowlists.getAllowedPrefs(),
    ["foo.pref"],
    "setPref records are collected while non-string values are ignored"
  );
});

add_task(async function test_empty_collection_results_in_empty_lists() {
  useClient(makeFakeClient([]));

  await MessagingSystemAllowlists.ensureInit();

  Assert.deepEqual(MessagingSystemAllowlists.getActionOnlyActions(), []);
  Assert.deepEqual(MessagingSystemAllowlists.getAllowedPrefs(), []);
});

add_task(async function test_get_error_results_in_empty_lists() {
  useClient({
    on() {},
    off() {},
    async get() {
      throw new Error("boom");
    },
  });

  await MessagingSystemAllowlists.ensureInit();

  Assert.deepEqual(MessagingSystemAllowlists.getActionOnlyActions(), []);
  Assert.deepEqual(MessagingSystemAllowlists.getAllowedPrefs(), []);
});

add_task(async function test_sync_updates_cache() {
  const client = makeFakeClient([]);
  useClient(client);

  await MessagingSystemAllowlists.ensureInit();
  Assert.deepEqual(MessagingSystemAllowlists.getActionOnlyActions(), []);
  Assert.deepEqual(MessagingSystemAllowlists.getAllowedPrefs(), []);

  client.fireSync([
    { id: "a", list: "actionOnly", value: "FOO_ACTION" },
    { id: "b", list: "setPref", value: "foo.pref" },
  ]);

  Assert.deepEqual(MessagingSystemAllowlists.getActionOnlyActions(), [
    "FOO_ACTION",
  ]);
  Assert.deepEqual(MessagingSystemAllowlists.getAllowedPrefs(), ["foo.pref"]);
});

add_task(async function test_blocklisted_records_are_discarded() {
  useClient(
    makeFakeClient([
      { id: "a", list: "actionOnly", value: "INSTALL_ADDON_FROM_URL" },
      { id: "b", list: "actionOnly", value: "SHOW_SPOTLIGHT" },
      // Grantable by design, unlike the two above.
      { id: "c", list: "actionOnly", value: "SET_PREF" },
      { id: "d", list: "actionOnly", value: "FOO_ACTION" },
      // Blocked by an exact entry, and by each pref prefix respectively.
      { id: "e", list: "setPref", value: "pdfjs.enableScripting" },
      { id: "f", list: "setPref", value: "network.proxy.type" },
      { id: "g", list: "setPref", value: "xpinstall.signatures.required" },
      { id: "h", list: "setPref", value: "services.settings.server" },
      { id: "i", list: "setPref", value: "foo.pref" },
    ])
  );

  await MessagingSystemAllowlists.ensureInit();

  Assert.deepEqual(
    MessagingSystemAllowlists.getActionOnlyActions(),
    ["SET_PREF", "FOO_ACTION"],
    "blocklisted actions are dropped and everything else is kept"
  );
  Assert.deepEqual(
    MessagingSystemAllowlists.getAllowedPrefs(),
    ["foo.pref"],
    "blocklisted prefs are dropped and everything else is kept"
  );
});

add_task(async function test_blocklist_applies_to_sync() {
  const client = makeFakeClient([]);
  useClient(client);
  await MessagingSystemAllowlists.ensureInit();

  client.fireSync([
    { id: "a", list: "actionOnly", value: "OPEN_URL" },
    { id: "b", list: "setPref", value: "security.enterprise_roots.enabled" },
  ]);

  Assert.deepEqual(
    MessagingSystemAllowlists.getActionOnlyActions(),
    [],
    "a later sync cannot introduce a blocklisted action"
  );
  Assert.deepEqual(
    MessagingSystemAllowlists.getAllowedPrefs(),
    [],
    "a later sync cannot introduce a blocklisted pref"
  );
});

add_task(async function test_blocklist_applies_to_set_for_test() {
  MessagingSystemAllowlists._resetForTest();
  registerCleanupFunction(() => MessagingSystemAllowlists._resetForTest());

  MessagingSystemAllowlists._setForTest({
    actionOnly: ["SUMMARIZE_PAGE", "FOO_ACTION"],
    setPref: ["app.update.disabledForTesting", "foo.pref"],
  });

  Assert.deepEqual(MessagingSystemAllowlists.getActionOnlyActions(), [
    "FOO_ACTION",
  ]);
  Assert.deepEqual(MessagingSystemAllowlists.getAllowedPrefs(), ["foo.pref"]);
});

add_task(async function test_ensure_init_is_idempotent() {
  MessagingSystemAllowlists._resetForTest();
  let createCount = 0;
  const client = makeFakeClient([]);
  const original = MessagingSystemAllowlists.RemoteSettings;
  MessagingSystemAllowlists.RemoteSettings = () => {
    createCount++;
    return client;
  };
  registerCleanupFunction(() => {
    MessagingSystemAllowlists.RemoteSettings = original;
    MessagingSystemAllowlists._resetForTest();
  });

  await MessagingSystemAllowlists.ensureInit();
  await MessagingSystemAllowlists.ensureInit();
  Assert.equal(createCount, 1, "the client is created only once");
});
