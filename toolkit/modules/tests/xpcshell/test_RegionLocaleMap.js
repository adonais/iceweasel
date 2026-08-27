/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { RegionLocaleMap } = ChromeUtils.importESModule(
  "moz-src:///toolkit/modules/RegionLocaleMap.sys.mjs"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const PREF = "test.regionLocaleMap.list";

add_task(function test_matches() {
  const map = new RegionLocaleMap([
    ["US", ["en-*"]],
    ["FR", ["en-*", "fr-*"]],
    ["IT", ["it"]],
  ]);

  const cases = [
    { region: "US", locale: "en-US", expected: true },
    { region: "US", locale: "en", expected: true, desc: "short locale" },
    { region: "US", locale: "fr-FR", expected: false },
    { region: "FR", locale: "fr-FR", expected: true },
    { region: "FR", locale: "en-CA", expected: true },
    { region: "FR", locale: "de-DE", expected: false },
    { region: "fr", locale: "fr-FR", expected: true, desc: "lowercase region" },
    { region: "FR", locale: "FR-fr", expected: true, desc: "locale casing" },
    { region: "IT", locale: "it", expected: true, desc: "exact pattern" },
    {
      region: "IT",
      locale: "it-IT",
      expected: false,
      desc: "exact pattern does not match a variant",
    },
    { region: "DE", locale: "de-DE", expected: false, desc: "unlisted region" },
    { region: null, locale: "en-US", expected: false, desc: "no region" },
    { region: undefined, locale: "en-US", expected: false, desc: "no region" },
  ];

  for (const { region, locale, expected, desc } of cases) {
    Assert.equal(
      map.matches(region, locale),
      expected,
      `Region "${region}" + locale "${locale}"${desc ? ` (${desc})` : ""}`
    );
  }
});

add_task(function test_wildcardRegion() {
  // Entries are OR-ed, so this reads as "France in English or French, or a
  // French locale anywhere".
  const map = new RegionLocaleMap([
    ["FR", ["en-*", "fr-*"]],
    ["*", ["fr-*"]],
  ]);

  Assert.ok(map.matches("FR", "en-US"), "The region entry still applies");
  Assert.ok(map.matches("FR", "fr-FR"), "Both entries may apply at once");
  Assert.ok(!map.matches("FR", "de-DE"), "The union is not a free pass");
  Assert.ok(map.matches("US", "fr-CA"), "The wildcard covers other regions");
  Assert.ok(!map.matches("US", "en-US"), "Only the listed locales match");
  Assert.ok(
    map.matches(null, "fr-FR"),
    "The wildcard applies before the region resolves"
  );
  Assert.ok(!map.matches(null, "en-US"), "An unknown region has no locales");
});

add_task(function test_emptyMap() {
  Assert.ok(
    !new RegionLocaleMap().matches("US", "en-US"),
    "An empty map matches nothing"
  );
  Assert.ok(
    !new RegionLocaleMap([]).matches("US", "en-US"),
    "An empty list matches nothing"
  );
});

add_task(function test_fromJSON() {
  // The fallback only kicks in for values that can't be parsed as a list of
  // entries, which `onInvalid` reports. An emptied or empty list is a valid way
  // to disable a feature, so it doesn't fall back.
  const fallback = [["US", ["en-*"]]];
  const cases = [
    {
      json: '[["IT",["it-*"]]]',
      matches: [["IT", "it-IT"]],
      doesNotMatch: [["US", "en-US"]],
      desc: "a parseable list replaces the fallback",
    },
    {
      json: "",
      doesNotMatch: [
        ["US", "en-US"],
        ["IT", "it-IT"],
      ],
      desc: "an emptied pref disables the feature",
    },
    {
      json: "[]",
      doesNotMatch: [["US", "en-US"]],
      desc: "an empty list disables the feature",
    },
    {
      json: "not json",
      invalid: true,
      matches: [["US", "en-US"]],
      desc: "invalid json falls back",
    },
    {
      json: '{"US":["en-*"]}',
      invalid: true,
      matches: [["US", "en-US"]],
      desc: "an object is not a list of entries, so it falls back",
    },
    {
      json: "null",
      invalid: true,
      matches: [["US", "en-US"]],
      desc: "null falls back",
    },
  ];

  for (const { json, invalid, matches, doesNotMatch, desc } of cases) {
    let invalidValue;
    const map = RegionLocaleMap.fromJSON(json, {
      fallback,
      onInvalid: value => {
        invalidValue = value;
      },
    });
    for (const [region, locale] of matches ?? []) {
      Assert.ok(map.matches(region, locale), `${desc}: ${region} ${locale}`);
    }
    for (const [region, locale] of doesNotMatch ?? []) {
      Assert.ok(!map.matches(region, locale), `${desc}: ${region} ${locale}`);
    }
    Assert.equal(
      invalidValue,
      invalid ? json : undefined,
      `${desc}: onInvalid reporting`
    );
  }
});

add_task(function test_asLazyPrefGetter() {
  // The intended usage: a lazy pref getter whose transform builds the map, so
  // that a pref change is picked up.
  const defaultEntries = [["US", ["en-*"]]];
  const lazy = {};
  XPCOMUtils.defineLazyPreferenceGetter(
    lazy,
    "regions",
    PREF,
    JSON.stringify(defaultEntries),
    null,
    json => RegionLocaleMap.fromJSON(json, { fallback: defaultEntries })
  );
  registerCleanupFunction(() => Services.prefs.clearUserPref(PREF));

  Assert.ok(
    lazy.regions.matches("US", "en-US"),
    "An unset pref uses the default entries"
  );

  Services.prefs.setCharPref(PREF, '[["IT",["it-*"]]]');
  Assert.ok(
    lazy.regions.matches("IT", "it-IT"),
    "The getter picks up a pref change"
  );
  Assert.ok(
    !lazy.regions.matches("US", "en-US"),
    "The default entries no longer apply"
  );

  Services.prefs.setCharPref(PREF, "");
  Assert.ok(
    !lazy.regions.matches("US", "en-US"),
    "An emptied pref disables the feature"
  );

  Services.prefs.setCharPref(PREF, "not json");
  Assert.ok(
    lazy.regions.matches("US", "en-US"),
    "An unparseable pref falls back to the default entries"
  );
});
