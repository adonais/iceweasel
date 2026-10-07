/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MatchPatternPrefRule } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleProviders.sys.mjs"
);

const PREF = "browser.ipProtection.test.match_patterns";

const makePrincipal = url =>
  Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(url),
    {}
  );

const setPatterns = patterns =>
  Services.prefs.setStringPref(PREF, JSON.stringify(patterns));

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(PREF);
});

add_task(function test_applies_the_configured_rule() {
  setPatterns(["*://listed.example/*"]);

  for (const rule of [IPPPrincipalRules.INCLUDED, IPPPrincipalRules.EXCLUDED]) {
    const provider = new MatchPatternPrefRule(PREF, rule);
    provider.init();

    Assert.equal(
      provider.getRule(makePrincipal("https://listed.example/deep/path?q=1")),
      rule,
      `a listed origin -> ${rule}`
    );
    Assert.equal(
      provider.getRule(makePrincipal("https://example.com/")),
      null,
      "an unlisted origin gets no opinion"
    );

    provider.uninit();
  }
});

add_task(async function test_tracks_pref_changes() {
  setPatterns(["*://old.example/*"]);

  const provider = new MatchPatternPrefRule(PREF, IPPPrincipalRules.INCLUDED);
  provider.init();

  const changed = waitForEvent(provider, "change");
  setPatterns(["*://new.example/*"]);
  await changed;

  Assert.equal(
    provider.getRule(makePrincipal("https://new.example/")),
    IPPPrincipalRules.INCLUDED,
    "the newly listed origin is included"
  );
  Assert.equal(
    provider.getRule(makePrincipal("https://old.example/")),
    null,
    "the removed origin is not"
  );

  const unreadable = waitForEvent(provider, "change");
  setPatterns(["not a match pattern"]);
  await unreadable;

  Assert.equal(
    provider.getRule(makePrincipal("https://new.example/")),
    null,
    "an unparseable pattern drops the previous patterns"
  );

  const recovered = waitForEvent(provider, "change");
  setPatterns(["*://new.example/*"]);
  await recovered;

  Assert.equal(
    provider.getRule(makePrincipal("https://new.example/")),
    IPPPrincipalRules.INCLUDED,
    "a good value applies again, so the observer survived the failure"
  );

  provider.uninit();
});

add_task(function test_unreadable_pref_yields_no_opinion() {
  Services.prefs.setStringPref(PREF, JSON.stringify({}));

  const provider = new MatchPatternPrefRule(PREF, IPPPrincipalRules.INCLUDED);
  provider.init();

  Assert.equal(
    provider.getRule(makePrincipal("https://listed.example/")),
    null,
    "a pref that is not a JSON array leaves the provider with no opinion"
  );

  provider.uninit();
});
