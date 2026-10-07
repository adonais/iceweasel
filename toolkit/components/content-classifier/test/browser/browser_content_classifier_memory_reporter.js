/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// ContentClassifierService reports each live engine's heap to about:memory
// under explicit/content-classifier/engines/<feature>/.

const ENGINES_PREFIX = "explicit/content-classifier/engines/";

// Reports under ENGINES_PREFIX as about:memory would see them, through the
// manager. The empty process name is the parent, which is the only place
// ContentClassifierService exists (it is MAIN_PROCESS_ONLY in components.conf).
//
// The manager also asks every child process, which sends one IPC message per
// report, and there are thousands. Under MOZ_CHAOSMODE every one of those
// events pays a scheduling delay and a single collection takes seconds, so
// only the registration check uses this path.
async function collectEngineReportsFromManager() {
  let manager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(
    Ci.nsIMemoryReporterManager
  );

  // getReports() returns without ever calling finishReporting if another
  // request is still in flight (nsIMemoryReporter.idl), which would hang the
  // test. Each poll that finds no result yet asks again; the first request to
  // finish wins, and aborted ones never call back.
  let finished = null;
  return TestUtils.waitForCondition(
    () => {
      if (!finished) {
        let reports = [];
        manager.getReports(
          (process, path, kind, units, amount) => {
            if (process === "" && path.startsWith(ENGINES_PREFIX)) {
              reports.push({ path, kind, units, amount });
            }
          },
          null,
          () => {
            finished ??= reports;
          },
          null,
          /* anonymize */ false
        );
      }
      return finished;
    },
    "getReports completed",
    100,
    300 // 30 seconds, inside the harness timeout.
  );
}

// Reports under ENGINES_PREFIX straight from the service, which is the
// reporter. Synchronous and parent-only, so it costs nothing under chaos mode.
function collectEngineReports() {
  let reporter = Cc["@mozilla.org/content-classifier-service;1"].getService(
    Ci.nsIMemoryReporter
  );
  let reports = [];
  reporter.collectReports(
    (process, path, kind, units, amount) => {
      if (path.startsWith(ENGINES_PREFIX)) {
        reports.push({ path, kind, units, amount });
      }
    },
    null,
    /* anonymize */ false
  );
  return reports;
}

function engineLeafAmount(reports, feature, leaf) {
  let report = reports.find(
    r => r.path === `${ENGINES_PREFIX}${feature}/${leaf}`
  );
  return report ? report.amount : null;
}

// The one task that goes through the manager: it proves the service is
// registered as a reporter and that about:memory gets the kind and units it
// expects.
add_task(async function test_live_engine_is_reported() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.org^"],
    },
  ]);

  await pushEnginePrefs({ protection: "trackers" });
  await syncAndWaitForLists(client, records);

  let reports = await collectEngineReportsFromManager();
  let objects = reports.find(
    r => r.path === `${ENGINES_PREFIX}trackers/objects`
  );

  Assert.ok(objects, `reported a leaf at ${ENGINES_PREFIX}trackers/objects`);

  info(`${objects.path} reported ${objects.amount} bytes`);
  Assert.greater(objects.amount, 0, "the engine objects have a non-zero size");
  Assert.equal(
    objects.kind,
    Ci.nsIMemoryReporter.KIND_HEAP,
    "reported as KIND_HEAP"
  );
  Assert.equal(
    objects.units,
    Ci.nsIMemoryReporter.UNITS_BYTES,
    "reported in UNITS_BYTES"
  );
});

// The reported path is keyed on the feature, so two active features must not
// collapse into one node.
add_task(async function test_each_feature_reports_under_its_own_path() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.org^"],
    },
    {
      id: "cryptominers",
      name: "disconnect-cryptominer-base",
      rules: ["||example.com^"],
    },
  ]);

  await pushEnginePrefs({ protection: "trackers,cryptominers" });
  await syncAndWaitForLists(client, records);

  let paths = collectEngineReports().map(r => r.path);

  Assert.ok(
    paths.includes(`${ENGINES_PREFIX}trackers/objects`),
    "trackers reported under its own path"
  );
  Assert.ok(
    paths.includes(`${ENGINES_PREFIX}cryptominers/objects`),
    "cryptominers reported under its own path"
  );
});

// The parsed rules dominate an engine's memory, so the reported amounts have to
// grow with the size of the list the engine was built from. The rules carry a
// $domain= option so that the domain-hash index is populated too; without one
// that index is legitimately empty.
add_task(async function test_reported_sizes_track_list_size() {
  let client = getRSClient();

  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.org^$domain=site.example"],
    },
  ]);
  await pushEnginePrefs({ protection: "trackers" });
  await syncAndWaitForLists(client, records);

  let smallRules = engineLeafAmount(
    collectEngineReports(),
    "trackers",
    "filter-rules"
  );
  Assert.notStrictEqual(smallRules, null, "reported a filter-rules leaf");
  Assert.greater(smallRules, 0, "a one-rule list has a non-zero flatbuffer");

  let manyRules = [];
  for (let i = 0; i < 5000; i++) {
    manyRules.push(`||tracker${i}.example^$domain=site${i}.example`);
  }
  records = await populateMultipleRS(client.db, [
    { id: "trackers", name: "disconnect-tracker-base", rules: manyRules },
  ]);
  await syncAndWaitForLists(client, records);

  let reports = collectEngineReports();
  let largeRules = engineLeafAmount(reports, "trackers", "filter-rules");
  let largeHashes = engineLeafAmount(reports, "trackers", "domain-hashes");
  info(`5000 rules: filter-rules=${largeRules}, domain-hashes=${largeHashes}`);

  Assert.greater(
    largeRules,
    smallRules * 10,
    "5000 rules report far more flatbuffer than one rule"
  );
  Assert.greater(
    largeHashes,
    0,
    "the domain-hash index is attributed once $domain= rules populate it"
  );
});

// The regex table is populated lazily, only once a request has actually been
// checked against a filter that needs a regex. A complete-regex rule (the
// /.../ syntax) forces the matcher through the regex manager.
add_task(async function test_regex_table_is_reported_once_populated() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["/raptor.*\\.jpg/"],
    },
  ]);
  await pushEnginePrefs({ protection: "trackers" });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, records);

  // Drive a request through the engine so a regex is compiled.
  await assertImageBlocked(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN,
    "complete-regex rule blocks the image"
  );

  let table = engineLeafAmount(
    collectEngineReports(),
    "trackers",
    "regex-table"
  );
  info(`regex-table=${table} bytes`);

  Assert.notStrictEqual(table, null, "reported a regex-table leaf");
  Assert.greater(table, 0, "the regex table is attributed once populated");
});

// Every field of ContentClassifierEngineSizes must reach about:memory. A field
// added to the struct but never reported would otherwise vanish silently.
add_task(async function test_every_engine_leaf_is_reported() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.org^$domain=site.example"],
    },
  ]);
  await pushEnginePrefs({ protection: "trackers" });
  await syncAndWaitForLists(client, records);

  let reports = collectEngineReports();
  let paths = reports.map(r => r.path);
  for (let leaf of [
    "objects",
    "filter-rules",
    "domain-hashes",
    "regex-table",
    "enabled-tags",
    "cosmetic-cache",
    "resources",
  ]) {
    Assert.ok(
      paths.includes(`${ENGINES_PREFIX}trackers/${leaf}`),
      `reported a leaf at trackers/${leaf}`
    );
  }

  // Unlike the cosmetic cache, the boxed resource backend is a real
  // allocation even when it holds nothing.
  Assert.greater(
    engineLeafAmount(reports, "trackers", "resources"),
    0,
    "the boxed resource backend is attributed"
  );
});
