/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  useContextualAds: "resource://newtab/lib/ActivityStream.sys.mjs",
});

const REGION_CONFIG =
  "browser.newtabpage.activity-stream.discoverystream.sections.contextualAds.region-config";
const LOCALE_CONFIG =
  "browser.newtabpage.activity-stream.discoverystream.sections.contextualAds.locale-config";

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(REGION_CONFIG);
  Services.prefs.clearUserPref(LOCALE_CONFIG);
});

// An empty region/locale config simulates the default an older channel ships in
// firefox.js. useContextualAds should coalesce these to its baked-in US
// defaults so the rollout can train-hop via the XPI.
add_task(function test_empty_config_coalesces_to_us_default() {
  Services.prefs.setStringPref(REGION_CONFIG, "");
  Services.prefs.setStringPref(LOCALE_CONFIG, "");

  Assert.ok(
    useContextualAds({ geo: "US", locale: "en-US" }),
    "Enabled for US/en-US when the region config is empty"
  );
  Assert.ok(
    !useContextualAds({ geo: "JP", locale: "en-US" }),
    "Disabled when the region is not US"
  );
  Assert.ok(
    !useContextualAds({ geo: "US", locale: "fr" }),
    "Disabled when the locale is not supported"
  );
});

// A non-empty config must override the baked-in default so Nimbus can still
// configure which regions/locales receive contextual ads.
add_task(function test_explicit_config_overrides_default() {
  Services.prefs.setStringPref(REGION_CONFIG, "CA");
  Services.prefs.setStringPref(LOCALE_CONFIG, "en-CA");

  Assert.ok(
    !useContextualAds({ geo: "US", locale: "en-US" }),
    "Disabled for US once the config is narrowed to CA"
  );
  Assert.ok(
    useContextualAds({ geo: "CA", locale: "en-CA" }),
    "Enabled for the explicitly configured CA/en-CA"
  );
});
