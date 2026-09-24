/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let { UrlClassifierTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlClassifierTestUtils.sys.mjs"
);

const TEST_EMAIL_WEBAPP_DOMAIN = "https://test1.example.com/";
const EMAIL_TRACKER_DOMAIN = "https://email-tracking.example.org/";

const TEST_EMAIL_WEBAPP_PAGE =
  TEST_EMAIL_WEBAPP_DOMAIN + TEST_PATH + "page.html";

const EMAIL_TRACKER_PAGE = EMAIL_TRACKER_DOMAIN + TEST_PATH + "page.html";
const EMAIL_TRACKER_IMAGE = EMAIL_TRACKER_DOMAIN + TEST_PATH + "raptor.jpg";

const LABEL_BASE_NORMAL = "base_normal";
const LABEL_CONTENT_NORMAL = "content_normal";
const LABEL_BASE_EMAIL_WEBAPP = "base_email_webapp";
const LABEL_CONTENT_EMAIL_WEBAPP = "content_email_webapp";

const EMAIL_TRACKER_COUNT_LABELS = [
  LABEL_BASE_NORMAL,
  LABEL_CONTENT_NORMAL,
  LABEL_BASE_EMAIL_WEBAPP,
  LABEL_CONTENT_EMAIL_WEBAPP,
];

const KEY_BASE_NORMAL = "base_normal";
const KEY_CONTENT_NORMAL = "content_normal";
const KEY_ALL_NORMAL = "all_normal";
const KEY_BASE_EMAILAPP = "base_emailapp";
const KEY_CONTENT_EMAILAPP = "content_emailapp";
const KEY_ALL_EMAILAPP = "all_emailapp";

async function clearTelemetry() {
  Services.telemetry.getSnapshotForHistograms("main", true /* clear */);
  Services.fog.testResetFOG();
}

async function checkEmailTrackerCount(label, expectedCnt) {
  let getCnt = () =>
    Glean.contentblocking.emailTrackerCount[label].testGetValue() ?? 0;

  // Wait until the metric has been recorded.
  await TestUtils.waitForCondition(
    () => getCnt() == expectedCnt,
    `Waiting for the ${label} count to be ${expectedCnt}.`
  );

  is(getCnt(), expectedCnt, "There should be expected count in telemetry.");
}

function checkKeyedHistogram(telemetry, key, bucket, expectedCnt) {
  let labelData = telemetry?.[key];
  let cnt = labelData?.values?.[bucket] || 0;
  is(cnt, expectedCnt, "There should be expected count in keyed telemetry.");
}

function checkNoEmailTrackerCount() {
  for (let label of EMAIL_TRACKER_COUNT_LABELS) {
    is(
      Glean.contentblocking.emailTrackerCount[label].testGetValue(),
      null,
      `No Telemetry has been recorded for ${label}`
    );
  }
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "urlclassifier.features.emailtracking.datacollection.blocklistTables",
        "mochitest5-track-simple",
      ],
      [
        "urlclassifier.features.emailtracking.datacollection.allowlistTables",
        "",
      ],
      [
        "urlclassifier.features.emailtracking.blocklistTables",
        "mochitest5-track-simple",
      ],
      ["urlclassifier.features.emailtracking.allowlistTables", ""],
      ["privacy.trackingprotection.enabled", false],
      ["privacy.trackingprotection.annotate_channels", false],
      ["privacy.trackingprotection.cryptomining.enabled", false],
      ["privacy.trackingprotection.emailtracking.enabled", true],
      [
        "privacy.trackingprotection.emailtracking.data_collection.enabled",
        true,
      ],
      ["privacy.trackingprotection.fingerprinting.enabled", false],
      ["privacy.trackingprotection.socialtracking.enabled", false],
      [
        "privacy.trackingprotection.emailtracking.webapp.domains",
        "test1.example.com",
      ],
    ],
  });

  await UrlClassifierTestUtils.addTestTrackers();

  registerCleanupFunction(function () {
    UrlClassifierTestUtils.cleanupTestTrackers();
  });

  await clearTelemetry();
});

add_task(async function test_email_tracking_telemetry() {
  Services.fog.testResetFOG();
  // Open a non email webapp tab.
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    // Load a image from the email tracker
    let res = await loadImage(browser, EMAIL_TRACKER_IMAGE);

    is(res, false, "The image is blocked.");

    // Verify the telemetry of the email tracker count.
    await checkEmailTrackerCount(LABEL_BASE_NORMAL, 1);
    await checkEmailTrackerCount(LABEL_CONTENT_NORMAL, 0);
    await checkEmailTrackerCount(LABEL_BASE_EMAIL_WEBAPP, 0);
    await checkEmailTrackerCount(LABEL_CONTENT_EMAIL_WEBAPP, 0);
  });

  // Open an email webapp tab.
  await BrowserTestUtils.withNewTab(TEST_EMAIL_WEBAPP_PAGE, async browser => {
    // Load a image from the email tracker
    let res = await loadImage(browser, EMAIL_TRACKER_IMAGE);

    is(res, false, "The image is blocked.");

    // Verify the telemetry of the email tracker count.
    await checkEmailTrackerCount(LABEL_BASE_NORMAL, 1);
    await checkEmailTrackerCount(LABEL_CONTENT_NORMAL, 0);
    await checkEmailTrackerCount(LABEL_BASE_EMAIL_WEBAPP, 1);
    await checkEmailTrackerCount(LABEL_CONTENT_EMAIL_WEBAPP, 0);
  });
  // Make sure the tab was closed properly before clearing Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  await clearTelemetry();
});

add_task(async function test_no_telemetry_for_first_party_email_tracker() {
  // Open a email tracker tab.
  await BrowserTestUtils.withNewTab(EMAIL_TRACKER_PAGE, async browser => {
    // Load a image from the first-party email tracker
    let res = await loadImage(browser, EMAIL_TRACKER_IMAGE);

    is(res, true, "The image is loaded.");

    // Verify that there was no telemetry recorded.
    checkNoEmailTrackerCount();
  });
  // Make sure the tab was closed properly before clearing Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  await clearTelemetry();
});

add_task(async function test_disable_email_data_collection() {
  // Disable Email Tracking Data Collection.
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "privacy.trackingprotection.emailtracking.data_collection.enabled",
        false,
      ],
    ],
  });

  // Open an email webapp tab.
  await BrowserTestUtils.withNewTab(TEST_EMAIL_WEBAPP_PAGE, async browser => {
    // Load a image from the email tracker
    let res = await loadImage(browser, EMAIL_TRACKER_IMAGE);

    is(res, false, "The image is blocked.");

    // Verify that there was no telemetry recorded.
    checkNoEmailTrackerCount();
  });
  // Make sure the tab was closed properly before clearing Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  await SpecialPowers.popPrefEnv();
  await clearTelemetry();
});

add_task(async function test_email_tracker_embedded_telemetry() {
  Services.fog.testResetFOG();
  // First, we open a page without loading any email trackers.
  await BrowserTestUtils.withNewTab(TEST_PAGE, async _ => {});
  // Make sure the tab was closed properly before checking Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  // Check that the telemetry has been record properly for normal page. The
  // telemetry should show there was no email tracker loaded.
  await Services.fog.testFlushAllChildren();
  let telemetry =
    Glean.contentblocking.emailTrackerEmbeddedPerTab.testGetValue();

  checkKeyedHistogram(telemetry, KEY_BASE_NORMAL, 0, 1);
  checkKeyedHistogram(telemetry, KEY_CONTENT_NORMAL, 0, 1);
  checkKeyedHistogram(telemetry, KEY_ALL_NORMAL, 0, 1);

  // Second, Open a email webapp tab that doesn't a load email tracker.
  await BrowserTestUtils.withNewTab(TEST_EMAIL_WEBAPP_PAGE, async _ => {});
  // Make sure the tab was closed properly before checking Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  // Check that the telemetry has been record properly for the email webapp. The
  // telemetry should show there was no email tracker loaded.
  await Services.fog.testFlushAllChildren();
  telemetry = Glean.contentblocking.emailTrackerEmbeddedPerTab.testGetValue();
  checkKeyedHistogram(telemetry, KEY_BASE_EMAILAPP, 0, 1);
  checkKeyedHistogram(telemetry, KEY_CONTENT_EMAILAPP, 0, 1);
  checkKeyedHistogram(telemetry, KEY_ALL_EMAILAPP, 0, 1);

  // Third, open a page with one email tracker loaded.
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    // Load a image from the email tracker
    let res = await loadImage(browser, EMAIL_TRACKER_IMAGE);

    is(res, false, "The image is blocked.");
  });
  // Make sure the tab was closed properly before checking Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  // Verify that the telemetry has been record properly, The telemetry should
  // show there was one base email tracker loaded.
  await Services.fog.testFlushAllChildren();
  telemetry = Glean.contentblocking.emailTrackerEmbeddedPerTab.testGetValue();
  checkKeyedHistogram(telemetry, KEY_BASE_NORMAL, 1, 1);
  checkKeyedHistogram(telemetry, KEY_CONTENT_NORMAL, 0, 2);
  checkKeyedHistogram(telemetry, KEY_ALL_NORMAL, 0, 1);
  checkKeyedHistogram(telemetry, KEY_ALL_NORMAL, 1, 1);

  // Open a page and load the same email tracker multiple times. There
  // should be only one count for the same tracker.
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    // Load a image from the email tracker two times.
    await loadImage(browser, EMAIL_TRACKER_IMAGE);
    await loadImage(browser, EMAIL_TRACKER_IMAGE);
  });
  // Make sure the tab was closed properly before checking Telemetry.
  await BrowserUtils.promiseObserved("window-global-destroyed");

  // Verify that there is still only one count when loading the same tracker
  // multiple times.
  await Services.fog.testFlushAllChildren();
  telemetry = Glean.contentblocking.emailTrackerEmbeddedPerTab.testGetValue();
  checkKeyedHistogram(telemetry, KEY_BASE_NORMAL, 1, 2);
  checkKeyedHistogram(telemetry, KEY_CONTENT_NORMAL, 0, 3);
  checkKeyedHistogram(telemetry, KEY_ALL_NORMAL, 0, 1);
  checkKeyedHistogram(telemetry, KEY_ALL_NORMAL, 1, 2);

  await clearTelemetry();
});
