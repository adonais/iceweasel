"use strict";

const TEST_URI = TEST_DOMAIN + TEST_PATH + "file_stripping.html";

async function clearTelemetry() {
  // Drain what the content processes have buffered before resetting, otherwise
  // it can arrive after the reset and be counted against the next check.
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  ok(true, "Telemetry has been cleared.");
}

async function verifyQueryString(browser, expected) {
  await SpecialPowers.spawn(browser, [expected], expected => {
    // Strip the first question mark.
    let search = content.location.search.slice(1);

    is(search, expected, "The query string is correct.");
  });
}

async function testTelemetry(queryParamToCount) {
  let expected = {};
  Object.entries(queryParamToCount).forEach(([key, value]) => {
    // In debug builds we perform additional stripping for testing, which
    // results in telemetry being recorded twice. This does not impact
    // production builds.
    expected[`param_${key}`] = SpecialPowers.isDebugBuild ? value * 2 : value;
  });

  await Services.fog.testFlushAllChildren();
  let actual =
    Glean.contentblocking.queryStrippingCountByParam.testGetValue() ?? {};

  // Params that are stripped but deliberately not broken out per-param in the
  // metric definition land in __other__, which this test does not assert on.
  delete actual.__other__;

  Assert.deepEqual(
    actual,
    expected,
    "queryStrippingCountByParam should have the expected count per label."
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.query_stripping.enabled", true],
      [
        "privacy.query_stripping.strip_list",
        "foo mc_eid oly_anon_id oly_enc_id __s vero_id _hsenc mkt_tok fbclid ysclid",
      ],
    ],
  });

  // Clear Telemetry probes before testing.
  await clearTelemetry();
});

/**
 * Tests the queryStrippingCountByParam telemetry which counts how often query
 * params from a predefined lists are stripped.
 */
add_task(async function test_queryParamCountTelemetry() {
  info("Test with a query params to be stripped and recoded in telemetry.");
  let url = new URL(TEST_URI);
  url.searchParams.set("mc_eid", "myValue");

  // Open a new tab and trigger the query stripping.
  await BrowserTestUtils.withNewTab(url.href, async browser => {
    // Verify that the tracking query param has been stripped.
    await verifyQueryString(browser, "");
  });

  await testTelemetry({ mc_eid: 1 });

  // Repeat this with the same query parameter, the respective histogram bucket
  // should be incremented.
  await BrowserTestUtils.withNewTab(url.href, async browser => {
    await verifyQueryString(browser, "");
  });

  await testTelemetry({ mc_eid: 2 });

  url = new URL(TEST_URI);
  url.searchParams.set("fbclid", "myValue2");
  url.searchParams.set("mkt_tok", "myValue3");
  url.searchParams.set("bar", "foo");

  info("Test with multiple query params to be stripped.");
  await BrowserTestUtils.withNewTab(url.href, async browser => {
    await verifyQueryString(browser, "bar=foo");
  });
  await testTelemetry({ mc_eid: 2, fbclid: 1, mkt_tok: 1 });

  info(
    "Test with query param on the strip-list, which should not be recoded in telemetry."
  );
  url = new URL(TEST_URI);
  url.searchParams.set("foo", "bar");
  url.searchParams.set("__s", "myValue4");
  url.searchParams.set("ysclid", "myValue5");
  await BrowserTestUtils.withNewTab(url.href, async browser => {
    await verifyQueryString(browser, "");
  });
  await testTelemetry({ mc_eid: 2, fbclid: 1, mkt_tok: 1, __s: 1, ysclid: 1 });

  url = new URL(TEST_URI);
  url.searchParams.set("foo", "bar");
  await BrowserTestUtils.withNewTab(url.href, async browser => {
    await verifyQueryString(browser, "");
  });
  await testTelemetry({ mc_eid: 2, fbclid: 1, mkt_tok: 1, __s: 1, ysclid: 1 });

  await clearTelemetry();
});
