/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPInfrastructureRuleProvider } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleProviders.sys.mjs"
);

const GUARDIAN_PREF = "browser.ipProtection.guardian.endpoint";
const AUTH_PREF = "browser.ipProtection.test.authProviderUrl";

const makePrincipal = url =>
  Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(url),
    {}
  );

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(GUARDIAN_PREF);
  Services.prefs.clearUserPref(AUTH_PREF);
});

/**
 * The origin set is merged from the default prefs and the active auth
 * provider's, and matching is per-origin so the path does not matter.
 */
add_task(function test_excludes_infrastructure_origins() {
  Services.prefs.setStringPref(GUARDIAN_PREF, "https://guardian.example/api");
  Services.prefs.setStringPref(AUTH_PREF, "https://auth.example/token");
  const authProvider = sinon
    .stub(IPProtectionService, "authProvider")
    .value({ excludedUrlPrefs: [AUTH_PREF] });

  const provider = new IPPInfrastructureRuleProvider();
  provider.init();

  Assert.equal(
    provider.getRule(makePrincipal("https://guardian.example/other/path")),
    IPPPrincipalRules.EXCLUDED,
    "a default-pref origin is excluded whatever the path"
  );
  Assert.equal(
    provider.getRule(makePrincipal("https://auth.example/")),
    IPPPrincipalRules.EXCLUDED,
    "an auth-provider-pref origin is excluded"
  );
  Assert.equal(
    provider.getRule(makePrincipal("https://example.com/")),
    null,
    "an unrelated origin gets no opinion"
  );

  provider.uninit();
  authProvider.restore();
});

add_task(function test_survives_an_unreachable_auth_provider() {
  Services.prefs.setStringPref(GUARDIAN_PREF, "https://guardian.example/api");
  const authProvider = sinon.stub(IPProtectionService, "authProvider").value({
    get excludedUrlPrefs() {
      throw new Error("boom");
    },
  });

  const provider = new IPPInfrastructureRuleProvider();
  provider.init();

  Assert.equal(
    provider.getRule(makePrincipal("https://guardian.example/")),
    IPPPrincipalRules.EXCLUDED,
    "the default prefs are still excluded"
  );

  provider.uninit();
  authProvider.restore();
});

/**
 * A moved endpoint takes effect without a restart: the observer rebuilds the
 * origin set and tells the manager.
 */
add_task(async function test_tracks_pref_changes() {
  Services.prefs.setStringPref(GUARDIAN_PREF, "https://old.example/api");

  const provider = new IPPInfrastructureRuleProvider();
  provider.init();

  const changed = waitForEvent(provider, "change");
  Services.prefs.setStringPref(GUARDIAN_PREF, "https://new.example/api");
  await changed;

  Assert.equal(
    provider.getRule(makePrincipal("https://new.example/")),
    IPPPrincipalRules.EXCLUDED,
    "the new endpoint is excluded"
  );
  Assert.equal(
    provider.getRule(makePrincipal("https://old.example/")),
    null,
    "the previous endpoint is not"
  );

  provider.uninit();
});
