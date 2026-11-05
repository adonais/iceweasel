/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });
  await PlacesUtils.history.clear();
  registerCleanupFunction(() => PlacesUtils.history.clear());
});

add_task(async function test_visit_in_container() {
  for (let userContextId of [0, 2]) {
    const url = `${TEST_PATH}empty_page.html?container=${userContextId}`;

    let promiseVisited = PlacesTestUtils.waitForNotification(
      "page-visited",
      events => events.some(e => e.url === url)
    );

    let tab = BrowserTestUtils.addTab(gBrowser, url, { userContextId });
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
    Assert.equal(
      tab.linkedBrowser.browsingContext.originAttributes.userContextId,
      userContextId,
      "The tab is loaded in the expected container"
    );

    let events = await promiseVisited;
    let visitEvents = events.filter(e => e.url === url);
    Assert.equal(visitEvents.length, 1, "One page-visited event");
    Assert.equal(
      visitEvents[0].userContextId,
      userContextId,
      "page-visited reports the container of the visit"
    );

    let db = await PlacesUtils.promiseDBConnection();
    let rows = await db.execute(
      `SELECT v.userContextId FROM moz_historyvisits v
       JOIN moz_places h ON h.id = v.place_id
       WHERE h.url_hash = hash(:url) AND h.url = :url`,
      { url }
    );
    Assert.deepEqual(
      rows.map(r => r.getResultByName("userContextId")),
      [userContextId],
      "The visit is stored in the container of the tab"
    );

    BrowserTestUtils.removeTab(tab);
  }
});
