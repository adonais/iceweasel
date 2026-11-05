/**
 * Bug 1706616 - Testing the URL query string stripping telemetry.
 */

"use strict";

const TEST_URI = TEST_DOMAIN + TEST_PATH + "file_stripping.html";
const TEST_THIRD_PARTY_URI = TEST_DOMAIN_2 + TEST_PATH + "file_stripping.html";
const TEST_REDIRECT_URI = TEST_DOMAIN + TEST_PATH + "redirect.sjs";

const LABEL_NAVIGATION = "Navigation";
const LABEL_REDIRECT = "Redirect";
const LABEL_STRIP_FOR_NAVIGATION = "StripForNavigation";
const LABEL_STRIP_FOR_REDIRECT = "StripForRedirect";

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

// Returns null while the label has not recorded anything yet. The stripping can
// happen in either the parent or a content process, so flush the children on
// every poll and read the value Glean aggregated in the parent.
async function getStripCount(label, checkCntFn) {
  let cnt;

  await TestUtils.waitForCondition(async () => {
    await Services.fog.testFlushAllChildren();
    cnt = Glean.contentblocking.queryStrippingCount[label].testGetValue();

    return checkCntFn ? checkCntFn(cnt) : cnt != null;
  }, `waiting for queryStrippingCount label ${label} to appear`);

  return cnt;
}

async function checkStripCount(expectedCnt, label) {
  let cnt = await getStripCount(label, cnt => cnt == expectedCnt);

  is(cnt, expectedCnt, "There should be expected count in telemetry.");
}

// The label is expected to have recorded nothing at all, so there is no value
// to wait for; just make sure anything already in flight has landed.
async function checkNoStripCount(label) {
  await Services.fog.testFlushAllChildren();

  is(
    Glean.contentblocking.queryStrippingCount[label].testGetValue(),
    null,
    `There should be no count for ${label} in telemetry.`
  );
}

// The legacy probe was an exponential histogram, so the old assertions checked
// that a sample landed in the bucket for the expected value. Checking the
// distribution's sum and count instead pins the recorded values exactly.
async function checkParamCount(expectedSample, expectedCount) {
  let distribution;

  await TestUtils.waitForCondition(async () => {
    await Services.fog.testFlushAllChildren();
    distribution =
      Glean.contentblocking.queryStrippingParamCount.testGetValue();

    return distribution?.count == expectedCount;
  }, "waiting for queryStrippingParamCount to appear");

  is(
    distribution.count,
    expectedCount,
    `There should be ${expectedCount} param count sample(s).`
  );
  is(
    distribution.sum,
    expectedSample * expectedCount,
    `Each param count sample should be ${expectedSample}.`
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.query_stripping.enabled", true],
      [
        "privacy.query_stripping.strip_list",
        "paramToStrip paramToStripB paramToStripC paramToStripD",
      ],
    ],
  });

  // Clear Telemetry probes before testing.
  await clearTelemetry();
});

add_task(async function testQueryStrippingNavigationInParent() {
  let testURI = TEST_URI + "?paramToStrip=value";

  // Open a new tab and trigger the query stripping.
  await BrowserTestUtils.withNewTab(testURI, async browser => {
    // Verify if the query string was happened.
    await verifyQueryString(browser, "");
  });

  // Verify the telemetry probe.
  await checkStripCount(1, LABEL_STRIP_FOR_NAVIGATION);
  await checkParamCount(1, 1);

  // Because there would be some loading happening during the test and they
  // could interfere the count here. So, we only verify if the counter is
  // increased, but not the exact count.
  let newNavigationCnt = await getStripCount(LABEL_NAVIGATION, cnt => cnt > 0);
  ok(newNavigationCnt > 0, "There is navigation count added.");

  await clearTelemetry();
});

add_task(async function testQueryStrippingNavigationInContent() {
  let testThirdPartyURI = TEST_THIRD_PARTY_URI + "?paramToStrip=value";

  await BrowserTestUtils.withNewTab(TEST_URI, async browser => {
    // Create the promise to wait for the location change.
    let locationChangePromise = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      TEST_THIRD_PARTY_URI
    );

    // Trigger the navigation by script.
    await SpecialPowers.spawn(browser, [testThirdPartyURI], async url => {
      content.postMessage({ type: "script", url }, "*");
    });

    await locationChangePromise;

    // Verify if the query string was happened.
    await verifyQueryString(browser, "");
  });

  // Verify the telemetry probe.
  await checkStripCount(1, LABEL_STRIP_FOR_NAVIGATION);
  await checkParamCount(1, 1);

  // Check if the navigation count is increased.
  let newNavigationCnt = await getStripCount(LABEL_NAVIGATION, cnt => cnt > 0);
  ok(newNavigationCnt > 0, "There is navigation count added.");

  await clearTelemetry();
});

add_task(async function testQueryStrippingNavigationInContentQueryCount() {
  let testThirdPartyURI =
    TEST_THIRD_PARTY_URI +
    "?paramToStrip=value&paramToStripB=valueB&paramToStripC=valueC&paramToStripD=valueD";

  await BrowserTestUtils.withNewTab(TEST_URI, async browser => {
    // Create the promise to wait for the location change.
    let locationChangePromise = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      TEST_THIRD_PARTY_URI
    );

    // Trigger the navigation by script.
    await SpecialPowers.spawn(browser, [testThirdPartyURI], async url => {
      content.postMessage({ type: "script", url }, "*");
    });

    await locationChangePromise;

    // Verify if the query string was happened.
    await verifyQueryString(browser, "");
  });

  // Verify the telemetry probe.
  await checkStripCount(1, LABEL_STRIP_FOR_NAVIGATION);

  await checkParamCount(4, 1);

  // Check if the navigation count is increased.
  let newNavigationCnt = await getStripCount(LABEL_NAVIGATION, cnt => cnt > 0);
  ok(newNavigationCnt > 0, "There is navigation count added.");

  await clearTelemetry();
});

add_task(async function testQueryStrippingRedirect() {
  let testThirdPartyURI = `${TEST_REDIRECT_URI}?${TEST_THIRD_PARTY_URI}?paramToStrip=value`;

  await BrowserTestUtils.withNewTab(TEST_URI, async browser => {
    // Create the promise to wait for the location change.
    let locationChangePromise = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      TEST_THIRD_PARTY_URI
    );

    // Trigger the redirect.
    await SpecialPowers.spawn(browser, [testThirdPartyURI], async url => {
      content.postMessage({ type: "script", url }, "*");
    });

    await locationChangePromise;

    // Verify if the query string was happened.
    await verifyQueryString(browser, "");
  });

  // Verify the telemetry probe in parent process. Note that there is no
  // non-test loading is using redirect. So, we can check the exact count here.
  await checkStripCount(1, LABEL_STRIP_FOR_REDIRECT);
  await checkStripCount(1, LABEL_REDIRECT);
  await checkParamCount(1, 1);

  await clearTelemetry();
});

add_task(async function testQueryStrippingDisabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.query_stripping.enabled", false]],
  });

  // First, test the navigation in parent process.
  let testURI = TEST_URI + "?paramToStrip=value";

  // Open a new tab and trigger the query stripping.
  await BrowserTestUtils.withNewTab(testURI, async browser => {
    // Verify if the query string was not happened.
    await verifyQueryString(browser, "paramToStrip=value");
  });

  // Verify the telemetry probe. There should be no stripped navigation count.
  await checkNoStripCount(LABEL_STRIP_FOR_NAVIGATION);
  // Check if the navigation count is increased.
  let newNavigationCnt = await getStripCount(LABEL_NAVIGATION, cnt => cnt > 0);
  ok(newNavigationCnt > 0, "There is navigation count added.");

  // Second, test the navigation in content.
  let testThirdPartyURI = TEST_THIRD_PARTY_URI + "?paramToStrip=value";

  await BrowserTestUtils.withNewTab(TEST_URI, async browser => {
    // Create the promise to wait for the location change.
    let locationChangePromise = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      testThirdPartyURI
    );

    // Trigger the navigation by script.
    await SpecialPowers.spawn(browser, [testThirdPartyURI], async url => {
      content.postMessage({ type: "script", url }, "*");
    });

    await locationChangePromise;

    // Verify if the query string was happened.
    await verifyQueryString(browser, "paramToStrip=value");
  });

  // Verify the telemetry probe in content process. There should be no stripped
  // navigation count.
  await checkNoStripCount(LABEL_STRIP_FOR_NAVIGATION);
  // Check if the navigation count is increased.
  newNavigationCnt = await getStripCount(LABEL_NAVIGATION, cnt => cnt > 0);
  ok(newNavigationCnt > 0, "There is navigation count added.");

  // Third, test the redirect.
  testThirdPartyURI = `${TEST_REDIRECT_URI}?${TEST_THIRD_PARTY_URI}?paramToStrip=value`;

  await BrowserTestUtils.withNewTab(TEST_URI, async browser => {
    // Create the promise to wait for the location change.
    let locationChangePromise = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      `${TEST_THIRD_PARTY_URI}?paramToStrip=value`
    );

    // Trigger the redirect.
    await SpecialPowers.spawn(browser, [testThirdPartyURI], async url => {
      content.postMessage({ type: "script", url }, "*");
    });

    await locationChangePromise;

    // Verify if the query string was happened.
    await verifyQueryString(browser, "paramToStrip=value");
  });

  // Verify the telemetry probe. The stripped redirect count should not exist.
  await checkNoStripCount(LABEL_STRIP_FOR_REDIRECT);
  await checkStripCount(1, LABEL_REDIRECT);

  await clearTelemetry();
});
