/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const EXCLUSION_CHANGED_EVENT = "IPPExceptionsManager:ExclusionChanged";
const ONBOARDING_MESSAGE_MASK_PREF =
  "browser.ipProtection.onboardingMessageMask";
const PERM_NAME = "ipp-vpn";
const INCLUSION_PREF = "browser.ipProtection.inclusion.match_patterns";
const MODE_PREF = "browser.ipProtection.mode";
const MODE_INCLUSION = 3;
const GUARDIAN_PREF = "browser.ipProtection.guardian.endpoint";

const makePrincipal = url =>
  Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(url),
    {}
  );

/**
 * Tests the manager can modify exclusions in ipp-vpn permission.
 */
add_task(async function test_IPPExceptionsManager_exclusions() {
  Services.perms.removeByType(PERM_NAME);

  const site1 = "https://www.example.com";
  const site2 = "https://www.another.example.com";

  IPPExceptionsManager.init();

  // Make mock principals and add two exclusions
  let contentPrincipal1 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site1);
  let contentPrincipal2 =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site2);

  // Add two exclusions
  IPPExceptionsManager.addExclusion(contentPrincipal1);
  IPPExceptionsManager.addExclusion(contentPrincipal2);

  // Verify that hasExclusion can detect the newly added sites
  let site1Exists = IPPExceptionsManager.hasExclusion(contentPrincipal1);
  let site2Exists = IPPExceptionsManager.hasExclusion(contentPrincipal2);

  Assert.ok(site1Exists, `hasExclusion correctly states that ${site1} exists`);
  Assert.ok(site2Exists, `hasExclusion correctly states that ${site2} exists`);

  // Verify the permission data
  let permissionObj1 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal1);
  let permissionObj2 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal2);

  Assert.equal(
    permissionObj1?.capability,
    Ci.nsIPermissionManager.DENY_ACTION,
    `getExceptionPermissionObject correctly states that ${site1} exists and has capability DENY`
  );
  Assert.equal(
    permissionObj2?.capability,
    Ci.nsIPermissionManager.DENY_ACTION,
    `getExceptionPermissionObject correctly states that ${site2} exists and has capability DENY`
  );

  // Now remove the exceptions
  IPPExceptionsManager.removeExclusion(contentPrincipal1);
  IPPExceptionsManager.removeExclusion(contentPrincipal2);

  // Verify that hasExclusion no longer detects the recently removed sites
  site1Exists = IPPExceptionsManager.hasExclusion(contentPrincipal1);
  site2Exists = IPPExceptionsManager.hasExclusion(contentPrincipal2);

  Assert.ok(
    !site1Exists,
    `hasExclusion correctly states that ${site1} no longer exists`
  );
  Assert.ok(
    !site2Exists,
    `hasExclusion correctly states that ${site2} no longer exists`
  );

  // Verify the permission data no longer exists
  permissionObj1 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal1);
  permissionObj2 =
    IPPExceptionsManager.getExceptionPermissionObject(contentPrincipal2);

  Assert.ok(!permissionObj1, `Permission object for ${site1} no longer exists`);
  Assert.ok(!permissionObj2, `Permission object for ${site2} no longer exists`);

  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
  IPPExceptionsManager.uninit();

  Services.perms.removeByType(PERM_NAME);
});

add_task(async function test_IPPExceptionsManager_setExclusion() {
  Services.perms.removeByType(PERM_NAME);

  IPPExceptionsManager.init();

  const site = "https://www.example.com";
  const contentPrincipal =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site);

  // Add exclusion with shouldExclude=true
  let setTrueExChangePromise = waitForEvent(
    IPPExceptionsManager,
    EXCLUSION_CHANGED_EVENT
  );

  IPPExceptionsManager.setExclusion(contentPrincipal, true);

  await setTrueExChangePromise;

  Assert.ok(
    true,
    `${EXCLUSION_CHANGED_EVENT} event was dispatched after calling setExclusion with shouldExclude=true`
  );
  Assert.ok(
    IPPExceptionsManager.hasExclusion(contentPrincipal),
    "Site should exist in ipp-vpn with shouldExclude=true"
  );

  // Remove exclusion with shouldExclude=false
  let setFalseExChangePromise = waitForEvent(
    IPPExceptionsManager,
    EXCLUSION_CHANGED_EVENT
  );

  IPPExceptionsManager.setExclusion(contentPrincipal, false);

  await setFalseExChangePromise;

  Assert.ok(
    true,
    `${EXCLUSION_CHANGED_EVENT} event was dispatched after calling setExclusion with shouldExclude=false`
  );
  Assert.ok(
    !IPPExceptionsManager.hasExclusion(contentPrincipal),
    "Site should not exist in ipp-vpn with shouldExclude=false"
  );

  // Test that example.com and www.example.com are treated as separate exclusions
  const siteWithoutWWW = "https://example.com";
  const contentPrincipalWithoutWWW =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(
      siteWithoutWWW
    );

  // Add exclusion for example.com with shouldExclude=true
  setTrueExChangePromise = waitForEvent(
    IPPExceptionsManager,
    EXCLUSION_CHANGED_EVENT
  );

  IPPExceptionsManager.setExclusion(contentPrincipalWithoutWWW, true);

  await setTrueExChangePromise;

  Assert.ok(
    true,
    `${EXCLUSION_CHANGED_EVENT} event was dispatched after calling setExclusion with shouldExclude=true on example.com`
  );
  Assert.ok(
    IPPExceptionsManager.hasExclusion(contentPrincipalWithoutWWW),
    "example.com should exist in ipp-vpn with shouldExclude=true"
  );
  Assert.ok(
    !IPPExceptionsManager.hasExclusion(contentPrincipal),
    "www.example.com should not be excluded when only example.com is added"
  );

  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
  IPPExceptionsManager.uninit();
  Services.perms.removeByType(PERM_NAME);
});

/**
 * getPrincipalRule classifies non-proxyable principals as EXCLUDED without any
 * proxy connection: non-http(s) schemes and loopback hosts. A real null
 * principal is NOT excluded (it can back http(s) content, e.g. a sandboxed
 * iframe), and a missing principal fails safe to EXCLUDED.
 */
add_task(async function test_getPrincipalRule_excluded_principals() {
  IPPExceptionsManager.init();

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(null),
    IPPPrincipalRules.EXCLUDED,
    "missing principal -> EXCLUDED (fail safe)"
  );

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(
      makePrincipal("file:///tmp/page.html")
    ),
    IPPPrincipalRules.EXCLUDED,
    "file:// principal -> EXCLUDED (non-http scheme)"
  );

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(makePrincipal("http://127.0.0.1")),
    IPPPrincipalRules.EXCLUDED,
    "loopback address -> EXCLUDED"
  );

  // A real null principal (e.g. a sandboxed iframe, or a loading tab's transient
  // principal) is not an excluded site: its moz-nullprincipal scheme must not
  // trip the non-http exclusion, since it can back real http(s) content.
  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(
      Services.scriptSecurityManager.createNullPrincipal({})
    ),
    IPPPrincipalRules.DEFAULT,
    "null principal object -> DEFAULT (scheme exclusion skipped)"
  );

  IPPExceptionsManager.uninit();
});

/**
 * A normal https principal not on any include/exclude list is DEFAULT.
 */
add_task(async function test_getPrincipalRule_default() {
  IPPExceptionsManager.init();

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(makePrincipal("https://example.com")),
    IPPPrincipalRules.DEFAULT,
    "normal https principal not on any list -> DEFAULT"
  );

  IPPExceptionsManager.uninit();
});

/**
 * A user exclusion (ipp-vpn DENY) makes the principal EXCLUDED; removing it
 * returns to DEFAULT.
 */
add_task(async function test_getPrincipalRule_user_exclusion() {
  Services.perms.removeByType(PERM_NAME);
  IPPExceptionsManager.init();

  const principal = makePrincipal("https://excluded.example.com");

  IPPExceptionsManager.addExclusion(principal);
  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.EXCLUDED,
    "principal with ipp-vpn DENY -> EXCLUDED"
  );

  IPPExceptionsManager.removeExclusion(principal);
  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.DEFAULT,
    "principal -> DEFAULT after removing the exclusion"
  );

  IPPExceptionsManager.uninit();
  Services.perms.removeByType(PERM_NAME);
});

/**
 * A principal matching the inclusion pattern set is INCLUDED, and inclusion
 * beats a user exclusion on the same principal.
 */
add_task(async function test_getPrincipalRule_inclusion() {
  Services.perms.removeByType(PERM_NAME);
  // Set the inclusion pref before init() so #inclusionSet is built from it.
  Services.prefs.setStringPref(
    INCLUSION_PREF,
    JSON.stringify(["*://included.example.com/*"])
  );
  IPPExceptionsManager.init();

  const principal = makePrincipal("https://included.example.com");

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.INCLUDED,
    "principal matching inclusion pattern -> INCLUDED"
  );

  // Inclusion wins over a user exclusion on the same principal.
  IPPExceptionsManager.addExclusion(principal);
  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.INCLUDED,
    "inclusion rule beats ipp-vpn DENY"
  );

  IPPExceptionsManager.removeExclusion(principal);
  Services.prefs.clearUserPref(INCLUSION_PREF);
  IPPExceptionsManager.uninit();
  Services.perms.removeByType(PERM_NAME);
});

/**
 * An origin matching one of the excluded-URL prefs is EXCLUDED, and the
 * excluded-origins set tracks the pref via its observer.
 */
add_task(async function test_getPrincipalRule_excluded_origin() {
  Services.prefs.setStringPref(
    GUARDIAN_PREF,
    "https://pageexcluded.example.com/api"
  );

  IPPExceptionsManager.init();

  const principal = makePrincipal("https://pageexcluded.example.com");
  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.EXCLUDED,
    "origin matching an excluded-URL pref -> EXCLUDED"
  );

  // Clearing the pref fires the observer, which rebuilds the excluded set.
  Services.prefs.clearUserPref(GUARDIAN_PREF);
  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.DEFAULT,
    "clearing the excluded-URL pref -> DEFAULT"
  );

  IPPExceptionsManager.uninit();
});

add_task(
  async function test_getPrincipalRule_excluded_origin_beats_inclusion() {
    Services.perms.removeByType(PERM_NAME);
    // MODE_INCLUSION with an all-URLs pattern: every http(s) origin matches the
    // inclusion set. Set both prefs before init() so #inclusionSet is built from
    // them.
    Services.prefs.setIntPref(MODE_PREF, MODE_INCLUSION);
    Services.prefs.setStringPref(INCLUSION_PREF, JSON.stringify(["*://*/*"]));
    Services.prefs.setStringPref(
      GUARDIAN_PREF,
      "https://guardian.example.com/api"
    );

    IPPExceptionsManager.init();

    const excludedPrincipal = makePrincipal("https://guardian.example.com");
    Assert.equal(
      IPPExceptionsManager.getPrincipalRule(excludedPrincipal),
      IPPPrincipalRules.EXCLUDED,
      "excluded-origin pref must beat an all-URLs inclusion pattern -> EXCLUDED"
    );

    // Sanity check that an ordinary origin is still INCLUDED under this config,
    // so the assertion above isn't trivially passing because inclusion is off.
    const otherPrincipal = makePrincipal("https://example.com");
    Assert.equal(
      IPPExceptionsManager.getPrincipalRule(otherPrincipal),
      IPPPrincipalRules.INCLUDED,
      "a non-excluded origin still matches the all-URLs inclusion pattern -> INCLUDED"
    );

    Services.prefs.clearUserPref(MODE_PREF);
    Services.prefs.clearUserPref(INCLUSION_PREF);
    Services.prefs.clearUserPref(GUARDIAN_PREF);
    IPPExceptionsManager.uninit();
    Services.perms.removeByType(PERM_NAME);
  }
);

/**
 * canManage is true only for normal content pages: about:/chrome:/resource:
 * pages, the system principal, and loopback/local hosts are not user-manageable.
 */
add_task(async function test_canManage() {
  IPPExceptionsManager.init();

  const aboutPrincipal = makePrincipal("about:preferences");
  const chromePrincipal = makePrincipal(
    "chrome://browser/content/browser.xhtml"
  );
  const resourcePrincipal = makePrincipal("resource://pdf.js");
  const systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
  const httpsPrincipal = makePrincipal("https://example.com");
  const loopbackPrincipal = makePrincipal("http://localhost");
  const loopbackIpPrincipal = makePrincipal("http://127.0.0.1");
  const localIpPrincipal = makePrincipal("http://192.168.0.1");

  Assert.ok(
    !IPPExceptionsManager.canManage(aboutPrincipal),
    "about: page is not manageable"
  );
  Assert.ok(
    !IPPExceptionsManager.canManage(chromePrincipal),
    "chrome: page is not manageable"
  );
  Assert.ok(
    !IPPExceptionsManager.canManage(resourcePrincipal),
    "resource: page is not manageable"
  );
  Assert.ok(
    !IPPExceptionsManager.canManage(systemPrincipal),
    "system principal is not manageable"
  );
  Assert.ok(
    IPPExceptionsManager.canManage(httpsPrincipal),
    "https page is manageable"
  );
  Assert.ok(
    !IPPExceptionsManager.canManage(loopbackPrincipal),
    "loopback host is not manageable"
  );
  Assert.ok(
    !IPPExceptionsManager.canManage(loopbackIpPrincipal),
    "loopback IP is not manageable"
  );
  Assert.ok(
    !IPPExceptionsManager.canManage(localIpPrincipal),
    "LAN IP is not manageable"
  );

  IPPExceptionsManager.uninit();
});

/**
 * A principal matching the inclusion pattern is classified as INCLUDED.
 * The pattern matching respects ignorePath: true, so different paths on the
 * same host are all included.
 */
add_task(async function test_inclusion_pattern() {
  // Set the inclusion pref before init() so #inclusionSet is built from it.
  Services.prefs.setStringPref(
    INCLUSION_PREF,
    JSON.stringify(["*://example.com/*"])
  );

  const principal = makePrincipal("https://example.com/some/path");
  const principalOtherPath = makePrincipal("https://example.com/other/path");
  const principalOtherHost = makePrincipal("https://other.com/");

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.INCLUDED,
    "principal matching inclusion pattern -> INCLUDED"
  );

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principalOtherPath),
    IPPPrincipalRules.INCLUDED,
    "different path on included host -> INCLUDED (ignorePath: true)"
  );

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principalOtherHost),
    IPPPrincipalRules.DEFAULT,
    "principal not matching pattern -> DEFAULT"
  );

  Services.prefs.clearUserPref(INCLUSION_PREF);

  Assert.equal(
    IPPExceptionsManager.getPrincipalRule(principal),
    IPPPrincipalRules.DEFAULT,
    "clearing the inclusion pref -> DEFAULT (manager updates via observer)"
  );
});

/**
 * getPrincipalRule excludes local/loopback addresses and includes everything else.
 * isLocal is now part of IPPExceptionsManager.getPrincipalRule. For plain-http
 * principals, the only rule that can fire is the loopback/local check, so local
 * hosts are EXCLUDED and everything else is DEFAULT.
 */
add_task(function test_local_connections() {
  const tests = [
    // True either LAN or Loopback
    ["http://[::]", true],
    ["http://[::1]", true],
    ["http://[::1]:1234", true],
    ["http://[::ffff:0:0]", true],
    ["http://127.0.0.1", true],
    ["http://127.1.2.3", true],
    ["http://10.1.2.3", true],
    ["http://192.168.0.1", true],
    ["http://169.254.0.1", true],
    ["http://localhost", true],
    ["http://something.localhost", true],
    // False, anything else
    ["http://something.test", false],
    ["http://looocalhost", false],
    ["http://localhost.something", false],
    ["http://localhost6", false],
    ["http://looocalhost6", false],
    ["http://something.localhost6", false],
    ["http://localhost6.something", false],
    ["http://something.example", false],
    ["http://example.com", false],
    ["http://something.invalid", false],
    ["http://invalid.com", false],
    ["http://test.com", false],
    ["http://128.1.2.3", false],
    ["http://169.253.0.1", false],
    ["http://193.168.0.1", false],
    ["http://11.1.2.3", false],
  ];

  for (const [url, isLocal] of tests) {
    const expected = isLocal
      ? IPPPrincipalRules.EXCLUDED
      : IPPPrincipalRules.DEFAULT;
    Assert.equal(
      IPPExceptionsManager.getPrincipalRule(makePrincipal(url)),
      expected,
      url
    );
  }
});
