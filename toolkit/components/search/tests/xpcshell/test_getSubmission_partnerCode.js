/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the partner code is correctly handled within
 * `SearchEngine.getSubmssion`.
 */

"use strict";

add_setup(async function () {
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
      identifier: `google`,
      base: {
        partnerCode: "googleengine",
        urls: {
          search: {
            base: "https://google.com",
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
    },
  ]);
  await SearchService.init();
});

add_task(async function test_config_engine() {
  let engine = await SearchService.getEngineById("engine");
  let submission = engine.getSubmission("searchterm", null, "default");

  Assert.equal(
    submission.uri.spec,
    "https://example.com/?pc=mainengine&q=searchterm",
    "Should have the correct partner code in the url"
  );
  Assert.equal(
    submission.partnerCode,
    "mainengine",
    "Should have returned the correct partner code being used"
  );
  Assert.equal(
    submission.telemetryId,
    "engine-foo",
    "Should have returned the correct telemetry id"
  );
});

add_task(async function test_config_engine_unknown_sap_source() {
  let engine = await SearchService.getEngineById("engine");
  let submission = engine.getSubmission("searchterm", null, "random");

  Assert.equal(
    submission.uri.spec,
    "https://example.com/?pc=mainengine&q=searchterm",
    "Should have the correct partner code in the url for a random SAP"
  );
  Assert.equal(
    submission.partnerCode,
    "mainengine",
    "Should have returned the correct partner code being used for a random SAP"
  );
  Assert.equal(
    submission.telemetryId,
    "engine-foo",
    "Should have returned the correct telemetry id for a random SAP"
  );
});

// TODO: Temporary test that will be replaced in bug 2064720 or earlier.
add_task(async function test_config_engine_google() {
  let engine = await SearchService.getEngineById("google");
  let submission = engine.getSubmission("searchterm", null, "default");

  Assert.equal(
    submission.uri.spec,
    "https://google.com/?pc=googleengine&q=searchterm",
    "Should have the correct partner code in the url"
  );
  Assert.equal(
    submission.partnerCode,
    "googleengine",
    "Should have returned the correct partner code being used"
  );
  Assert.equal(
    submission.telemetryId,
    "google",
    "Should have returned the correct telemetry id"
  );

  submission = engine.getSubmission("searchterm", null, "errorpage");

  Assert.equal(
    submission.uri.spec,
    "https://google.com/?q=searchterm",
    "Should not have the partner code in the url for errorpage"
  );
  Assert.equal(
    submission.partnerCode,
    "",
    "Should have not returned any partner code"
  );
  Assert.equal(
    submission.telemetryId,
    "google-com-nocodes",
    "Should have returned the correct telemetry id"
  );
});
