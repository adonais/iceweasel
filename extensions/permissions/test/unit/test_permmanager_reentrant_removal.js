/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

// Observers of permission removals may re-enter the permission manager and
// reallocate or free the storage the removal was operating on. These tests
// ensure the removal paths don't touch that storage after notifying.

const PERM_TYPE = "test-reentrant-perm";
const PERM_TYPE_B = "test-reentrant-perm-b";
const BROWSER_ID = 91001;
const FILLER_COUNT = 200;

function makePrincipal(uri) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(uri),
    {}
  );
}

const PRINCIPAL = makePrincipal("https://example.com");

function fillerPrincipal(i) {
  return makePrincipal(`https://filler${i}.example.org`);
}

// Runs `callback`, once, from within the "deleted" notification for `PERM_TYPE`.
function reenterOnDeletion(topic, callback) {
  let reentry = { fired: false };
  reentry.promise = new Promise(resolve => {
    let observer = {
      observe(subject, aTopic, data) {
        if (data != "deleted") {
          return;
        }
        let perm = subject.QueryInterface(Ci.nsIPermission);
        if (
          perm.type != PERM_TYPE ||
          (topic == "browser-perm-changed" && perm.browserId != BROWSER_ID)
        ) {
          return;
        }
        Services.obs.removeObserver(observer, topic);
        callback();
        reentry.fired = true;
        resolve();
      },
    };
    Services.obs.addObserver(observer, topic);
  });
  return reentry;
}

function addFillerBrowserPermissions() {
  let pm = Services.perms;
  for (let i = 1; i <= FILLER_COUNT; i++) {
    pm.addFromPrincipalForBrowser(
      PRINCIPAL,
      PERM_TYPE,
      pm.ALLOW_ACTION,
      BROWSER_ID + i,
      0
    );
  }
}

function assertAndClearFillerBrowserPermissions() {
  let pm = Services.perms;
  let present = 0;
  for (let i = 1; i <= FILLER_COUNT; i++) {
    if (
      pm.testForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID + i) == pm.ALLOW_ACTION
    ) {
      present++;
    }
    pm.removeAllForBrowser(BROWSER_ID + i);
  }
  Assert.equal(
    present,
    FILLER_COUNT,
    "Permissions added by the observer should be present"
  );
}

add_task(async function test_remove_reentrant_table_growth() {
  let pm = Services.perms;
  pm.addFromPrincipal(PRINCIPAL, PERM_TYPE, pm.ALLOW_ACTION);

  let reentry = reenterOnDeletion("perm-changed", () => {
    for (let i = 0; i < FILLER_COUNT; i++) {
      pm.addFromPrincipal(fillerPrincipal(i), PERM_TYPE_B, pm.ALLOW_ACTION);
    }
  });

  pm.removeFromPrincipal(PRINCIPAL, PERM_TYPE);
  Assert.ok(reentry.fired, "Observer should have run during the removal");

  Assert.equal(
    pm.testPermissionFromPrincipal(PRINCIPAL, PERM_TYPE),
    pm.UNKNOWN_ACTION,
    "Removed permission should be gone"
  );
  Assert.equal(
    pm.getAllByTypes([PERM_TYPE_B]).length,
    FILLER_COUNT,
    "Permissions added by the observer should be present"
  );

  pm.removeAll();
});

add_task(async function test_remove_reentrant_remove_all() {
  let pm = Services.perms;
  pm.addFromPrincipal(PRINCIPAL, PERM_TYPE, pm.ALLOW_ACTION);
  pm.addFromPrincipal(PRINCIPAL, PERM_TYPE_B, pm.ALLOW_ACTION);

  let reentry = reenterOnDeletion("perm-changed", () => pm.removeAll());

  pm.removeFromPrincipal(PRINCIPAL, PERM_TYPE);
  Assert.ok(reentry.fired, "Observer should have run during the removal");

  Assert.equal(
    pm.testPermissionFromPrincipal(PRINCIPAL, PERM_TYPE),
    pm.UNKNOWN_ACTION,
    "Removed permission should be gone"
  );
  Assert.equal(
    pm.testPermissionFromPrincipal(PRINCIPAL, PERM_TYPE_B),
    pm.UNKNOWN_ACTION,
    "Permission cleared by the observer should be gone"
  );
});

add_task(async function test_remove_browser_reentrant_table_growth() {
  let pm = Services.perms;
  pm.addFromPrincipalForBrowser(
    PRINCIPAL,
    PERM_TYPE,
    pm.ALLOW_ACTION,
    BROWSER_ID,
    0
  );

  let reentry = reenterOnDeletion(
    "browser-perm-changed",
    addFillerBrowserPermissions
  );

  pm.removeFromPrincipalForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID);
  Assert.ok(reentry.fired, "Observer should have run during the removal");

  Assert.equal(
    pm.testForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID),
    pm.UNKNOWN_ACTION,
    "Removed permission should be gone"
  );
  assertAndClearFillerBrowserPermissions();
});

add_task(async function test_remove_browser_reentrant_clear() {
  let pm = Services.perms;
  pm.addFromPrincipalForBrowser(
    PRINCIPAL,
    PERM_TYPE,
    pm.ALLOW_ACTION,
    BROWSER_ID,
    0
  );
  pm.addFromPrincipalForBrowser(
    PRINCIPAL,
    PERM_TYPE_B,
    pm.ALLOW_ACTION,
    BROWSER_ID,
    0
  );

  let reentry = reenterOnDeletion("browser-perm-changed", () =>
    pm.removeAllForBrowser(BROWSER_ID)
  );

  pm.removeFromPrincipalForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID);
  Assert.ok(reentry.fired, "Observer should have run during the removal");

  Assert.equal(
    pm.testForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID),
    pm.UNKNOWN_ACTION,
    "Removed permission should be gone"
  );
  Assert.equal(
    pm.testForBrowser(PRINCIPAL, PERM_TYPE_B, BROWSER_ID),
    pm.UNKNOWN_ACTION,
    "Permission cleared by the observer should be gone"
  );
});

add_task(async function test_browser_expiry_reentrant_table_growth() {
  let pm = Services.perms;

  let reentry = reenterOnDeletion(
    "browser-perm-changed",
    addFillerBrowserPermissions
  );

  pm.addFromPrincipalForBrowser(
    PRINCIPAL,
    PERM_TYPE,
    pm.ALLOW_ACTION,
    BROWSER_ID,
    100
  );
  await reentry.promise;

  Assert.equal(
    pm.testForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID),
    pm.UNKNOWN_ACTION,
    "Expired permission should be gone"
  );
  assertAndClearFillerBrowserPermissions();
});

add_task(async function test_browser_expiry_reentrant_clear() {
  let pm = Services.perms;

  let reentry = reenterOnDeletion("browser-perm-changed", () =>
    pm.removeAllForBrowser(BROWSER_ID)
  );

  pm.addFromPrincipalForBrowser(
    PRINCIPAL,
    PERM_TYPE_B,
    pm.ALLOW_ACTION,
    BROWSER_ID,
    0
  );
  pm.addFromPrincipalForBrowser(
    PRINCIPAL,
    PERM_TYPE,
    pm.ALLOW_ACTION,
    BROWSER_ID,
    100
  );
  await reentry.promise;

  Assert.equal(
    pm.testForBrowser(PRINCIPAL, PERM_TYPE, BROWSER_ID),
    pm.UNKNOWN_ACTION,
    "Expired permission should be gone"
  );
  Assert.equal(
    pm.testForBrowser(PRINCIPAL, PERM_TYPE_B, BROWSER_ID),
    pm.UNKNOWN_ACTION,
    "Permission cleared by the observer should be gone"
  );
});
