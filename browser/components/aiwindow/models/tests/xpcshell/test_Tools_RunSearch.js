/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const {
  TOOLS,
  toolsConfig,
  RunSearch,
  RUN_SEARCH_VERBATIM_QUERY_DESCRIPTION,
  RUN_SEARCH_GENERATED_QUERY_DESCRIPION,
  RUN_SEARCH_TOOL_CONFIG_VERBATIM_QUERY,
  RUN_SEARCH_TOOL_CONFIG_GENERATED_QUERY,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

add_task(async function test_run_search_is_callable() {
  Assert.strictEqual(
    typeof RunSearch.runSearch,
    "function",
    "RunSearch.runSearch should be a function"
  );
});

add_task(async function test_run_search_not_in_default_registry() {
  // run_search is offered dynamically as the fallback after search_the_web
  // (see maybeApplySearchTheWebPostExecution), not registered as a default
  // tool, so it should be absent from both TOOLS and toolsConfig.
  Assert.ok(
    !TOOLS.includes("run_search"),
    "run_search should not be in the default TOOLS registry"
  );
  Assert.ok(
    !toolsConfig.some(t => t.function?.name === "run_search"),
    "run_search should not be in the default toolsConfig"
  );
});

add_task(async function test_run_search_tool_configs() {
  // Verbatim variant (first turn): verbatim description, no query parameter.
  Assert.equal(
    RUN_SEARCH_TOOL_CONFIG_VERBATIM_QUERY.function.name,
    "run_search",
    "Verbatim config should be the run_search tool"
  );
  Assert.equal(
    RUN_SEARCH_TOOL_CONFIG_VERBATIM_QUERY.function.description,
    RUN_SEARCH_VERBATIM_QUERY_DESCRIPTION,
    "Verbatim config should use the verbatim search-query description"
  );
  Assert.deepEqual(
    RUN_SEARCH_TOOL_CONFIG_VERBATIM_QUERY.function.parameters.properties,
    {},
    "Verbatim config should have no query parameter"
  );

  // Generated variant (subsequent turns): generated description, query param.
  Assert.equal(
    RUN_SEARCH_TOOL_CONFIG_GENERATED_QUERY.function.description,
    RUN_SEARCH_GENERATED_QUERY_DESCRIPION,
    "Generated config should use the generated search-query description"
  );
  const generatedParams =
    RUN_SEARCH_TOOL_CONFIG_GENERATED_QUERY.function.parameters;
  Assert.equal(
    generatedParams.properties.query.type,
    "string",
    "Generated config query parameter should be a string"
  );
  Assert.ok(
    generatedParams.required.includes("query"),
    "Generated config should require the query parameter"
  );
});

add_task(async function test_run_search_empty_query_returns_error() {
  const result = await RunSearch.runSearch({ query: "" });
  Assert.ok(
    result.includes("Error"),
    "Empty query should return an error string"
  );
});

add_task(async function test_run_search_null_query_returns_error() {
  const result = await RunSearch.runSearch({ query: null });
  Assert.ok(
    result.includes("Error"),
    "Null query should return an error string"
  );
});

add_task(async function test_run_search_whitespace_query_returns_error() {
  const result = await RunSearch.runSearch({ query: "   " });
  Assert.ok(
    result.includes("Error"),
    "Whitespace-only query should return an error string"
  );
});

add_task(async function test_run_search_no_browsingContext_returns_error() {
  const result = await RunSearch.runSearch({ query: "test query" });
  Assert.ok(
    result.includes("Error"),
    "No browsingContext should return an error string"
  );
  Assert.ok(
    result.includes("no browsingContext provided"),
    "Error should mention no browsingContext provided"
  );
});

function createFakeSearchContext() {
  const fakeTab = { selected: true };
  const fakeWin = {
    closed: false,
    gBrowser: {
      getTabForBrowser: () => fakeTab,
      addProgressListener(listener) {
        listener.onStateChange(
          null,
          null,
          Ci.nsIWebProgressListener.STATE_STOP |
            Ci.nsIWebProgressListener.STATE_IS_NETWORK
        );
      },
      removeProgressListener() {},
    },
  };
  return {
    browsingContext: {
      topChromeWindow: fakeWin,
      embedderElement: {
        currentURI: Services.io.newURI("https://example.com"),
      },
    },
  };
}

add_task(async function test_runSearch_sets_security_flags() {
  const fakeContext = createFakeSearchContext();
  const conversation = makeConversation();
  const result = await RunSearch.runSearch(
    { query: "test query" },
    fakeContext.browsingContext,
    conversation
  );
  conversation.securityProperties.commit();

  Assert.ok(result.includes("Error"), "Expected an error result from the mock");
  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "private_data flag set"
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    true,
    "untrusted_input flag set"
  );
});

add_task(async function test_runSearch_allowed_when_flags_set() {
  const fakeContext = createFakeSearchContext();
  const conversation = makeConversation({
    privateData: true,
    untrustedInput: true,
  });
  const result = await RunSearch.runSearch(
    { query: "test query" },
    fakeContext.browsingContext,
    conversation
  );

  Assert.ok(result.includes("Error"), "no security refusal");
});

add_task(async function test_runSearch_no_security_flags_on_early_exit() {
  const conversation = makeConversation();
  await RunSearch.runSearch({ query: "" }, {}, conversation);
  conversation.securityProperties.commit();
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "flag not set early"
  );
});

add_task(async function test_run_search_closed_window_returns_error() {
  const result = await RunSearch.runSearch(
    { query: "test query" },
    { browsingContext: { topChromeWindow: { closed: true } } }
  );
  Assert.ok(
    result.includes("Error"),
    "Closed window should return an error string"
  );
  Assert.ok(
    result.includes("not available or closed"),
    "Error should mention window not available or closed"
  );
});

add_task(
  async function test_run_search_uses_context_browsingContext_when_provided() {
    const result = await RunSearch.runSearch(
      { query: "test query" },
      { browsingContext: { topChromeWindow: { closed: true } } }
    );
    Assert.ok(
      result.includes("Error"),
      "Closed window from browsingContext should return an error string"
    );
  }
);
