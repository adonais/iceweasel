/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPPermissionRuleProvider } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleProviders.sys.mjs"
);

const PERM_NAME = "ipp-vpn";

const makePrincipal = origin =>
  Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);

registerCleanupFunction(() => {
  Services.perms.removeByType(PERM_NAME);
});

/**
 * Runs body with an inited provider, and leaves no ipp-vpn permissions behind
 * so the next task starts from a clean store.
 *
 * @param {Function} body
 */
async function withProvider(body) {
  Services.perms.removeByType(PERM_NAME);
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
 * www.example.com (see Bug 2016676).
 */
add_task(async function test_rules_are_scoped_to_the_exact_host() {
  await withProvider(provider => {
    const bare = makePrincipal("https://example.com");
    const www = makePrincipal("https://www.example.com");

    provider.setRule(bare, IPPPrincipalRules.EXCLUDED);

    Assert.equal(
      provider.getRule(bare),
      IPPPrincipalRules.EXCLUDED,
      "example.com is excluded"
    );
    Assert.equal(
      provider.getRule(www),
      IPPPrincipalRules.DEFAULT,
      "www.example.com is untouched"
    );
  });
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
