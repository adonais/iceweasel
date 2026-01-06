/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPPExceptionsManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPExceptionsManager.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const MODE_PREF = "browser.ipProtection.exceptionsMode";
const ALL_MODE = "all";
const SELECT_MODE = "select";
const ONBOARDING_MESSAGE_MASK_PREF =
  "browser.ipProtection.onboardingMessageMask";

const PERM_NAME = "ipp-vpn";

/**
 * Tests the manager can modify exclusions in ipp-vpn permission.
 */
add_task(async function test_IPPExceptionsManager_exclusions() {
  const site1 = "https://www.example.com";
  const site2 = "https://www.another.example.com";

  Services.prefs.setStringPref(MODE_PREF, ALL_MODE);

  IPPExceptionsManager.init();

  // Make mock principals and add two exclusions
  let contentPrincipal1 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site1);
  let contentPrincpal2 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site2);

  // Add two exclusions
  IPPExceptionsManager.addException(contentPrincipal1);
  IPPExceptionsManager.addException(contentPrincpal2);

  // Verify the permission data
  let permissionObj1 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal1);
  let permissionObj2 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincpal2);

  Assert.equal(
    permissionObj1?.capability,
    Ci.nsIPermissionManager.DENY_ACTION,
    `Permission object for ${site1} exists and has capability DENY`
  );
  Assert.equal(
    permissionObj2?.capability,
    Ci.nsIPermissionManager.DENY_ACTION,
    `Permission object for ${site2} exists and has capability DENY`
  );

  // Now remove the exceptions
  IPPExceptionsManager.removeException(contentPrincipal1);
  IPPExceptionsManager.removeException(contentPrincpal2);

  // Verify the permission data no longer exists
  permissionObj1 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal1);
  permissionObj2 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincpal2);

  Assert.ok(!permissionObj1, `Permission object for ${site1} no longer exists`);
  Assert.ok(!permissionObj2, `Permission object for ${site2} no longer exists`);

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
  IPPExceptionsManager.uninit();
});

/**
 * Tests the manager can modify inclusions in ipp-vpn permission.
 */
add_task(async function test_IPPExceptionsManager_inclusions() {
  const site1 = "https://www.example.com";
  const site2 = "https://www.another.example.com";

  Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);

  IPPExceptionsManager.init();

  // Make mock principals and add two inclusions
  let contentPrincipal1 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site1);
  let contentPrincpal2 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site2);

  // Add two inclusions
  IPPExceptionsManager.addException(contentPrincipal1);
  IPPExceptionsManager.addException(contentPrincpal2);

  // Verify the permission data
  let permissionObj1 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal1);
  let permissionObj2 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincpal2);

  Assert.equal(
    permissionObj1?.capability,
    Ci.nsIPermissionManager.ALLOW_ACTION,
    `Permission object for ${site1} exists and has capability ALLOW`
  );
  Assert.equal(
    permissionObj2?.capability,
    Ci.nsIPermissionManager.ALLOW_ACTION,
    `Permission object for ${site2} exists and has capability ALLOW`
  );

  // Now remove the exceptions
  IPPExceptionsManager.removeException(contentPrincipal1);
  IPPExceptionsManager.removeException(contentPrincpal2);

  // Verify the permission data no longer exists
  permissionObj1 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal1);
  permissionObj2 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincpal2);

  Assert.ok(!permissionObj1, `Permission object for ${site1} no longer exists`);
  Assert.ok(!permissionObj2, `Permission object for ${site2} no longer exists`);

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
  IPPExceptionsManager.uninit();
});

/**
 * Tests the manager correctly tracks exclusions and inclusions after
 * changing mode.
 */
add_task(async function test_IPPExceptionsManager_switch_mode() {
  const site1 = "https://www.example.com";
  const site2 = "https://www.another.example.com";

  // Start with "all" mode first
  Services.prefs.setStringPref(MODE_PREF, ALL_MODE);

  IPPExceptionsManager.init();

  // Add an exclusion
  let contentPrincipal1 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site1);
  IPPExceptionsManager.addException(contentPrincipal1);

  // Switch mode to "select"
  let prefChanged = TestUtils.waitForPrefChange(MODE_PREF);
  Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);
  await prefChanged;

  // Now add an inclusion
  let contentPrincipal2 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site2);
  IPPExceptionsManager.addException(contentPrincipal2);

  // Ensure exception types were preserved and that we have the right number of exceptions
  let savedSites = Services.perms.getAllByTypes([PERM_NAME]);
  Assert.equal(
    savedSites.length,
    2,
    `There should be only 2 site exceptions in ${PERM_NAME}`
  );

  let exclusions = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(perm => perm.capability == Ci.nsIPermissionManager.DENY_ACTION);
  let inclusions = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(perm => perm.capability == Ci.nsIPermissionManager.ALLOW_ACTION);
  Assert.equal(
    exclusions.length,
    1,
    `There should be 1 exclusion in ${PERM_NAME}`
  );
  Assert.equal(
    inclusions.length,
    1,
    `There should be 1 inclusion in ${PERM_NAME}`
  );

  // Now let's try adding the same principal for the excluded site as an INCLUSION instead
  IPPExceptionsManager.addException(contentPrincipal1);

  savedSites = Services.perms.getAllByTypes([PERM_NAME]);
  Assert.equal(
    savedSites.length,
    2,
    `There should still be 2 site exceptions in ${PERM_NAME}`
  );

  exclusions = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(perm => perm.capability == Ci.nsIPermissionManager.DENY_ACTION);
  inclusions = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(perm => perm.capability == Ci.nsIPermissionManager.ALLOW_ACTION);
  Assert.equal(
    exclusions.length,
    0,
    `There should be 0 exclusions now in ${PERM_NAME}`
  );
  Assert.equal(
    inclusions.length,
    2,
    `There should be 2 inclusions now in ${PERM_NAME}`
  );

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
  IPPExceptionsManager.uninit();
});
