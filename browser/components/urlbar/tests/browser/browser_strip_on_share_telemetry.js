"use strict";

let listService;

/**
 * Asserts a Glean custom distribution holds the expected samples. Every
 * recorded sample is expected to be `expectedSample`, so the distribution's
 * sum is that value repeated `expectedCount` times.
 *
 * @param {"stripOnShareParamsRemoved"|"stripOnShareLengthDecrease"} name
 *   Name of the metric on `Glean.contentblocking`.
 * @param {number} expectedSample
 *   Value each recorded sample is expected to have.
 * @param {number} expectedCount
 *   Number of samples expected in the distribution.
 */
function assertDistribution(name, expectedSample, expectedCount) {
  let distribution = Glean.contentblocking[name].testGetValue();

  Assert.ok(distribution, `${name} should have been recorded`);
  Assert.equal(
    distribution?.count,
    expectedCount,
    `${name} should have ${expectedCount} sample(s)`
  );
  Assert.equal(
    distribution?.sum,
    expectedSample * expectedCount,
    `${name} sample(s) should each be ${expectedSample}`
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.query_stripping.strip_on_share.enabled", true],
      ["privacy.query_stripping.enabled", false],
    ],
  });

  // Get the list service so we can wait for it to be fully initialized before running tests.
  listService = Cc["@mozilla.org/query-stripping-list-service;1"].getService(
    Ci.nsIURLQueryStrippingListService
  );

  await listService.testWaitForInit();
});

// Checking telemetry for single query params being stripped
add_task(async function testSingleQueryParam() {
  let originalURI = "https://www.example.com/?utm_source=1";
  let strippedURI = "https://www.example.com/";

  // Calculating length difference between URLs to check correct telemetry sample
  let lengthDiff = originalURI.length - strippedURI.length;

  Services.fog.testResetFOG();

  await testStripOnShare(originalURI, strippedURI);

  // A sample of "1" is being checked as 1 Query Param is being stripped
  assertDistribution("stripOnShareParamsRemoved", 1, 1);
  assertDistribution("stripOnShareLengthDecrease", lengthDiff, 1);

  await testStripOnShare(originalURI, strippedURI);

  assertDistribution("stripOnShareParamsRemoved", 1, 2);
  assertDistribution("stripOnShareLengthDecrease", lengthDiff, 2);
});

// Checking telemetry for mutliple query params being stripped
add_task(async function testMultiQueryParams() {
  let originalURI = "https://www.example.com/?utm_source=1&utm_ad=1&utm_id=1";
  let strippedURI = "https://www.example.com/";

  // Calculating length difference between URLs to check correct telemetry sample
  let lengthDiff = originalURI.length - strippedURI.length;

  Services.fog.testResetFOG();

  await testStripOnShare(originalURI, strippedURI);

  // A sample of "3" is being checked as 3 Query Params are being stripped
  assertDistribution("stripOnShareParamsRemoved", 3, 1);
  assertDistribution("stripOnShareLengthDecrease", lengthDiff, 1);

  await testStripOnShare(originalURI, strippedURI);

  assertDistribution("stripOnShareParamsRemoved", 3, 2);
  assertDistribution("stripOnShareLengthDecrease", lengthDiff, 2);
});

async function testStripOnShare(validUrl, strippedUrl) {
  await BrowserTestUtils.withNewTab(validUrl, async function () {
    gURLBar.focus();
    gURLBar.select();
    // Make sure the clean copy of the link will be copied to the clipboard
    await SimpleTest.promiseClipboardChange(strippedUrl, async () => {
      await UrlbarTestUtils.activateContextMenuItem(window, "strip-on-share");
    });
  });
}
