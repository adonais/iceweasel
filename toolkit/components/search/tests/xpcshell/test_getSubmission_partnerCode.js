/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the partner code is correctly handled within
 * `SearchEngine.getSubmssion`.
 *
 * TODO: SearchUtils.configV3FeatureGate - when we remove v2,
 * we should also clean this up, as it currently depends on the
 * hardcoded values for v2. We should still keep some tests that
 * per SAP partner codes are handled correctly & fallback to default
 * correctly.
 */

"use strict";

add_setup(async function () {
  let partnerDetails;
  if (SearchUtils.configV3FeatureGate) {
    partnerDetails = {
      partner: {
        default: { code: "googleengine" },
        errorpage: { code: "", telemetrySuffix: "com-nocodes" },
        newtab: { code: "newtabcode", telemetrySuffix: "newtabsx" },
        newtab_search_widget: {
          code: "firefox-b-exp1",
          telemetrySuffix: "b-exp1",
        },
        context: { code: "contextmenucode" },
      },
    };
  } else {
    partnerDetails = {
      partnerCode: "googleengine",
    };
  }

  SearchTestUtils.setRemoteSettingsConfig([
    {
      identifier: `engine`,
      base: {
        urls: {
          search: {
            base: "https://example.com",
            params: [
              {
                name: "pc",
                value: "{partnerCode}",
              },
            ],
            searchTermParamName: "q",
          },
        },
      },
      variants: [
        {
          environment: {
            allRegionsAndLocales: true,
          },
          partnerCode: "mainengine",
          telemetrySuffix: "foo",
        },
      ],
    },
    {
      identifier: `sap-overrides`,
      base: {
        urls: {
          search: {
            base: "https://example.com",
            params: [
              {
                name: "pc",
                value: "{partnerCode}",
              },
            ],
            searchTermParamName: "q",
          },
        },
        partner: {
          default: { code: "otherengine" },
          context: { code: "contextmenu" },
          // This intentionally overrides the mapping in
          // SearchUtils.SAP_SOURCE_TO_SEARCH_CONFIG_MAP.
          contextmenu: { code: "contextmenuforced" },
        },
      },
    },
    {
      // This should be renamed when the `configV3FeatureGate` flag is removed,
      // as it will not need to match `google`, and will be better that it is generic.
      identifier: `google`,
      base: {
        urls: {
          search: {
            base: "https://example.com",
            params: [
              {
                name: "pc",
                value: "{partnerCode}",
              },
            ],
            searchTermParamName: "q",
          },
        },
        ...partnerDetails,
      },
    },
  ]);
  await SearchService.init();
});

function assertSubmission(
  engine,
  sap,
  expectedPartnerCode,
  expectedTelemetryId,
  message
) {
  let submission = engine.getSubmission("searchterm", null, sap);

  Assert.equal(
    submission.uri.spec,
    expectedPartnerCode
      ? `https://example.com/?pc=${expectedPartnerCode}&q=searchterm`
      : `https://example.com/?q=searchterm`,
    `Should have the correct partner code for a ${message}`
  );
  Assert.equal(
    submission.partnerCode,
    expectedPartnerCode,
    `Should have returned the correct partner code for a ${message}`
  );
  Assert.equal(
    submission.telemetryId,
    expectedTelemetryId,
    `Should have returned the correct telemetry id for a ${message}`
  );
}

add_task(async function test_config_engine_basic() {
  let engine = await SearchService.getEngineById("engine");
  assertSubmission(
    engine,
    "default",
    "mainengine",
    "engine-foo",
    "basic engine"
  );
});

add_task(async function test_config_engine_unknown_sap_source() {
  let engine = await SearchService.getEngineById("engine");
  assertSubmission(engine, "random", "mainengine", "engine-foo", "random SAP");
});

add_task(
  { skip_if: () => !SearchUtils.configV3FeatureGate },
  async function test_config_engine_config_overrides_map() {
    let engine = await SearchService.getEngineById("sap-overrides");
    assertSubmission(
      engine,
      "contextmenu",
      "contextmenuforced",
      "sap-overrides",
      "overridden SAP"
    );
  }
);

add_task(
  { skip_if: () => !SearchUtils.configV3FeatureGate },
  async function test_required_mappings() {
    let engine = await SearchService.getEngineById("google");
    assertSubmission(
      engine,
      "contextmenu",
      "contextmenucode",
      "google",
      "mapped contextmenu"
    );
    assertSubmission(
      engine,
      "text_selection",
      "contextmenucode",
      "google",
      "mapped text_selection"
    );
    assertSubmission(
      engine,
      "newtab_searchbar",
      "newtabcode",
      "google-newtabsx",
      "mapped newtab_searchbar"
    );
    assertSubmission(
      engine,
      "about_home",
      "newtabcode",
      "google-newtabsx",
      "mapped newtab_searchbar"
    );
    assertSubmission(
      engine,
      "about_newtab",
      "newtabcode",
      "google-newtabsx",
      "mapped newtab_searchbar"
    );
  }
);

// This can be removed when the v2 code is shipped (!configV3FeatureGate).
add_task(async function test_config_engine_google() {
  let engine = await SearchService.getEngineById("google");
  assertSubmission(
    engine,
    "default",
    "googleengine",
    "google",
    "google hardcoded override (default)"
  );

  assertSubmission(
    engine,
    "errorpage",
    "",
    "google-com-nocodes",
    "google hardcoded override (errorpage)"
  );

  assertSubmission(
    engine,
    "newtab_search_widget",
    "firefox-b-exp1",
    "google-b-exp1",
    "google hardcoded override (newtab_search_widget)"
  );
});
