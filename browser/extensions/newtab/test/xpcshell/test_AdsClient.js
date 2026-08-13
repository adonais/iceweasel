/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AdsClient: "resource://newtab/lib/AdsClient.sys.mjs",
  _AdsClient: "resource://newtab/lib/AdsClient.sys.mjs",
});

const PREF_UNIFIED_ADS_ADSCLIENT_ENABLED = "unifiedAds.adsClient.enabled";

add_task(function test_isEnabled() {
  Assert.strictEqual(
    lazy.AdsClient.isEnabled({}),
    false,
    "Gated off by default (no pref, no trainhopConfig)"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled(undefined),
    false,
    "Gated off when prefs are missing"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled({ [PREF_UNIFIED_ADS_ADSCLIENT_ENABLED]: true }),
    true,
    "Enabled by the local about:config pref"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled({
      trainhopConfig: { adsClient: { enabled: true } },
    }),
    true,
    "Enabled by trainhopConfig.adsClient.enabled"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled({
      trainhopConfig: { adsClient: { enabled: false } },
    }),
    false,
    "Disabled when trainhopConfig.adsClient.enabled is false"
  );
});

add_task(function test_getClient_singleton() {
  const adsClient = new lazy._AdsClient();

  const client = adsClient.getClient();
  Assert.ok(client, "getClient builds and returns a MozAdsClient");

  const sameClient = adsClient.getClient();
  Assert.strictEqual(
    sameClient,
    client,
    "getClient returns the same cached singleton"
  );
});
