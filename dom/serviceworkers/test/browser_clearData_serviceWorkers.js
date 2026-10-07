"use strict";

/* import-globals-from browser_head.js */
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/dom/serviceworkers/test/browser_head.js",
  this
);

// This test verifies that nsIClearDataService removes service worker
// registrations, and their Cache API quota storage, for the targeted site while
// leaving an unrelated origin's service worker intact.
//
// Existing coverage this does not repeat: browser_pbm_cleanup.js covers
// clearPrivateBrowsingData(); browser_serviceworkers.js and test_quota.js under
// toolkit/components/cleardata/tests cover the principal-, site- and
// host-scoped entry points of the quota cleaner; and
// browser/base/content/test/sanitize/browser_sanitize-offlineData.js covers
// time-range clearing of a service worker through Sanitizer.sanitize(),
// including sparing an origin moved out of the window.
//
// What those leave out, and this covers: deleteDataInTimeRange() with
// CLEAR_DOM_QUOTA, which nothing else calls directly, and the origin's Cache
// API usage asserted in bytes rather than by the registration alone
// (test_quota.js seeds localStorage and IndexedDB, browser_quota.js simpleDB,
// and neither involves a service worker).

const ORIGIN_A = "http://mochi.test:8888";
const ORIGIN_B = "https://example.org";
const SW_SCRIPT = "empty.js";

const SAS = Cc["@mozilla.org/storage/activity-service;1"].getService(
  Ci.nsIStorageActivityService
);

// nsIStorageActivityService works in microseconds (PRTime).
const ONE_HOUR_US = 3600 * 1000 * 1000;

let scopeCounter = 0;
function nextScope() {
  return `empty.html?clearData_${scopeCounter++}`;
}

function deleteDataFromPrincipal(principal, flags) {
  return new Promise(resolve => {
    Services.clearData.deleteDataFromPrincipal(
      principal,
      false,
      flags,
      resolve
    );
  });
}

function deleteDataInTimeRange(from, to, flags) {
  return new Promise(resolve => {
    Services.clearData.deleteDataInTimeRange(from, to, false, flags, resolve);
  });
}

function findActivePrincipal(origin, from, to) {
  let principals = SAS.getActiveOrigins(from, to);
  for (let i = 0; i < principals.length; i++) {
    let principal = principals.queryElementAt(i, Ci.nsIPrincipal);
    if (principal.origin === origin) {
      return principal;
    }
  }
  return null;
}

add_setup(async function () {
  // testing.enabled allows SW registration on the mochitest server's http
  // origins.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.serviceWorkers.enabled", true],
      ["dom.serviceWorkers.testing.enabled", true],
      ["dom.serviceWorkers.exemptFromPerDomainMax", true],
    ],
  });

  // The tasks below leave service workers and quota storage on the test
  // origins, and the time-range task drives the storage-activity table. Clear
  // both at the end of the file, after every task and on every exit path, so
  // nothing reaches the next file in the manifest. Clearing data records fresh
  // activity, so the reset has to come second.
  registerCleanupFunction(async () => {
    await new Promise(resolve => {
      Services.clearData.deleteData(Ci.nsIClearDataService.CLEAR_ALL, resolve);
    });
    SAS.testOnlyReset();
  });
});

add_task(async function test_clear_by_principal_isolates_other_origin() {
  let scopeA = nextScope();
  let scopeB = nextScope();

  let regA = await install_sw({
    origin: ORIGIN_A,
    script: SW_SCRIPT,
    scope: scopeA,
  });
  ok(regA, "Service worker registered on origin A");
  let regB = await install_sw({
    origin: ORIGIN_B,
    script: SW_SCRIPT,
    scope: scopeB,
  });
  ok(regB, "Service worker registered on origin B");

  let flags = await deleteDataFromPrincipal(
    regA.principal,
    Ci.nsIClearDataService.CLEAR_DOM_QUOTA
  );
  Assert.equal(flags, 0, "deleteDataFromPrincipal completed without failure");

  Assert.equal(
    countRegistrationsForOrigin(ORIGIN_A),
    0,
    "Origin A service worker removed by principal clearing"
  );
  Assert.greaterOrEqual(
    countRegistrationsForOrigin(ORIGIN_B),
    1,
    "Origin B service worker preserved"
  );

  await deleteDataFromPrincipal(
    regB.principal,
    Ci.nsIClearDataService.CLEAR_DOM_QUOTA
  );
});

add_task(async function test_clear_by_site_removes_sw() {
  let scope = nextScope();
  let reg = await install_sw({
    origin: ORIGIN_A,
    script: SW_SCRIPT,
    scope,
  });
  ok(reg, "Service worker registered on origin A");

  await clear_qm_origin_group_via_clearData(ORIGIN_A);

  Assert.equal(
    countRegistrationsForOrigin(ORIGIN_A),
    0,
    "Origin A service worker removed by site clearing"
  );
});

add_task(async function test_clear_also_purges_cache_storage() {
  let scope = nextScope();
  let reg = await install_sw({
    origin: ORIGIN_A,
    script: SW_SCRIPT,
    scope,
  });
  ok(reg, "Service worker registered on origin A");

  // Read before clearing: reg.activeWorker is gone once the registration is.
  const scriptCache = reg.activeWorker.cacheName;
  Assert.ok(
    (await get_sw_script_cache_names(ORIGIN_A)).includes(scriptCache),
    "Origin A has a service worker script cache before clearing"
  );

  await consume_storage(ORIGIN_A, { cacheBytes: 1024 * 1024, idbBytes: 0 });
  let usageBefore = await get_qm_origin_usage(ORIGIN_A);
  Assert.ok(
    !is_minimum_origin_usage(usageBefore),
    `Origin A has Cache API storage before clearing (${usageBefore} bytes)`
  );

  let flags = await deleteDataFromPrincipal(
    reg.principal,
    Ci.nsIClearDataService.CLEAR_DOM_QUOTA
  );
  Assert.equal(flags, 0, "deleteDataFromPrincipal completed without failure");

  Assert.equal(
    countRegistrationsForOrigin(ORIGIN_A),
    0,
    "Origin A service worker removed"
  );
  let usageAfter = await get_qm_origin_usage(ORIGIN_A);
  Assert.ok(
    is_minimum_origin_usage(usageAfter),
    `Origin A Cache API storage cleared (${usageAfter} bytes)`
  );
  Assert.ok(
    !(await get_sw_script_cache_names(ORIGIN_A)).includes(scriptCache),
    "Origin A service worker script cache removed by clearing"
  );
});

add_task(async function test_clear_by_time_range_scopes_to_window() {
  // Only the origins registered below may fall inside the clearing window.
  SAS.testOnlyReset();

  let resetTime = Date.now() * 1000;
  Assert.equal(
    SAS.getActiveOrigins(resetTime - ONE_HOUR_US, resetTime + ONE_HOUR_US)
      .length,
    0,
    "Storage activity state is empty after the reset"
  );

  let scopeA = nextScope();
  let scopeB = nextScope();

  let regA = await install_sw({
    origin: ORIGIN_A,
    script: SW_SCRIPT,
    scope: scopeA,
  });
  ok(regA, "Service worker registered on origin A");
  let regB = await install_sw({
    origin: ORIGIN_B,
    script: SW_SCRIPT,
    scope: scopeB,
  });
  ok(regB, "Service worker registered on origin B");

  // Activity is stamped with PR_Now() after this millisecond-truncated reading,
  // so the upper bound sits in the future rather than racing it.
  let now = Date.now() * 1000;
  let windowStart = now - ONE_HOUR_US;
  let windowEnd = now + ONE_HOUR_US;

  await TestUtils.waitForCondition(
    () => findActivePrincipal(ORIGIN_A, windowStart, windowEnd),
    "Origin A is active within the clearing window"
  );
  let activeB = await TestUtils.waitForCondition(
    () => findActivePrincipal(ORIGIN_B, windowStart, windowEnd),
    "Origin B is active before we move it out of the window"
  );

  // Move origin B out of the window and check it really left: MoveOriginInTime
  // stores the timestamp in seconds into a table of microseconds, so the entry
  // may end up evicted rather than moved.
  SAS.moveOriginInTime(activeB, now - 5 * ONE_HOUR_US);
  Assert.ok(
    !findActivePrincipal(ORIGIN_B, windowStart, windowEnd),
    "Origin B is no longer active within the clearing window"
  );

  let flags = await deleteDataInTimeRange(
    windowStart,
    windowEnd,
    Ci.nsIClearDataService.CLEAR_DOM_QUOTA
  );
  Assert.equal(flags, 0, "deleteDataInTimeRange completed without failure");

  Assert.equal(
    countRegistrationsForOrigin(ORIGIN_A),
    0,
    "Origin A service worker (active in window) removed by time-range clearing"
  );
  Assert.greaterOrEqual(
    countRegistrationsForOrigin(ORIGIN_B),
    1,
    "Origin B service worker (outside window) preserved by time-range clearing"
  );
});
