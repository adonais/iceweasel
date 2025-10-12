/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Testing search suggestions from SearchSuggestionController.sys.mjs.
 */

"use strict";

const { SearchSuggestionController } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs"
);
const { ObliviousHTTP } = ChromeUtils.importESModule(
  "resource://gre/modules/ObliviousHTTP.sys.mjs"
);

const ENGINE_ID = "suggestions-engine-test";

let server = useHttpServer();
server.registerContentType("sjs", "sjs");

const CONFIG = [
  {
    identifier: ENGINE_ID,
    base: {
      name: "other",
      urls: {
        suggestions: {
          base: `${gHttpURL}/sjs/searchSuggestions.sjs`,
          params: [
            {
              name: "parameter",
              value: "14235",
            },
          ],
          searchTermParamName: "q",
        },
      },
    },
  },
];

add_setup(async function () {
  consoleAllowList = consoleAllowList.concat([
    "SearchSuggestionController found an unexpected string value",
  ]);

  Services.fog.initializeFOG();
  Services.prefs.setBoolPref("browser.search.suggest.enabled", true);
  Services.prefs.setCharPref(
    "browser.urlbar.merino.ohttpConfigURL",
    "https://example.com/config"
  );
  Services.prefs.setCharPref(
    "browser.urlbar.merino.ohttpRelayURL",
    "https://example.com/relay"
  );
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.featureGate", true);
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.enabled", true);

  SearchTestUtils.setRemoteSettingsConfig(CONFIG);
  await Services.search.init();

  SearchSuggestionController.oHTTPEngineId = CONFIG[0].identifier;

  sinon.stub(ObliviousHTTP, "getOHTTPConfig").resolves({});
  sinon.stub(ObliviousHTTP, "ohttpRequest").callsFake(() => {});
});

async function do_successful_request(controller) {
  ObliviousHTTP.ohttpRequest.callsFake(() => {
    return {
      status: 200,
      json: async () =>
        Promise.resolve({
          suggestions: [
            {
              title: "",
              url: "https://merino.services.mozilla.com",
              provider: "google_suggest",
              is_sponsored: false,
              score: 1,
              custom_details: {
                google_suggest: {
                  suggestions: ["oh", ["ohttp"]],
                },
              },
            },
          ],
        }),
      ok: true,
    };
  });

  let result = await controller.fetch({
    searchString: "oh",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should have requested via OHTTP once"
  );

  Assert.equal(result.term, "oh", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    ["ohttp"],
    "Should have the expected remote suggestions"
  );

  ObliviousHTTP.ohttpRequest.resetHistory();
}

async function do_failed_request(controller) {
  ObliviousHTTP.ohttpRequest.callsFake(() => {
    return {
      status: 200,
      json: async () =>
        Promise.resolve({
          suggestions: [],
        }),
      ok: true,
    };
  });

  let result = await controller.fetch({
    searchString: "oh",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should have requested via OHTTP once"
  );

  Assert.equal(result.term, "oh", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.equal(result.remote.length, 0, "Should have no remote suggestions");

  ObliviousHTTP.ohttpRequest.resetHistory();
}

async function do_request_expect_fallback_direct(controller) {
  ObliviousHTTP.ohttpRequest.callsFake(() => {
    return {
      status: 200,
      json: async () =>
        Promise.resolve({
          suggestions: [],
        }),
      ok: true,
    };
  });

  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    0,
    "Should not have requested via OHTTP"
  );

  Assert.equal(result.term, "mo", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    ["Mozilla", "modern", "mom"],
    "Should have remote suggestions from searchSuggestions.sjs"
  );
}

add_task(async function search_suggestions_fallsback_to_direct_http() {
  let controller = new SearchSuggestionController();

  info("Initial request via OHTTP should be successful");
  await do_successful_request(controller);
  await assertTelemetry({ success: 1, failed: 0 });

  info("First failed request");
  await do_failed_request(controller);
  await assertTelemetry({ success: 1, failed: 1 });

  info("Second failed request");
  await do_failed_request(controller);
  await assertTelemetry({ success: 1, failed: 2 });

  // Reset fog for easier counting.
  Services.fog.testResetFOG();

  info("Successful Request should reset the counter");
  await do_successful_request(controller);
  await assertTelemetry({ success: 1, failed: 0 });

  info("Start 5 failed requests");
  for (
    let i = 0;
    i < SearchSuggestionController.MAX_OHTTP_FAILURES_BEFORE_FALLBACK;
    i++
  ) {
    info(`Failed request ${i + 1}`);
    await do_failed_request(controller);
  }

  await assertTelemetry({ success: 1, failed: 5 });

  // Reset fog for easier counting.
  Services.fog.testResetFOG();

  info("Request should fallback to direct HTTP");
  await do_request_expect_fallback_direct(controller);
  await assertTelemetry({ success: 0, failed: 0 });

  info("Request should fallback to direct HTTP with longer time in past");
  // Subtract an hour.
  controller._ohttpLastFailureTimeMs -= 1 * 60 * 60 * 1000;
  await do_request_expect_fallback_direct(controller);
  await assertTelemetry({ success: 0, failed: 0 });

  info("Requests should resume OHTTP after time has expired, but an extra");
  info("failed request should not cause fallback straight away.");
  controller._ohttpLastFailureTimeMs -= (1 * 60 + 1) * 60 * 1000;
  await do_failed_request(controller);
  await assertTelemetry({ success: 0, failed: 1 });

  // Subtract a second hour and a little bit.
  await do_successful_request(controller);
  await assertTelemetry({ success: 1, failed: 1 });
});

async function assertTelemetry({ success, failed }) {
  Assert.equal(
    Glean.searchSuggestionsOhttp.requestCounter
      .get(ENGINE_ID, "success")
      .testGetValue(),
    success ? success : null,
    `Should ${success ? "" : "not "}have incremented the successes`
  );

  for (
    let i = 1;
    i <= SearchSuggestionController.MAX_OHTTP_FAILURES_BEFORE_FALLBACK;
    i++
  ) {
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(ENGINE_ID, "failed" + i)
        .testGetValue(),
      failed >= i ? 1 : null,
      `Should ${success ? "" : "not "}have incremented failed${i}`
    );
  }
}
