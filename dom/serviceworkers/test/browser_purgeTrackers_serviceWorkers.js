"use strict";

/* import-globals-from browser_head.js */
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/dom/serviceworkers/test/browser_head.js",
  this
);

// This test verifies that the cookie-purging path (PurgeTrackerService, used by
// redirect/tracker cookie purging) removes the service worker registration and
// Cache API storage of a classified tracker that has no storage-access
// permission, while leaving a non-tracker origin's service worker intact. The
// antitracking xpcshell purge tests (test_purge_trackers.js) cover cookies,
// localStorage and IndexedDB but not service workers.

const { UrlClassifierTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlClassifierTestUtils.sys.mjs"
);

XPCOMUtils.defineLazyServiceGetter(
  this,
  "PurgeTrackerService",
  "@mozilla.org/purge-tracker-service;1",
  Ci.nsIPurgeTrackerService
);

const TRACKER_ORIGIN = "https://tracking.example.org";
const TRACKER_BASE_DOMAIN = "example.org";
const BENIGN_ORIGIN = "https://example.com";
const SW_SCRIPT = "empty.js";

// With no cookies on the tracker, the purge reaches it only through the
// storage-activity branch, gated on _firstIteration, and isTracker() caches
// negatives forever; both live on a singleton shared across this whole run.
function resetPurgeTrackerServiceState() {
  let service = Cc["@mozilla.org/purge-tracker-service;1"].getService(
    Ci.nsIPurgeTrackerService
  ).wrappedJSObject;
  service._trackingState.clear();
  service._firstIteration = true;
}

function storageAccessPermissionsFor(baseDomain) {
  return Services.perms
    .getAllWithTypePrefix("storageAccessAPI")
    .filter(perm => perm.principal.baseDomain === baseDomain);
}

add_setup(async function () {
  // Registered first so it runs on every exit path, including a setup that
  // throws partway through.
  registerCleanupFunction(async function () {
    UrlClassifierTestUtils.cleanupTestTrackers();
    // purgeTrackingCookieJars() sets these as user prefs, which the automatic
    // pushPrefEnv pop cannot undo.
    Services.prefs.clearUserPref(
      "privacy.purge_trackers.date_in_cookie_database"
    );
    Services.prefs.clearUserPref("privacy.purge_trackers.last_purge");
    // The service is a singleton shared with the rest of the run, so the state
    // this file leaves on it has to go back too.
    resetPurgeTrackerServiceState();
    await new Promise(resolve => {
      Services.clearData.deleteData(Ci.nsIClearDataService.CLEAR_ALL, resolve);
    });
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.serviceWorkers.enabled", true],
      ["dom.serviceWorkers.testing.enabled", true],
      ["dom.serviceWorkers.exemptFromPerDomainMax", true],
      ["privacy.purge_trackers.enabled", true],
      [
        "network.cookie.cookieBehavior",
        Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER,
      ],
    ],
  });

  await UrlClassifierTestUtils.addTestTrackers();

  resetPurgeTrackerServiceState();

  // A storage-access permission anywhere under the tracker's base domain counts
  // as interaction and makes the service skip it.
  for (let perm of storageAccessPermissionsFor(TRACKER_BASE_DOMAIN)) {
    Services.perms.removePermission(perm);
  }
  Assert.equal(
    storageAccessPermissionsFor(TRACKER_BASE_DOMAIN).length,
    0,
    "Tracker base domain has no storage-access permission"
  );
});

add_task(async function test_purge_removes_tracker_service_worker() {
  let trackerReg = await install_sw({
    origin: TRACKER_ORIGIN,
    script: SW_SCRIPT,
    scope: "empty.html?purge_tracker",
  });
  ok(trackerReg, "Service worker registered on the tracker origin");

  // Read before purging: trackerReg.activeWorker is gone once the registration
  // is.
  const trackerScriptCache = trackerReg.activeWorker.cacheName;
  Assert.ok(
    (await get_sw_script_cache_names(TRACKER_ORIGIN)).includes(
      trackerScriptCache
    ),
    "Tracker origin has a service worker script cache before purging"
  );

  let benignReg = await install_sw({
    origin: BENIGN_ORIGIN,
    script: SW_SCRIPT,
    scope: "empty.html?purge_benign",
  });
  ok(benignReg, "Service worker registered on the benign origin");

  await consume_storage(TRACKER_ORIGIN, {
    cacheBytes: 1024 * 1024,
    idbBytes: 0,
  });
  await consume_storage(BENIGN_ORIGIN, {
    cacheBytes: 1024 * 1024,
    idbBytes: 0,
  });

  Assert.ok(
    !is_minimum_origin_usage(await get_qm_origin_usage(TRACKER_ORIGIN)),
    "Tracker origin has storage before purging"
  );

  await PurgeTrackerService.purgeTrackingCookieJars();

  Assert.equal(
    countRegistrationsForOrigin(TRACKER_ORIGIN),
    0,
    "Tracker service worker removed by purging"
  );
  Assert.ok(
    is_minimum_origin_usage(await get_qm_origin_usage(TRACKER_ORIGIN)),
    "Tracker origin Cache API storage cleared by purging"
  );
  Assert.ok(
    !(await get_sw_script_cache_names(TRACKER_ORIGIN)).includes(
      trackerScriptCache
    ),
    "Tracker service worker script cache removed by purging"
  );

  Assert.greaterOrEqual(
    countRegistrationsForOrigin(BENIGN_ORIGIN),
    1,
    "Non-tracker service worker preserved after purging"
  );
  Assert.ok(
    !is_minimum_origin_usage(await get_qm_origin_usage(BENIGN_ORIGIN)),
    "Non-tracker Cache API storage preserved after purging"
  );

  await clear_qm_origin_group_via_clearData(BENIGN_ORIGIN);
});
