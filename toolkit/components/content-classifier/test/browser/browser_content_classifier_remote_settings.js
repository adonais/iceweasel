"use strict";

const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);

const COLLECTION_NAME = "content-classifier-lists";

// content: string-encoded filter list content (may include CRLF etc.).
async function makeListRecordFromContent(id, name, content) {
  let encoder = new TextEncoder();
  let bytes = encoder.encode(content);
  let blob = new Blob([bytes]);
  let buffer = await blob.arrayBuffer();
  let hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  let hashArray = Array.from(new Uint8Array(hashBuffer));
  let hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return {
    record: {
      id,
      Name: name,
      last_modified: Date.now(),
      attachment: {
        hash,
        size: bytes.length,
        filename: name + ".txt",
        location: "main-workspace/content-classifier-lists/" + id + ".txt",
        mimetype: "text/plain",
      },
    },
    blob,
  };
}

async function makeListRecord(id, name, rules) {
  return makeListRecordFromContent(id, name, rules.join("\n") + "\n");
}

// Populate the RS database with one or more lists. Each entry is
// { id, name, rules } or { id, name, content } (raw string content).
// Returns an array of records.
async function populateMultipleRS(db, lists) {
  let records = [];
  let attachments = [];
  for (let entry of lists) {
    let { id, name } = entry;
    let made = entry.content
      ? await makeListRecordFromContent(id, name, entry.content)
      : await makeListRecord(id, name, entry.rules);
    records.push(made.record);
    attachments.push({
      id: made.record.id,
      record: made.record,
      blob: made.blob,
    });
  }
  await db.importChanges({}, Date.now(), records, { clear: true });
  for (let { id, record, blob } of attachments) {
    await db.saveAttachment(id, { record, blob });
  }
  return records;
}

async function populateRS(db, id, name, rules) {
  let [record] = await populateMultipleRS(db, [{ id, name, rules }]);
  return record;
}

// Load a third-party image and return whether it loaded successfully.
async function loadThirdPartyImage(browser, domain) {
  let imageURL =
    domain +
    "browser/toolkit/components/antitracking/test/browser/raptor.jpg?" +
    Math.random();
  return SpecialPowers.spawn(browser, [imageURL], async url => {
    let img = new content.Image();
    img.src = url;
    return new content.Promise(resolve => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
  });
}

// Emit a sync event with the given records as "created" and wait for
// the test-content-classifier-filter-lists-loaded notification.
async function syncAndWaitForLists(client, records) {
  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await client.emit("sync", {
    data: { created: records, updated: [], deleted: [] },
  });
  await listsLoaded;
}

// Get the RS client and register cleanup to clear its DB and disable
// the feature after the current test task finishes (pass OR fail,
// including throws). In browser-chrome tests, registerCleanupFunction
// runs after the current task and before the next — see browser-test.js.
// Disabling the feature here ensures a thrown task cannot leave the
// C++ service with live engines / an initialized RS client that the
// next task would pick up.
function getRSClient() {
  let client = RemoteSettings(COLLECTION_NAME);
  registerCleanupFunction(async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["privacy.trackingprotection.content.protection.enabled", false],
        ["privacy.trackingprotection.content.annotation.enabled", false],
        ["privacy.trackingprotection.content.protection.list_names", ""],
        ["privacy.trackingprotection.content.annotation.list_names", ""],
      ],
    });
    await client.db.clear();
  });
  return client;
}

// Open a foreground tab on TEST_TOP_PAGE and register cleanup to remove
// it no matter how the test exits. Returns the tab.
async function openTestTab() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_TOP_PAGE
  );
  registerCleanupFunction(() => {
    if (tab && tab.parentNode) {
      BrowserTestUtils.removeTab(tab);
    }
  });
  return tab;
}

// --- Tests ---

// Verify that when the feature is disabled, the RS client is never
// initialized: get() is never called, no data fetched, no blocking.
add_task(async function test_rs_not_initialized_when_disabled() {
  let client = getRSClient();
  let db = client.db;

  await populateRS(db, "disabled-1", "should-not-load", ["||example.org^"]);

  // Spy on client.get() to verify it is never called. Restore on
  // cleanup regardless of pass/fail.
  let getCalled = false;
  let origGet = client.get;
  client.get = async (...args) => {
    getCalled = true;
    return origGet.call(client, ...args);
  };
  registerCleanupFunction(() => {
    client.get = origGet;
  });

  // Feature is disabled (both enabled prefs false), but list_names is set.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", false],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "should-not-load",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  // Open a tab to trigger GetInstance() / channel classification.
  let tab = await openTestTab();
  let browser = tab.linkedBrowser;

  // example.org should NOT be blocked since no engines were created.
  let loaded = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(loaded, "example.org should load when feature is disabled");

  // Proving a side effect *didn't* happen requires a bounded wait.
  // 2s is load-bearing: it needs to be long enough to cover a slow
  // async RS init on loaded CI hardware. If this test ever goes
  // intermittent, bump the wait rather than shorten it.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));

  ok(!getCalled, "RemoteSettings.get() should not be called when disabled");
});

// Basic blocking: a single RS list selected for blocking should cancel
// matching third-party requests and produce a content blocking log entry.
add_task(async function test_rs_blocking() {
  let client = getRSClient();
  let db = client.db;

  let record = await populateRS(db, "test-block-1", "test-block", [
    "||example.org^",
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "test-block",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [record]);

  let loaded = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loaded, "Third-party image from example.org should be blocked via RS");

  let log = JSON.parse(await browser.getContentBlockingLog());
  let origin = TEST_BLOCKED_3RD_PARTY_DOMAIN.replace(/\/$/, "");
  ok(log[origin], "Content blocking log has entry for " + origin);
  if (log[origin]) {
    is(
      log[origin][0][0],
      Ci.nsIWebProgressListener.STATE_BLOCKED_TRACKING_CONTENT,
      "Entry has the STATE_BLOCKED_TRACKING_CONTENT flag"
    );
  }
});

// Basic annotation: a single RS list selected for annotation should allow
// matching requests to load but annotate them in the content blocking log.
add_task(async function test_rs_annotation() {
  let client = getRSClient();
  let db = client.db;

  let record = await populateRS(db, "test-annotate-1", "test-annotate", [
    "||example.com^",
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", false],
      ["privacy.trackingprotection.content.protection.list_names", ""],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", true],
      [
        "privacy.trackingprotection.content.annotation.list_names",
        "test-annotate",
      ],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [record]);

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loaded = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(loaded, "Third-party image from example.com should NOT be blocked");

  let log = JSON.parse(await browser.getContentBlockingLog());
  let origin = TEST_ANNOTATED_3RD_PARTY_DOMAIN.replace(/\/$/, "");
  ok(log[origin], "Content blocking log has annotation entry for " + origin);
  if (log[origin]) {
    is(
      log[origin][0][0],
      Ci.nsIWebProgressListener.STATE_LOADED_LEVEL_2_TRACKING_CONTENT,
      "Entry has the STATE_LOADED_LEVEL_2_TRACKING_CONTENT flag"
    );
  }
});

// List selection: two lists are stored in RS, but only one is selected via
// list_names. The selected list should block; the non-selected list's rules
// should have no effect.
add_task(async function test_rs_nonselected_list_not_active() {
  let client = getRSClient();
  let db = client.db;

  let records = await populateMultipleRS(db, [
    { id: "active-1", name: "active-list", rules: ["||example.org^"] },
    { id: "inactive-1", name: "inactive-list", rules: ["||example.com^"] },
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "active-list",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, records);

  let blockedLoaded = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!blockedLoaded, "example.org should be blocked (active list)");

  let allowedLoaded = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(allowedLoaded, "example.com should NOT be blocked (inactive list)");
});

// Multiple active lists: comma-separated names in the list_names pref should
// all produce active engines that block their respective domains.
add_task(async function test_rs_multiple_active_lists() {
  let client = getRSClient();
  let db = client.db;

  let records = await populateMultipleRS(db, [
    { id: "multi-1", name: "list-a", rules: ["||example.org^"] },
    { id: "multi-2", name: "list-b", rules: ["||example.com^"] },
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "list-a,list-b",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, records);

  let loadedOrg = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedOrg, "example.org should be blocked (list-a active)");

  let loadedCom = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(!loadedCom, "example.com should be blocked (list-b active)");
});

// Block vs annotate separation: one list is assigned to blocking, another to
// annotation. The block list should cancel requests, the annotate list should
// allow them through but tag them in the content blocking log. Neither list
// should cross over into the other mode.
add_task(async function test_rs_block_and_annotate_separation() {
  let client = getRSClient();
  let db = client.db;

  let records = await populateMultipleRS(db, [
    { id: "sep-block-1", name: "block-list", rules: ["||example.org^"] },
    {
      id: "sep-annotate-1",
      name: "annotate-list",
      rules: ["||example.com^"],
    },
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "block-list",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", true],
      [
        "privacy.trackingprotection.content.annotation.list_names",
        "annotate-list",
      ],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, records);

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loadedOrg = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedOrg, "example.org should be blocked (on block list)");

  let loadedCom = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(loadedCom, "example.com should NOT be blocked (on annotate list only)");

  let log = JSON.parse(await browser.getContentBlockingLog());
  let comOrigin = TEST_ANNOTATED_3RD_PARTY_DOMAIN.replace(/\/$/, "");
  ok(log[comOrigin], "Content blocking log has annotation for example.com");
  if (log[comOrigin]) {
    is(
      log[comOrigin][0][0],
      Ci.nsIWebProgressListener.STATE_LOADED_LEVEL_2_TRACKING_CONTENT,
      "example.com is annotated, not blocked"
    );
  }
});

// Pref-driven list switching: two lists are stored in RS. Changing the
// list_names pref at runtime should rebuild engines from already-stored data
// without re-downloading, switching which domain is blocked.
add_task(async function test_rs_pref_switch_active_lists() {
  let client = getRSClient();
  let db = client.db;

  let records = await populateMultipleRS(db, [
    { id: "switch-1", name: "list-x", rules: ["||example.org^"] },
    { id: "switch-2", name: "list-y", rules: ["||example.com^"] },
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      ["privacy.trackingprotection.content.protection.list_names", "list-x"],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, records);

  let loadedOrg = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedOrg, "example.org blocked with list-x active");

  let loadedCom = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(loadedCom, "example.com not blocked with only list-x active");

  // Switch to list-y via pref change. This triggers
  // RebuildEnginesFromStoredData which fires the notification.
  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.protection.list_names", "list-y"],
    ],
  });
  await listsLoaded;

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loadedOrgAfter = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(loadedOrgAfter, "example.org no longer blocked after switching to list-y");

  let loadedComAfter = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(!loadedComAfter, "example.com now blocked after switching to list-y");
});

// Sync deletion: removing a list via a RemoteSettings sync event should
// remove it from stored data so it no longer blocks matching requests.
add_task(async function test_rs_sync_deletion() {
  let client = getRSClient();
  let db = client.db;

  let record = await populateRS(db, "del-1", "del-list", ["||example.org^"]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      ["privacy.trackingprotection.content.protection.list_names", "del-list"],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [record]);

  let loadedBefore = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedBefore, "example.org blocked before deletion");

  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await client.emit("sync", {
    data: { created: [], updated: [], deleted: [record] },
  });
  await listsLoaded;

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loadedAfter = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(loadedAfter, "example.org no longer blocked after sync deletion");
});

// Sync update: updating a list's attachment via a RemoteSettings sync event
// should replace the old rules with the new ones, changing which domains
// are blocked.
add_task(async function test_rs_sync_update() {
  let client = getRSClient();
  let db = client.db;

  let origRecord = await populateRS(db, "upd-1", "upd-list", [
    "||example.org^",
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      ["privacy.trackingprotection.content.protection.list_names", "upd-list"],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [origRecord]);

  // Before update: example.org should be blocked, example.com should not.
  let loadedOrgBefore = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedOrgBefore, "example.org should be blocked before update");

  let loadedComBefore = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(loadedComBefore, "example.com should not be blocked before update");

  // Update the list to block example.com instead.
  let newRecord = await populateRS(db, "upd-1", "upd-list", ["||example.com^"]);

  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await client.emit("sync", {
    data: {
      created: [],
      updated: [{ old: origRecord, new: newRecord }],
      deleted: [],
    },
  });
  await listsLoaded;

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loadedOrg = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(loadedOrg, "example.org no longer blocked after update");

  let loadedCom = await loadThirdPartyImage(
    browser,
    TEST_ANNOTATED_3RD_PARTY_DOMAIN
  );
  ok(!loadedCom, "example.com now blocked after update");
});

// CRLF line endings: an attachment that uses Windows-style line endings
// should still produce a working filter list with no blank / malformed
// rules (which would otherwise fail to parse or match).
add_task(async function test_rs_crlf_line_endings() {
  let client = getRSClient();
  let db = client.db;

  // Record content deliberately uses \r\n and includes blank lines.
  let [record] = await populateMultipleRS(db, [
    {
      id: "crlf-1",
      name: "crlf-list",
      content: "||example.org^\r\n\r\n||ignored-blank^\r\n",
    },
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      ["privacy.trackingprotection.content.protection.list_names", "crlf-list"],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [record]);

  let loaded = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loaded, "example.org should be blocked from CRLF-formatted list");
});

// Enable/disable/re-enable: the feature-enabled prefs should drive RS
// client lifecycle. After disable, matching requests must not be blocked.
// After re-enable with list_names set, classification must resume.
add_task(async function test_rs_enable_disable_reenable() {
  let client = getRSClient();
  let db = client.db;

  let record = await populateRS(db, "toggle-1", "toggle-list", [
    "||example.org^",
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "toggle-list",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [record]);

  let loadedOn = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedOn, "example.org blocked while feature enabled");

  // Disable the feature. This should tear down the RS client and
  // clear engines.
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.trackingprotection.content.protection.enabled", false]],
  });

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loadedOff = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(loadedOff, "example.org NOT blocked after disabling feature");

  // Re-enable. RS client should be re-created and re-import data.
  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.trackingprotection.content.protection.enabled", true]],
  });
  await listsLoaded;

  BrowserTestUtils.startLoadingURIString(browser, TEST_TOP_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  let loadedReenabled = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(!loadedReenabled, "example.org blocked again after re-enabling");
});

// Empty collection: an RS collection with no records must not crash and
// must not block anything, but should still fire the lists-loaded
// notification so callers aren't left waiting forever.
add_task(async function test_rs_empty_collection() {
  let client = getRSClient();
  let db = client.db;

  // Explicitly import an empty record set.
  await db.importChanges({}, Date.now(), [], { clear: true });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.list_names",
        "nothing-here",
      ],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.list_names", ""],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;

  let loaded = await loadThirdPartyImage(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN
  );
  ok(loaded, "example.org should load when collection is empty");
});
