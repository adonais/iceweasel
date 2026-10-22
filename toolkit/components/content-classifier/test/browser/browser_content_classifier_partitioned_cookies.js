"use strict";

// Bug 2074830: a tracker that reads its partitioned cookies is not an allowed
// tracker cookie. The ContentClassifier annotates with the generic
// CLASSIFIED_TRACKING bit, which used to turn such reads into
// STATE_COOKIES_LOADED_TRACKER events.

const TRACKER_DOMAIN = TEST_ANNOTATED_3RD_PARTY_DOMAIN;
const COOKIES_SJS =
  TRACKER_DOMAIN +
  "browser/toolkit/components/antitracking/test/browser/cookies.sjs";

const {
  STATE_LOADED_LEVEL_1_TRACKING_CONTENT,
  STATE_COOKIES_LOADED,
  STATE_COOKIES_LOADED_TRACKER,
  STATE_COOKIES_PARTITIONED_TRACKER,
} = Ci.nsIWebProgressListener;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "network.cookie.cookieBehavior",
        Ci.nsICookieService.BEHAVIOR_PARTITION_FOREIGN,
      ],
    ],
  });
  registerCleanupFunction(async () => {
    await SpecialPowers.flushPrefEnv();
    await new Promise(resolve =>
      Services.clearData.deleteData(Ci.nsIClearDataService.CLEAR_ALL, resolve)
    );
  });
});

async function loadTrackerFrame(browser, url) {
  return SpecialPowers.spawn(browser, [url], async src => {
    let frame = content.document.createElement("iframe");
    let loaded = new Promise(resolve => {
      frame.onload = resolve;
    });
    frame.src = src;
    content.document.body.appendChild(frame);
    await loaded;
    return content.document.querySelectorAll("iframe").length - 1;
  });
}

function frameBody(browser, index) {
  return SpecialPowers.spawn(
    browser.browsingContext.children[index],
    [],
    () => content.document.body.textContent
  );
}

add_task(async function partitioned_tracker_cookies_are_not_allowed() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.com^"],
    },
  ]);
  await pushEnginePrefs({ annotation: "trackers" });
  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, records);

  let writeFrame = await loadTrackerFrame(
    browser,
    `${COOKIES_SJS}?partitioned`
  );
  is(
    await frameBody(browser, writeFrame),
    "cookie:",
    "The first tracker load carries no cookie"
  );
  let readFrame = await loadTrackerFrame(browser, COOKIES_SJS);
  is(
    await frameBody(browser, readFrame),
    "cookie:foopy=partitioned",
    "The second tracker load sends the partitioned cookie back"
  );
  await TestUtils.waitForCondition(async () => {
    let log = JSON.parse(await browser.getContentBlockingLog());
    return log[TRACKER_DOMAIN.replace(/\/$/, "")]?.some(
      ([state]) => state === STATE_COOKIES_LOADED
    );
  }, "Waiting for the cookie events of the tracker");

  await assertHasBlockingState(
    browser,
    TRACKER_DOMAIN,
    STATE_LOADED_LEVEL_1_TRACKING_CONTENT,
    "The tracker is annotated"
  );
  await assertHasBlockingState(
    browser,
    TRACKER_DOMAIN,
    STATE_COOKIES_PARTITIONED_TRACKER,
    "Partitioned tracker cookies are reported as partitioned"
  );
  await assertLacksBlockingState(
    browser,
    TRACKER_DOMAIN,
    STATE_COOKIES_LOADED_TRACKER,
    "Partitioned tracker cookies are not reported as allowed tracker cookies"
  );

  BrowserTestUtils.removeTab(tab);
});
