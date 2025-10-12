/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests whether the suggestion count telemetry is correctly divided
 * into {successful, aborted, failed}, and whether it is only recorded
 * for config search engines.
 */

"use strict";

const { SearchSuggestionController } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs"
);
const { ObliviousHTTP } = ChromeUtils.importESModule(
  "resource://gre/modules/ObliviousHTTP.sys.mjs"
);

let openSearchEngine, workingAppEngine, failingAppEngine;

add_setup(async function () {
  // Initialize Glean.
  do_get_profile();
  Services.fog.initializeFOG();
  // Initialize sjs server early so we have access to gHttpURL.
  let server = useHttpServer();
  server.registerContentType("sjs", "sjs");

  consoleAllowList = consoleAllowList.concat([
    "SearchSuggestionController found an unexpected string value",
  ]);

  SearchTestUtils.setRemoteSettingsConfig([
    {
      identifier: "workingAppEngine",
      base: {
        urls: {
          suggestions: {
            base: `${gHttpURL}/sjs/searchSuggestions.sjs`,
            searchTermParamName: "q",
          },
        },
      },
    },
    {
      identifier: "failingAppEngine",
      base: {
        urls: {
          suggestions: {
            base: "http://example.invalid/",
            searchTermParamName: "q",
          },
        },
      },
    },
  ]);
  await Services.search.init();

  let openSearchEngineData = {
    baseURL: `${gHttpURL}/sjs/`,
    name: "GET suggestion engine",
    method: "GET",
  };

  openSearchEngine = await SearchTestUtils.installOpenSearchEngine({
    url: `${gHttpURL}/sjs/engineMaker.sjs?${JSON.stringify(openSearchEngineData)}`,
  });
  workingAppEngine = Services.search.getEngineById("workingAppEngine");
  failingAppEngine = Services.search.getEngineById("failingAppEngine");

  // Set up OHTTP as well, this currently won't be used unless the
  // `SearchSuggestionController.oHTTPEngineId` matches the active engine.
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

  sinon.stub(ObliviousHTTP, "getOHTTPConfig").resolves({});
  sinon.stub(ObliviousHTTP, "ohttpRequest").callsFake(() => {
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
                  suggestions: ["mo", ["Mozilla", "modern", "mom"]],
                },
              },
            },
          ],
        }),
      ok: true,
    };
  });
});

async function success_test(testOhttp) {
  for (let i = 0; i < 5; i++) {
    let controller = new SearchSuggestionController();
    let result = await controller.fetch({
      searchString: "mo",
      inPrivateBrowsing: false,
      engine: workingAppEngine,
    });
    Assert.equal(result.remote.length, 3);
  }

  if (testOhttp) {
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(workingAppEngine.id, "success")
        .testGetValue(),
      5,
      "Successful OHTTP request counter is correctly updated"
    );
  } else {
    Assert.equal(
      Glean.searchSuggestions.successfulRequests.workingAppEngine.testGetValue(),
      5,
      "Successful HTTP request counter is correctly updated"
    );
  }
}
add_task(async function test_success() {
  await success_test(false);

  SearchSuggestionController.oHTTPEngineId = workingAppEngine.id;

  await success_test(true);

  SearchSuggestionController.oHTTPEngineId = "not-matching";
});

async function abort_test(testOhttp) {
  let controller = new SearchSuggestionController();

  // Don't await the result to trigger the abort handler.
  controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: workingAppEngine,
  });
  controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: workingAppEngine,
  });
  controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: workingAppEngine,
  });
  controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: workingAppEngine,
  });
  await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: workingAppEngine,
  });

  if (testOhttp) {
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(workingAppEngine.id, "success")
        .testGetValue(),
      6, // 1 new + 5 from the previous test.
      "Successful OHTTP request counter is correctly updated"
    );
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(workingAppEngine.id, "aborted")
        .testGetValue(),
      4,
      "Aborted OHTTP request counter is correctly updated"
    );
  } else {
    Assert.equal(
      Glean.searchSuggestions.successfulRequests.workingAppEngine.testGetValue(),
      6, // 1 new + 5 from the previous test.
      "Successful HTTP request counter is correctly updated"
    );
    Assert.equal(
      Glean.searchSuggestions.abortedRequests.workingAppEngine.testGetValue(),
      4,
      "Aborted HTTP request counter is correctly updated"
    );
  }
}

add_task(async function test_abort() {
  await abort_test(false);

  SearchSuggestionController.oHTTPEngineId = workingAppEngine.id;

  await abort_test(true);

  SearchSuggestionController.oHTTPEngineId = "not-matching";
});

async function nonConfig_test(testOhttp) {
  let controller = new SearchSuggestionController();
  let result = await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: openSearchEngine,
  });
  Assert.equal(result.remote.length, 3);

  if (testOhttp) {
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get("other", "success")
        .testGetValue(),
      1,
      "Telemetry is recorded for non-config-engines for oHTTP"
    );
  } else {
    Assert.equal(
      Glean.searchSuggestions.successfulRequests.openSearchEngine.testGetValue(),
      null,
      "No telemetry is recorded for non-config-engine"
    );
  }
}

add_task(async function test_nonConfig() {
  await nonConfig_test(false);

  SearchSuggestionController.oHTTPEngineId = openSearchEngine.id;

  await nonConfig_test(true);

  SearchSuggestionController.oHTTPEngineId = "not-matching";
});

async function error_test(testOhttp) {
  let controller = new SearchSuggestionController();
  await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: failingAppEngine,
  });
  await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: failingAppEngine,
  });
  await controller.fetch({
    searchString: "mo",
    inPrivateBrowsing: false,
    engine: failingAppEngine,
  });

  if (testOhttp) {
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(failingAppEngine.id, "failed1")
        .testGetValue(),
      1,
      "Failed1 has been updated for OHTTP request counter"
    );
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(failingAppEngine.id, "failed2")
        .testGetValue(),
      1,
      "Failed2 has been updated for OHTTP request counter"
    );
    Assert.equal(
      Glean.searchSuggestionsOhttp.requestCounter
        .get(failingAppEngine.id, "failed3")
        .testGetValue(),
      1,
      "Failed3 has been updated for OHTTP request counter"
    );
  } else {
    Assert.equal(
      Glean.searchSuggestions.failedRequests.failingAppEngine.testGetValue(),
      3,
      "Failed HTTP request counter is correctly updated"
    );
  }
}

// Run this test last, as it changes the ObliviousHTTP.ohttpRequest stub.
add_task(async function test_error() {
  await error_test(false);

  SearchSuggestionController.oHTTPEngineId = failingAppEngine.id;

  ObliviousHTTP.ohttpRequest.callsFake(() => {
    return {
      status: 500,
      json: async () =>
        Promise.resolve({
          suggestions: [],
        }),
      ok: true,
    };
  });

  await error_test(true);

  SearchSuggestionController.oHTTPEngineId = "not-matching";
});
