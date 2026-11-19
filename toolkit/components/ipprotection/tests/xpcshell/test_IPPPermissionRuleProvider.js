/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPPermissionRuleProvider } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleProviders.sys.mjs"
);

const PERM_NAME = "ipp-vpn";

const SITE_INCLUSIONS_PREF = "browser.ipProtection.features.siteInclusions";
const NORMALIZED_PREF = "browser.ipProtection.siteRulesNormalized";

const makePrincipal = origin =>
  Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);

const storedOrigins = () =>
  Services.perms
    .getAllByTypes([PERM_NAME])
    .map(p => p.principal.origin)
    .sort();

registerCleanupFunction(() => {
  Services.perms.removeByType(PERM_NAME);
  Services.prefs.clearUserPref(SITE_INCLUSIONS_PREF);
  Services.prefs.clearUserPref(NORMALIZED_PREF);
});

/**
 * Runs body with an inited provider, and leaves no ipp-vpn permissions behind
 * so the next task starts from a clean store.
 *
 * @param {Function} body
 * @param {object} [options]
 * @param {boolean} [options.siteInclusions]
 *  Whether the site inclusions feature, and so normalization, is on.
 * @param {boolean} [options.normalized]
 *  Whether the store is marked as already normalized.
 * @param {Array<[string, number, number]>} [options.stored]
 *  [origin, capability, modificationTime] entries in the store before init.
 */
async function withProvider(
  body,
  { siteInclusions = true, normalized = false, stored = [] } = {}
) {
  Services.perms.removeByType(PERM_NAME);
  Services.prefs.setBoolPref(SITE_INCLUSIONS_PREF, siteInclusions);
  Services.prefs.setBoolPref(NORMALIZED_PREF, normalized);
  for (const [origin, capability, time] of stored) {
    Services.perms.testAddFromPrincipalByTime(
      makePrincipal(origin),
      PERM_NAME,
      capability,
      time
    );
  }
  const provider = new IPPPermissionRuleProvider();
  provider.init();
  try {
    await body(provider);
  } finally {
    provider.uninit();
    Services.perms.removeByType(PERM_NAME);
  }
}

/**
 * Rules round-trip through the ipp-vpn permission type: an exclusion is a DENY
 * permission, an inclusion is an ALLOW one, and DEFAULT removes the entry
 * rather than storing a third state.
 */
add_task(async function test_rules_map_to_permission_capabilities() {
  await withProvider(provider => {
    const principal = makePrincipal("https://www.example.com");

    provider.setRule(principal, IPPPrincipalRules.EXCLUDED);
    Assert.equal(
      provider.getPermissionObject(principal)?.capability,
      Ci.nsIPermissionManager.DENY_ACTION,
      "an exclusion is stored as DENY"
    );
    Assert.equal(
      provider.getRule(principal),
      IPPPrincipalRules.EXCLUDED,
      "DENY reads back as EXCLUDED"
    );

    provider.setRule(principal, IPPPrincipalRules.INCLUDED);
    Assert.equal(
      provider.getPermissionObject(principal)?.capability,
      Ci.nsIPermissionManager.ALLOW_ACTION,
      "an inclusion is stored as ALLOW"
    );
    Assert.equal(
      provider.getRule(principal),
      IPPPrincipalRules.INCLUDED,
      "ALLOW reads back as INCLUDED"
    );
    Assert.equal(
      Services.perms.getAllByTypes([PERM_NAME]).length,
      1,
      "the exclusion was replaced, not stacked"
    );

    provider.setRule(principal, IPPPrincipalRules.DEFAULT);
    Assert.ok(
      !provider.getPermissionObject(principal),
      "DEFAULT removes the permission"
    );
    Assert.equal(
      provider.getRule(principal),
      IPPPrincipalRules.DEFAULT,
      "a site with no permission has no stored rule"
    );
  });
});

/**
 * Rules are scoped to the exact host, not the base domain, so entering
 * example.com in the preferences dialog does not silently cover
 * sub.example.com (see Bug 2016676).
 */
add_task(async function test_rules_are_scoped_to_the_exact_host() {
  await withProvider(provider => {
    const bare = makePrincipal("https://example.com");
    const sub = makePrincipal("https://sub.example.com");

    provider.setRule(bare, IPPPrincipalRules.EXCLUDED);

    Assert.equal(
      provider.getRule(bare),
      IPPPrincipalRules.EXCLUDED,
      "example.com is excluded"
    );
    Assert.equal(
      provider.getRule(sub),
      IPPPrincipalRules.DEFAULT,
      "sub.example.com is untouched"
    );
  });
});

/**
 * A rule is stored on the https origin without "www.", so every http/https and
 * www/bare variant of a site shares it.
 */
add_task(async function test_rules_are_stored_normalized() {
  await withProvider(provider => {
    provider.setRule(
      // eslint-disable-next-line sdl/no-insecure-url
      makePrincipal("http://www.example.com"),
      IPPPrincipalRules.EXCLUDED
    );

    Assert.deepEqual(
      Services.perms.getAllByTypes([PERM_NAME]).map(p => p.principal.origin),
      ["https://example.com"],
      "the rule is stored on https://example.com"
    );
    for (const origin of [
      "https://example.com",
      "https://www.example.com",
      // eslint-disable-next-line sdl/no-insecure-url
      "http://example.com",
    ]) {
      Assert.equal(
        provider.getRule(makePrincipal(origin)),
        IPPPrincipalRules.EXCLUDED,
        `${origin} shares the rule`
      );
    }
  });
});

/**
 * "www." is kept when stripping it would leave nothing or a public suffix.
 */
add_task(async function test_www_is_kept_when_nothing_or_a_suffix_remains() {
  await withProvider(provider => {
    for (const origin of ["https://www.co.uk", "https://www."]) {
      provider.setRule(makePrincipal(origin), IPPPrincipalRules.EXCLUDED);

      Assert.deepEqual(
        Services.perms.getAllByTypes([PERM_NAME]).map(p => p.principal.origin),
        [origin],
        `the rule is stored on ${origin}`
      );
      Services.perms.removeByType(PERM_NAME);
    }
  });
});

/**
 * Without the site inclusions feature, the generic permissions dialog writes
 * exact origins, so rules are stored and matched exactly as given.
 */
add_task(async function test_rules_are_exact_without_site_inclusions() {
  await withProvider(
    provider => {
      // eslint-disable-next-line sdl/no-insecure-url
      const insecureWww = makePrincipal("http://www.example.com");
      provider.setRule(insecureWww, IPPPrincipalRules.EXCLUDED);

      // eslint-disable-next-line sdl/no-insecure-url
      Assert.deepEqual(storedOrigins(), ["http://www.example.com"]);
      Assert.equal(
        provider.getRule(makePrincipal("https://example.com")),
        IPPPrincipalRules.DEFAULT,
        "https://example.com does not share the rule"
      );
    },
    { siteInclusions: false }
  );
});

/**
 * Entries stored before the feature was on are normalized at init. When
 * several collapse onto one origin, the most recently modified wins.
 */
add_task(async function test_stored_entries_are_normalized_on_init() {
  const { ALLOW_ACTION, DENY_ACTION } = Ci.nsIPermissionManager;
  await withProvider(
    provider => {
      Assert.deepEqual(
        storedOrigins(),
        ["https://example.com", "https://other.example.org"],
        "the variants collapse onto one normalized entry"
      );
      Assert.equal(
        provider.getRule(makePrincipal("https://www.example.com")),
        IPPPrincipalRules.INCLUDED,
        "the most recent entry wins"
      );
      Assert.equal(
        provider.getRule(makePrincipal("https://other.example.org")),
        IPPPrincipalRules.EXCLUDED,
        "a normalized entry is kept"
      );
      Assert.ok(
        Services.prefs.getBoolPref(NORMALIZED_PREF),
        "the store is marked as normalized"
      );
    },
    {
      stored: [
        // eslint-disable-next-line sdl/no-insecure-url
        ["http://www.example.com", DENY_ACTION, 1000],
        ["https://www.example.com", ALLOW_ACTION, 3000],
        ["https://example.com", DENY_ACTION, 2000],
        ["https://other.example.org", DENY_ACTION, 1000],
      ],
    }
  );
});

/**
 * Once the store is marked as normalized, init leaves it alone.
 */
add_task(async function test_normalization_runs_once() {
  await withProvider(
    () => {
      Assert.deepEqual(
        storedOrigins(),
        ["https://www.example.com"],
        "the stored entry is not rewritten"
      );
    },
    {
      normalized: true,
      stored: [
        ["https://www.example.com", Ci.nsIPermissionManager.DENY_ACTION, 1000],
      ],
    }
  );
});

/**
 * With the feature off the marker is cleared, since the generic permissions
 * dialog may store exact entries again, and turning it on normalizes the
 * store again.
 */
add_task(async function test_stored_entries_are_normalized_on_enable() {
  await withProvider(
    provider => {
      provider.setRule(
        makePrincipal("https://www.example.com"),
        IPPPrincipalRules.EXCLUDED
      );
      Assert.deepEqual(storedOrigins(), ["https://www.example.com"]);
      Assert.ok(
        !Services.prefs.prefHasUserValue(NORMALIZED_PREF),
        "the marker is cleared while the feature is off"
      );

      Services.prefs.setBoolPref(SITE_INCLUSIONS_PREF, true);

      Assert.deepEqual(storedOrigins(), ["https://example.com"]);
      Assert.equal(
        // eslint-disable-next-line sdl/no-insecure-url
        provider.getRule(makePrincipal("http://example.com")),
        IPPPrincipalRules.EXCLUDED,
        "the normalized rule applies to every variant"
      );
    },
    { siteInclusions: false, normalized: true }
  );
});

/**
 * A store update tells the manager, including when a rule is cleared, so the
 * UI can react to a site being removed as well as added.
 */
add_task(async function test_writes_notify() {
  await withProvider(async provider => {
    const principal = makePrincipal("https://notify.example.com");

    let changed = waitForEvent(provider, "change");
    provider.setRule(principal, IPPPrincipalRules.EXCLUDED);
    await changed;
    Assert.ok(true, "adding a rule notifies");

    changed = waitForEvent(provider, "change");
    provider.setRule(principal, IPPPrincipalRules.DEFAULT);
    await changed;
    Assert.ok(true, "clearing a rule notifies");
  });
});

/**
 * A write that would not change anything is dropped, so the UI does not get
 * woken up for a no-op.
 */
add_task(async function test_redundant_write_is_dropped() {
  await withProvider(provider => {
    const principal = makePrincipal("https://redundant.example.com");
    provider.setRule(principal, IPPPrincipalRules.EXCLUDED);

    let seen = 0;
    provider.addEventListener("change", () => seen++);
    provider.setRule(principal, IPPPrincipalRules.EXCLUDED);

    Assert.equal(seen, 0, "re-setting the same rule does not notify");
  });
});

/**
 * count reports each rule separately, so the UI can show how many sites the
 * user has excluded without also counting the ones they included.
 */
add_task(async function test_count_is_per_rule() {
  await withProvider(provider => {
    Assert.equal(
      provider.count(IPPPrincipalRules.INCLUDED),
      0,
      "no inclusions to start with"
    );

    provider.setRule(
      makePrincipal("https://excluded.example.com"),
      IPPPrincipalRules.EXCLUDED
    );
    const included = makePrincipal("https://included.example.com");
    provider.setRule(included, IPPPrincipalRules.INCLUDED);

    Assert.equal(
      provider.count(IPPPrincipalRules.INCLUDED),
      1,
      "the inclusion is counted"
    );
    Assert.equal(
      provider.count(IPPPrincipalRules.EXCLUDED),
      1,
      "the exclusion is counted separately"
    );

    provider.setRule(included, IPPPrincipalRules.DEFAULT);
    Assert.equal(
      provider.count(IPPPrincipalRules.INCLUDED),
      0,
      "removing the inclusion drops the count"
    );
  });
});

/**
 * This is the writable provider, so it accepts any principal it can hang a
 * permission on. Whether the write is worth making is the manager's call,
 * since only the manager knows what would mask it.
 */
add_task(async function test_canSet_needs_only_a_principal() {
  await withProvider(provider => {
    Assert.ok(
      provider.canSet(makePrincipal("https://example.com")),
      "a content principal can be written"
    );
    Assert.ok(!provider.canSet(null), "a missing principal cannot");
  });
});

/**
 * uninit drops the perm-changed observer, so a torn-down provider stops
 * notifying.
 */
add_task(async function test_uninit_stops_observing() {
  const provider = new IPPPermissionRuleProvider();
  provider.init();
  provider.uninit();

  let seen = 0;
  provider.addEventListener("change", () => seen++);
  const principal = makePrincipal("https://uninited.example.com");
  provider.setRule(principal, IPPPrincipalRules.EXCLUDED);

  Assert.equal(seen, 0, "an uninited provider does not notify");
  Services.perms.removeByType(PERM_NAME);
});

/**
 * The inclusion and exclusion counts are recorded when the provider is inited
 * and kept current as rules are added, swapped and removed.
 */
add_task(async function test_counts_are_recorded() {
  do_get_profile();
  Services.fog.initializeFOG();
  Services.fog.testResetFOG();
  Services.perms.removeByType(PERM_NAME);
  Services.perms.addFromPrincipal(
    makePrincipal("https://existing.example.com"),
    PERM_NAME,
    Ci.nsIPermissionManager.DENY_ACTION
  );

  const provider = new IPPPermissionRuleProvider();
  provider.init();
  try {
    const assertCounts = (inclusions, exclusions, message) => {
      Assert.equal(
        Glean.ipprotectionInclusions.count.testGetValue(),
        inclusions,
        `${message}: inclusions`
      );
      Assert.equal(
        Glean.ipprotectionExclusions.count.testGetValue(),
        exclusions,
        `${message}: exclusions`
      );
    };

    assertCounts(0, 1, "existing rules are counted at init");

    const site = makePrincipal("https://counted.example.com");
    provider.setRule(site, IPPPrincipalRules.INCLUDED);
    assertCounts(1, 1, "an added inclusion is counted");

    provider.setRule(site, IPPPrincipalRules.EXCLUDED);
    assertCounts(0, 2, "a swapped rule moves between counts");

    provider.setRule(site, IPPPrincipalRules.DEFAULT);
    assertCounts(0, 1, "a removed rule is no longer counted");
  } finally {
    provider.uninit();
    Services.perms.removeByType(PERM_NAME);
  }
});
