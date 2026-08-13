/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Bug 1767271: when the data version moves to 176, existing cookie ALLOW
 * permissions (used as clear-on-shutdown exceptions before this version)
 * should be duplicated as persist-data-on-shutdown ALLOW permissions so
 * users keep their shutdown protection after the permission split. Cookie
 * DENY and SESSION permissions are not duplicated.
 */

"use strict";

const ALLOW_ORIGIN = "https://www.mozilla.org";
const DENY_ORIGIN = "https://www.google.com";
const SESSION_ORIGIN = "https://www.example.org";

function principalFromOrigin(origin) {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    origin
  );
}

function addCookiePerm(origin, capability) {
  Services.perms.addFromPrincipal(
    principalFromOrigin(origin),
    "cookie",
    capability
  );
}

function getPersistPerm(origin) {
  return Services.perms.testPermissionFromPrincipal(
    principalFromOrigin(origin),
    "persist-data-on-shutdown"
  );
}

add_task(async function test_duplicateCookieAllowToPersistDataOnShutdown() {
  const { ProfileDataUpgrader } = ChromeUtils.importESModule(
    "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
  );

  registerCleanupFunction(() => {
    Services.perms.removeAll();
  });

  addCookiePerm(ALLOW_ORIGIN, Ci.nsICookiePermission.ACCESS_ALLOW);
  addCookiePerm(DENY_ORIGIN, Ci.nsICookiePermission.ACCESS_DENY);
  addCookiePerm(SESSION_ORIGIN, Ci.nsICookiePermission.ACCESS_SESSION);

  Assert.equal(
    Services.perms.getAllByTypes(["cookie"]).length,
    3,
    "Three cookie permissions are set up"
  );
  Assert.equal(
    Services.perms.getAllByTypes(["persist-data-on-shutdown"]).length,
    0,
    "No persist-data-on-shutdown permissions yet"
  );

  ProfileDataUpgrader.upgrade(175, 176);

  Assert.equal(
    Services.perms.getAllByTypes(["cookie"]).length,
    3,
    "All original cookie permissions are still present"
  );

  Assert.equal(
    getPersistPerm(ALLOW_ORIGIN),
    Ci.nsICookiePermission.ACCESS_ALLOW,
    "ALLOW cookie origin gets a persist-data-on-shutdown ALLOW exception"
  );
  Assert.equal(
    getPersistPerm(DENY_ORIGIN),
    Services.perms.UNKNOWN_ACTION,
    "DENY cookie origin is not duplicated"
  );
  Assert.equal(
    getPersistPerm(SESSION_ORIGIN),
    Services.perms.UNKNOWN_ACTION,
    "SESSION cookie origin is not duplicated"
  );

  Assert.equal(
    Services.perms.getAllByTypes(["persist-data-on-shutdown"]).length,
    1,
    "Exactly one persist-data-on-shutdown permission was added"
  );
});

add_task(async function test_policySetCookieAllowIsNotMigrated() {
  // Bug 2051572: policy-set cookie ALLOW permissions are re-applied from the
  // enterprise policy on every startup. They must not be duplicated as regular
  // persist-data-on-shutdown permissions during the migration.
  const { ProfileDataUpgrader } = ChromeUtils.importESModule(
    "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
  );

  Services.perms.removeAll();

  const POLICY_ORIGIN = "https://policy.example.com";
  Services.perms.addFromPrincipal(
    principalFromOrigin(POLICY_ORIGIN),
    "cookie",
    Ci.nsICookiePermission.ACCESS_ALLOW,
    Services.perms.EXPIRE_POLICY
  );

  Assert.equal(
    Services.perms.getAllByTypes(["cookie"]).length,
    1,
    "One policy-set cookie permission is set up"
  );

  ProfileDataUpgrader.upgrade(175, 176);

  Assert.equal(
    getPersistPerm(POLICY_ORIGIN),
    Services.perms.UNKNOWN_ACTION,
    "Policy-set cookie ALLOW origin is not duplicated"
  );
  Assert.equal(
    Services.perms.getAllByTypes(["persist-data-on-shutdown"]).length,
    0,
    "No persist-data-on-shutdown permissions were added for policy-set perms"
  );

  Services.perms.removeAll();
});

add_task(async function test_runningTwiceIsIdempotent() {
  const { ProfileDataUpgrader } = ChromeUtils.importESModule(
    "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
  );

  Services.perms.removeAll();
  addCookiePerm(ALLOW_ORIGIN, Ci.nsICookiePermission.ACCESS_ALLOW);

  ProfileDataUpgrader.upgrade(175, 176);
  ProfileDataUpgrader.upgrade(175, 176);

  Assert.equal(
    Services.perms.getAllByTypes(["persist-data-on-shutdown"]).length,
    1,
    "Re-running the migration does not add duplicates"
  );

  Services.perms.removeAll();
});
