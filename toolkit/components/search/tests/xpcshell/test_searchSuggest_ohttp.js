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

let configEngine;

add_setup(async function () {
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

  configEngine = Services.search.getEngineById(CONFIG[0].identifier);

  SearchSuggestionController.oHTTPEngineId = CONFIG[0].identifier;

  sinon.stub(ObliviousHTTP, "getOHTTPConfig").resolves({});
  sinon.stub(ObliviousHTTP, "ohttpRequest").callsFake(() => {});
});

add_task(async function test_preference_enabled_telemetry() {
  // The search service was initialised in add_setup after
  // `browser.search.suggest.ohttp.enabled` was set to true, so Glean should
  // have recorded the correct value here.
  Assert.ok(
    Glean.searchSuggestionsOhttp.enabled.testGetValue(),
    "Should have recorded the enabled preference on init"
  );

  Services.prefs.setBoolPref("browser.search.suggest.ohttp.enabled", false);

  Assert.ok(
    !Glean.searchSuggestionsOhttp.enabled.testGetValue(),
    "Should have recorded the enabled preference after toggling it"
  );

  // Reset back to true for the rest of the tests.
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.enabled", true);
});

add_task(async function simple_remote_results_merino() {
  const suggestions = ["Mozilla", "modern", "mom"];

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
                  suggestions: ["mo", suggestions],
                },
              },
            },
          ],
        }),
      ok: true,
    };
  });

  let expectedParams = {
    q: "mo",
    providers: "google_suggest",
    google_suggest_params: new URLSearchParams([
      ["parameter", 14235],
      ["q", "mo"],
    ]),
  };

  // Now do the actual request.
  let controller = new SearchSuggestionController();
  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });
  Assert.equal(result.term, "mo", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    suggestions,
    "Should have the expected remote suggestions"
  );

  assertLatencyCollection(configEngine, true);

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should have requested via OHTTP once"
  );
  let args = ObliviousHTTP.ohttpRequest.firstCall.args;
  Assert.deepEqual(
    args[0],
    "https://example.com/relay",
    "Should have called the Relay URL"
  );
  let url = new URL(args[2]);
  Assert.deepEqual(
    url.origin + url.pathname,
    Services.prefs.getCharPref("browser.urlbar.merino.endpointURL"),
    "Should have the correct URL base"
  );
  for (let [param, value] of Object.entries(expectedParams)) {
    if (URLSearchParams.isInstance(value)) {
      Assert.equal(
        url.searchParams.get(param),
        value.toString(),
        `Should have set the correct value for ${param}`
      );
    } else {
      Assert.equal(
        url.searchParams.get(param),
        value,
        `Should have set the correct value for ${param}`
      );
    }
  }
});

add_task(async function simple_merino_empty_result() {
  // Tests the case when Merino returns an empty response, e.g. due to an error
  // there may be no suggestions returned.

  ObliviousHTTP.ohttpRequest.resetHistory();

  consoleAllowList = consoleAllowList.concat([
    "SearchSuggestionController found an unexpected string value",
  ]);

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

  let expectedParams = {
    q: "mo",
    providers: "google_suggest",
    google_suggest_params: new URLSearchParams([
      ["parameter", 14235],
      ["q", "mo"],
    ]),
  };

  // Now do the actual request.
  let controller = new SearchSuggestionController();
  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });
  Assert.equal(result.term, "mo", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    [],
    "Should have no remote suggestions"
  );

  assertLatencyCollection(configEngine, true);

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should have requested via OHTTP once"
  );
  let args = ObliviousHTTP.ohttpRequest.firstCall.args;
  Assert.deepEqual(
    args[0],
    "https://example.com/relay",
    "Should have called the Relay URL"
  );
  let url = new URL(args[2]);
  Assert.deepEqual(
    url.origin + url.pathname,
    Services.prefs.getCharPref("browser.urlbar.merino.endpointURL"),
    "Should have the correct URL base"
  );
  for (let [param, value] of Object.entries(expectedParams)) {
    if (URLSearchParams.isInstance(value)) {
      Assert.equal(
        url.searchParams.get(param),
        value.toString(),
        `Should have set the correct value for ${param}`
      );
    } else {
      Assert.equal(
        url.searchParams.get(param),
        value,
        `Should have set the correct value for ${param}`
      );
    }
  }
});

add_task(async function simple_remote_results_merino_third_party() {
  let thirdPartyData = {
    baseURL: `${gHttpURL}/sjs/`,
    name: "Third Party",
    method: "GET",
  };
  let thirdPartyEngine = await SearchTestUtils.installOpenSearchEngine({
    url: `${gHttpURL}/sjs/engineMaker.sjs?${JSON.stringify(thirdPartyData)}`,
  });

  SearchSuggestionController.oHTTPEngineId = thirdPartyEngine.id;

  const suggestions = ["Mozilla", "modern", "mom"];

  ObliviousHTTP.ohttpRequest.resetHistory();
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
                  suggestions: ["mo", suggestions],
                },
              },
            },
          ],
        }),
      ok: true,
    };
  });

  let expectedParams = {
    q: "mo",
    providers: "google_suggest",
    google_suggest_params: new URLSearchParams([["q", "mo"]]),
  };

  // Now do the actual request.
  let controller = new SearchSuggestionController();
  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: thirdPartyEngine,
  });
  Assert.equal(result.term, "mo", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    suggestions,
    "Should have the expected remote suggestions"
  );

  assertLatencyCollection(thirdPartyEngine, true);

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should have requested via OHTTP once"
  );
  let args = ObliviousHTTP.ohttpRequest.firstCall.args;
  Assert.deepEqual(
    args[0],
    "https://example.com/relay",
    "Should have called the Relay URL"
  );
  let url = new URL(args[2]);
  Assert.deepEqual(
    url.origin + url.pathname,
    Services.prefs.getCharPref("browser.urlbar.merino.endpointURL"),
    "Should have the correct URL base"
  );
  for (let [param, value] of Object.entries(expectedParams)) {
    if (URLSearchParams.isInstance(value)) {
      Assert.equal(
        url.searchParams.get(param),
        value.toString(),
        `Should have set the correct value for ${param}`
      );
    } else {
      Assert.equal(
        url.searchParams.get(param),
        value,
        `Should have set the correct value for ${param}`
      );
    }
  }
  SearchSuggestionController.oHTTPEngineId = configEngine.id;
});

async function testUsesOHttp() {
  ObliviousHTTP.ohttpRequest.resetHistory();

  const suggestions = ["Mozilla", "modern", "mom"];

  // Now do the actual request.
  let controller = new SearchSuggestionController();
  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });
  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should have requested via OHTTP once"
  );

  Assert.equal(result.term, "mo", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    suggestions,
    "Should have the expected remote suggestions"
  );
}

async function testUsesDirectHTTP(message) {
  ObliviousHTTP.ohttpRequest.resetHistory();

  // Now do the actual request
  let controller = new SearchSuggestionController();
  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: Services.search.defaultEngine,
  });
  Assert.equal(ObliviousHTTP.ohttpRequest.callCount, 0, message);

  Assert.equal(result.term, "mo", "Should have the term matching the query");
  Assert.equal(result.local.length, 0, "Should have no local suggestions");
  Assert.deepEqual(
    result.remote.map(r => r.value),
    ["Mozilla", "modern", "mom"],
    "Should have no remote suggestions"
  );
}

add_task(async function test_merino_not_used_when_ohttp_feature_turned_off() {
  // These should already be set, but we'll set them here again for completeness
  // and clarity within this sub-test.
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.featureGate", true);
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.enabled", true);
  Services.prefs.setCharPref(
    "browser.urlbar.merino.ohttpConfigURL",
    "https://example.com/config"
  );
  Services.prefs.setCharPref(
    "browser.urlbar.merino.ohttpRelayURL",
    "https://example.com/relay"
  );

  // With everything set, we should be using OHTTP.
  await testUsesOHttp();

  // Test turning off the feature gate.
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.featureGate", false);

  await testUsesDirectHTTP(
    "Should not have requested via OHTTP when featureGate is false"
  );

  // Now the OHTTP preference
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.featureGate", true);

  // Test we've re-enabled everything, just in case.
  await testUsesOHttp();

  Services.prefs.setBoolPref("browser.search.suggest.ohttp.enabled", false);

  await testUsesDirectHTTP(
    "Should not have requested via OHTTP when enabled is false"
  );

  // Now the relay preferences.
  Services.prefs.setBoolPref("browser.search.suggest.ohttp.enabled", true);

  // Test we've re-enabled everything, just in case.
  await testUsesOHttp();

  Services.prefs.clearUserPref("browser.urlbar.merino.ohttpConfigURL");

  await testUsesDirectHTTP(
    "Should not have requested via OHTTP when ohttpConfigURL is not defined"
  );

  Services.prefs.setCharPref(
    "browser.urlbar.merino.ohttpConfigURL",
    "https://example.com/config"
  );

  // Test we've re-enabled everything in-between, just in case.
  await testUsesOHttp();

  Services.prefs.clearUserPref("browser.urlbar.merino.ohttpRelayURL");

  await testUsesDirectHTTP(
    "Should not have requested via OHTTP when ohttpRelayURL is not defined"
  );
});

function assertLatencyCollection(engine, shouldRecord) {
  let latencyDistribution =
    Glean.searchSuggestionsOhttp.latency[
      // Third party engines are always recorded as "other".
      engine.isConfigEngine ? engine.id : "other"
    ].testGetValue();

  if (shouldRecord) {
    Assert.deepEqual(
      latencyDistribution.count,
      1,
      "Should have recorded a latency count"
    );
  } else {
    Assert.deepEqual(
      latencyDistribution,
      null,
      "Should not have recorded a latency count"
    );
  }

  Services.fog.testResetFOG();
}
