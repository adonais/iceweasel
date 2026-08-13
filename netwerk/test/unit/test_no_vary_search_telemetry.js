/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that Glean telemetry is recorded correctly for the No-Vary-Search
// caching extension.
//
// Coverage:
//  - network.no_vary_search_header_received: incremented when a cacheable
//    response carries the No-Vary-Search header.
//  - network.no_vary_search_rule_type: breakdown of which rule form was sent.
//  - network.no_vary_search_parse_error: malformed headers counted.
//  - network.no_vary_search_match (matched/not_matched): outcome of a
//    secondary cache lookup driven by NVS.
//  - network.no_vary_search_hit_by_rule: per-rule breakdown of NVS wins.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let gHttpServer;
let gPort;
const PATH = "/nvs";

// Serves a cacheable response. The No-Vary-Search header value is taken from
// the "nvs" query parameter so each task can exercise a different rule.
function nvsHandler(metadata, response) {
  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Cache-Control", "max-age=10000", false);

  let nvs = null;
  for (let pair of metadata.queryString.split("&")) {
    let eq = pair.indexOf("=");
    if (eq !== -1 && pair.slice(0, eq) === "nvs") {
      nvs = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  if (nvs) {
    response.setHeader("No-Vary-Search", nvs, false);
  }
  const body = "ok";
  response.bodyOutputStream.write(body, body.length);
}

function uri(query) {
  return `http://localhost:${gPort}${PATH}?${query}`;
}

function fetchURI(spec) {
  return new Promise(resolve => {
    let chan = NetUtil.newChannel({
      uri: spec,
      loadUsingSystemPrincipal: true,
    });
    chan.asyncOpen(new ChannelListener(resolve, null, CL_ALLOW_UNKNOWN_CL));
  });
}

add_setup(function () {
  do_get_profile();
  Services.fog.initializeFOG();
  Services.prefs.setBoolPref("network.cache.no_vary_search", true);

  gHttpServer = new HttpServer();
  gHttpServer.registerPathHandler(PATH, nvsHandler);
  gHttpServer.start(-1);
  gPort = gHttpServer.identity.primaryPort;

  registerCleanupFunction(() => {
    gHttpServer.stop(() => {});
    Services.prefs.clearUserPref("network.cache.no_vary_search");
  });
});

// A cacheable response with No-Vary-Search: params=("utm") is stored.
// A follow-up request differing only in the ignored "utm" param should be a
// cache hit won by NVS (matched), attributed to the blocklist rule.
add_task(async function test_blocklist_hit() {
  Services.fog.testResetFOG();
  Services.cache2.clear();

  const nvs = encodeURIComponent('params=("utm")');
  // Prime the cache.
  await fetchURI(uri(`nvs=${nvs}&a=1`));

  Assert.equal(
    Glean.network.noVarySearchHeaderReceived.testGetValue(),
    1,
    "header received once"
  );
  Assert.equal(
    Glean.network.noVarySearchRuleType.blocklist.testGetValue(),
    1,
    "rule recorded as blocklist"
  );

  // Variant differing only in the ignored "utm" param -> NVS hit.
  await fetchURI(uri(`nvs=${nvs}&a=1&utm=email`));

  Assert.equal(
    Glean.network.noVarySearchMatch.matched.testGetValue(),
    1,
    "one cache hit won by NVS"
  );
  Assert.equal(
    Glean.network.noVarySearchHitByRule.blocklist.testGetValue(),
    1,
    "win attributed to blocklist rule"
  );
  Assert.equal(
    Glean.network.noVarySearchMatch.not_matched.testGetValue(),
    null,
    "no not_matched in this scenario"
  );
});

// A lookup that finds a candidate but the significant param differs ->
// not_matched (NVS could not help).
add_task(async function test_not_matched() {
  Services.fog.testResetFOG();
  Services.cache2.clear();

  const nvs = encodeURIComponent('params=("utm")');
  // Prime the cache with a=1.
  await fetchURI(uri(`nvs=${nvs}&a=1`));

  // Confirm the secondary index is populated: a variant differing only in the
  // ignored "utm" param must produce a NVS match.
  await fetchURI(uri(`nvs=${nvs}&a=1&utm=seed`));
  Assert.equal(
    Glean.network.noVarySearchMatch.matched.testGetValue(),
    1,
    "precondition: secondary index is populated"
  );
  Assert.equal(
    Glean.network.noVarySearchMatch.not_matched.testGetValue(),
    null,
    "non-equivalent variant counted as not_matched"
  );
  await fetchURI(uri(`nvs=${nvs}&a=2`));

  Assert.equal(
    Glean.network.noVarySearchMatch.matched.testGetValue(),
    1,
    "no NVS win in this scenario"
  );
  Assert.equal(
    Glean.network.noVarySearchMatch.not_matched.testGetValue(),
    1,
    "non-equivalent variant counted as not_matched"
  );
});

// params (ignore-all) -> IgnoreAll rule; any differing query param is ignored.
add_task(async function test_ignore_all_hit() {
  Services.fog.testResetFOG();
  Services.cache2.clear();

  const nvs = encodeURIComponent("params");
  await fetchURI(uri(`nvs=${nvs}&x=1`));

  Assert.equal(
    Glean.network.noVarySearchRuleType.ignore_all.testGetValue(),
    1,
    "rule recorded as ignore_all"
  );

  await fetchURI(uri(`nvs=${nvs}&x=99&y=hello`));

  Assert.equal(
    Glean.network.noVarySearchMatch.matched.testGetValue(),
    1,
    "ignore_all: variant with different params is a NVS hit"
  );
  Assert.equal(
    Glean.network.noVarySearchHitByRule.ignore_all.testGetValue(),
    1,
    "win attributed to ignore_all rule"
  );
});

// params=("a"), except=("b") is an invalid combination -> parse error,
// falls back to ExactMatch.
add_task(async function test_parse_error() {
  Services.fog.testResetFOG();
  Services.cache2.clear();

  const bad = encodeURIComponent('params=("a"), except=("b")');
  await fetchURI(uri(`nvs=${bad}&x=1`));

  Assert.equal(
    Glean.network.noVarySearchParseError.testGetValue(),
    1,
    "malformed header counted as parse error"
  );
  Assert.equal(
    Glean.network.noVarySearchRuleType.exact_match.testGetValue(),
    1,
    "malformed header falls back to exact_match rule"
  );
});
