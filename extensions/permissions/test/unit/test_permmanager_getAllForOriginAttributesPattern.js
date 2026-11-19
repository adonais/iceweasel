/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TYPE_A = "test/getAllForOriginAttributesPattern_a";
const TYPE_B = "test/getAllForOriginAttributesPattern_b";

const PREF_ISOLATE_PB = "permissions.isolateBy.privateBrowsing";
const PREF_ISOLATE_UC = "permissions.isolateBy.userContext";

function principal(origin, originAttributes = {}) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(origin),
    originAttributes
  );
}

function getPermissions(pattern, types = []) {
  return Services.perms
    .getAllForOriginAttributesPattern(JSON.stringify(pattern), types)
    .map(perm => `${perm.principal.origin} ${perm.type}`)
    .sort();
}

add_setup(function () {
  registerCleanupFunction(() => {
    Services.perms.removeAll();
    Services.prefs.clearUserPref(PREF_ISOLATE_PB);
    Services.prefs.clearUserPref(PREF_ISOLATE_UC);
  });
});

add_task(function test_isolation_prefs() {
  for (let isolatePB of [false, true]) {
    for (let isolateUC of [false, true]) {
      info(`isolateBy.privateBrowsing=${isolatePB} userContext=${isolateUC}`);
      Services.prefs.setBoolPref(PREF_ISOLATE_PB, isolatePB);
      Services.prefs.setBoolPref(PREF_ISOLATE_UC, isolateUC);
      Services.perms.removeAll();

      // Permissions for OriginAttributes that are not isolated are stored under
      // the default OriginAttributes, so they collapse into one entry.
      for (let originAttributes of [
        {},
        { privateBrowsingId: 1 },
        { userContextId: 5 },
      ]) {
        Services.perms.addFromPrincipal(
          principal("https://example.com", originAttributes),
          TYPE_A,
          Services.perms.ALLOW_ACTION
        );
      }
      Services.perms.addFromPrincipal(
        principal("https://example.org"),
        TYPE_B,
        Services.perms.ALLOW_ACTION
      );

      const regular = `https://example.com ${TYPE_A}`;
      const privateBrowsing = `https://example.com^privateBrowsingId=1 ${TYPE_A}`;
      const userContext = `https://example.com^userContextId=5 ${TYPE_A}`;
      const other = `https://example.org ${TYPE_B}`;
      const all = [
        regular,
        isolatePB && privateBrowsing,
        isolateUC && userContext,
        other,
      ]
        .filter(Boolean)
        .sort();

      Assert.deepEqual(
        getPermissions({}),
        all,
        "Empty pattern matches all permissions."
      );
      Assert.deepEqual(
        getPermissions({ privateBrowsingId: 1 }),
        isolatePB ? [privateBrowsing] : all,
        "privateBrowsingId is only matched if permissions are isolated by it."
      );
      Assert.deepEqual(
        getPermissions({ userContextId: 5 }),
        isolateUC ? [userContext] : all,
        "userContextId is only matched if permissions are isolated by it."
      );
      Assert.deepEqual(
        getPermissions({ userContextId: 0, privateBrowsingId: 0 }),
        [regular, other].sort(),
        "Default OriginAttributes match the default context."
      );
      Assert.deepEqual(
        getPermissions({}, [TYPE_B]),
        [other],
        "Types filter is applied."
      );
    }
  }
});

add_task(function test_invalid_pattern() {
  Assert.throws(
    () => Services.perms.getAllForOriginAttributesPattern("{", []),
    /NS_ERROR_ILLEGAL_VALUE/,
    "Invalid pattern throws."
  );
});
