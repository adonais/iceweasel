/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests the userContextId (container) of visits added through the JS APIs.

"use strict";

const TEST_URL = "https://example.com/userContextId";

add_task(async function test_insert_invalid_userContextId() {
  for (let userContextId of [-1, 1.5, 2 ** 32, "1", {}]) {
    await Assert.rejects(
      PlacesUtils.history.insert({
        url: TEST_URL,
        visits: [{ transition: TRANSITION_LINK, userContextId }],
      }),
      e => e.result === Cr.NS_ERROR_INVALID_ARG,
      `History.insert should reject userContextId ${String(userContextId)}`
    );
  }
  Assert.ok(
    !(await PlacesUtils.history.hasVisits(TEST_URL)),
    "No visit was added"
  );
});

add_task(async function test_insert_valid_userContextId() {
  await PlacesUtils.history.clear();

  for (let userContextId of [0, 2, 2 ** 32 - 1]) {
    let url = `${TEST_URL}/${userContextId}`;
    let promiseVisited = PlacesTestUtils.waitForNotification(
      "page-visited",
      events => events.some(e => e.url === url)
    );
    await PlacesUtils.history.insert({
      url,
      visits: [{ transition: TRANSITION_LINK, userContextId }],
    });
    let events = await promiseVisited;
    Assert.equal(
      events.find(e => e.url === url).userContextId,
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
      "The visit is stored in the right container"
    );
  }

  await PlacesUtils.history.clear();
});
