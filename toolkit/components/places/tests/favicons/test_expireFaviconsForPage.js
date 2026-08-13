/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function countAssociationsForPage(pageURL) {
  let db = await PlacesUtils.promiseDBConnection();
  let rows = await db.execute(
    `SELECT count(*) FROM moz_icons_to_pages itp
     JOIN moz_pages_w_icons p ON p.id = itp.page_id
     WHERE p.page_url = :url`,
    { url: pageURL }
  );
  return rows[0].getResultByIndex(0);
}

add_task(async function test_expire_basic() {
  const PAGE_URL = "http://example.com/page1";
  await PlacesTestUtils.addVisits(PAGE_URL);
  await PlacesTestUtils.setFaviconForPage(
    PAGE_URL,
    "http://example.com/icon.png",
    SMALLPNG_DATA_URI
  );

  Assert.ok(
    await PlacesTestUtils.getFaviconForPage(PAGE_URL),
    "Favicon should be stored initially"
  );

  await PlacesUtils.favicons.expireFaviconsForPage(
    Services.io.newURI(PAGE_URL)
  );

  Assert.ok(
    !(await PlacesTestUtils.getFaviconForPage(PAGE_URL)),
    "Favicon should have been removed"
  );
});

add_task(async function test_expire_multiple_associations() {
  const PAGE_URL = "http://example.com/page2";
  await PlacesTestUtils.addVisits(PAGE_URL);

  for (let i = 1; i <= 3; i++) {
    await PlacesTestUtils.setFaviconForPage(
      PAGE_URL,
      `http://example.com/icon${i}.png`,
      SMALLPNG_DATA_URI
    );
  }

  Assert.equal(
    await countAssociationsForPage(PAGE_URL),
    3,
    "Should have 3 icon associations before expiring"
  );

  await PlacesUtils.favicons.expireFaviconsForPage(
    Services.io.newURI(PAGE_URL)
  );

  Assert.equal(
    await countAssociationsForPage(PAGE_URL),
    0,
    "All icon associations should have been removed"
  );
});

add_task(async function test_expire_does_not_affect_other_pages() {
  const PAGE_A = "http://example.com/pageA";
  const PAGE_B = "http://example.com/pageB";
  const SHARED_ICON = "http://example.com/shared.png";

  await PlacesTestUtils.addVisits([PAGE_A, PAGE_B]);
  await PlacesTestUtils.setFaviconForPage(
    PAGE_A,
    SHARED_ICON,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.setFaviconForPage(
    PAGE_B,
    SHARED_ICON,
    SMALLPNG_DATA_URI
  );

  await PlacesUtils.favicons.expireFaviconsForPage(Services.io.newURI(PAGE_A));

  Assert.ok(
    !(await PlacesTestUtils.getFaviconForPage(PAGE_A)),
    "Page A favicon should have been removed"
  );
  Assert.ok(
    await PlacesTestUtils.getFaviconForPage(PAGE_B),
    "Page B favicon should be unaffected"
  );
});

add_task(async function test_expire_no_op_on_page_without_icons() {
  const PAGE_WITHOUT_HISTORY = "http://example.com/no-history";
  const PAGE_WITHOUT_ICON = "http://example.com/no-icon";

  await PlacesTestUtils.addVisits(PAGE_WITHOUT_ICON);

  for (let url of [PAGE_WITHOUT_HISTORY, PAGE_WITHOUT_ICON]) {
    await PlacesUtils.favicons.expireFaviconsForPage(Services.io.newURI(url));
    Assert.ok(
      !(await PlacesTestUtils.getFaviconForPage(url)),
      `Should have no favicon for ${url}`
    );
  }
});

add_task(async function test_expire_with_fragment_clears_base_url_too() {
  const BASE_URL = "http://example.com/page-fragment";
  const FRAGMENT_URL = BASE_URL + "#section";
  const ICON_URL = "http://example.com/fragment-icon.png";

  // Simulate the common case where Places has stored icons for both the base
  // URL (e.g. from a bookmark) and the fragment URL (from navigation).
  await PlacesTestUtils.addVisits([BASE_URL, FRAGMENT_URL]);
  await PlacesTestUtils.setFaviconForPage(
    BASE_URL,
    ICON_URL,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.setFaviconForPage(
    FRAGMENT_URL,
    ICON_URL,
    SMALLPNG_DATA_URI
  );

  Assert.equal(
    await countAssociationsForPage(BASE_URL),
    1,
    "Base URL should have 1 icon association"
  );
  Assert.equal(
    await countAssociationsForPage(FRAGMENT_URL),
    1,
    "Fragment URL should have 1 icon association"
  );

  // Expiring with the fragment URL should clear both.
  await PlacesUtils.favicons.expireFaviconsForPage(
    Services.io.newURI(FRAGMENT_URL)
  );

  Assert.equal(
    await countAssociationsForPage(BASE_URL),
    0,
    "Base URL icon associations should have been cleared"
  );
  Assert.equal(
    await countAssociationsForPage(FRAGMENT_URL),
    0,
    "Fragment URL icon associations should have been cleared"
  );
});
