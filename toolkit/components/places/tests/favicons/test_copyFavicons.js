const TEST_URI1 = Services.io.newURI("http://mozilla.com/");
const TEST_URI2 = Services.io.newURI("http://mozilla.com/page2");
const TEST_URI3 = Services.io.newURI("http://mozilla.com/page3");
const TEST_CROSS_DOMAIN_URI = Services.io.newURI("http://places.com/");
const TEST_LOCAL_URI = Services.io.newURI(
  "chrome://branding/content/icon32.png"
);
const TEST_FILE_URI = Services.io.newURI("file:///test/page.html");
const LOAD_NON_PRIVATE = PlacesUtils.favicons.FAVICON_LOAD_NON_PRIVATE;
const LOAD_PRIVATE = PlacesUtils.favicons.FAVICON_LOAD_PRIVATE;

function promisePageChanged(url) {
  return PlacesTestUtils.waitForNotification("favicon-changed", events =>
    events.some(e => e.url == url)
  );
}

add_task(async function test_tryCopyFavicons_inputcheck() {
  try {
    await PlacesUtils.favicons.tryCopyFavicons(null, TEST_URI2, LOAD_PRIVATE);
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_ILLEGAL_VALUE);
  }
  try {
    await PlacesUtils.favicons.tryCopyFavicons(TEST_URI1, null, LOAD_PRIVATE);
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_ILLEGAL_VALUE);
  }
  try {
    await PlacesUtils.favicons.tryCopyFavicons(TEST_URI1, TEST_URI2, 3);
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_ILLEGAL_VALUE);
  }
  try {
    await PlacesUtils.favicons.tryCopyFavicons(TEST_URI1, TEST_URI2, -1);
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_ILLEGAL_VALUE);
  }
  try {
    await PlacesUtils.favicons.tryCopyFavicons(TEST_URI1, TEST_URI2, null);
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_ILLEGAL_VALUE);
  }
});

add_task(async function test_tryCopyFavicons_noop() {
  info("Unknown uris");
  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI2,
      LOAD_NON_PRIVATE
    ),
    false,
    "Icon should not have been copied"
  );

  info("Unknown dest uri");
  await PlacesTestUtils.addVisits(TEST_URI1);
  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI2,
      LOAD_NON_PRIVATE
    ),
    false,
    "Icon should not have been copied"
  );

  info("Unknown dest uri, source has icon");
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI1,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.addVisits(TEST_URI1);
  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI2,
      LOAD_NON_PRIVATE
    ),
    false,
    "Icon should not have been copied"
  );

  info("Known uris, source has icon, private");
  await PlacesTestUtils.addVisits(TEST_URI2);
  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI2,
      LOAD_PRIVATE
    ),
    false,
    "Icon should not have been copied"
  );

  PlacesUtils.favicons.expireAllFavicons();
  await PlacesUtils.history.clear();
});

add_task(async function test_tryCopyFavicons() {
  info("Normal copy across 2 pages");
  await PlacesTestUtils.addVisits(TEST_URI1);
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI1,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI1,
    SMALLSVG_DATA_URI,
    SMALLSVG_DATA_URI
  );

  await PlacesTestUtils.addVisits(TEST_URI2);
  let promiseChange = promisePageChanged(TEST_URI2.spec);
  Assert.ok(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI2,
      LOAD_NON_PRIVATE
    ),
    "Icon should have been copied"
  );
  await promiseChange;

  Assert.equal(
    (await PlacesTestUtils.getFaviconForPage(TEST_URI2, 1)).uri.spec,
    SMALLPNG_DATA_URI.spec,
    "Small icon found"
  );
  Assert.equal(
    (await PlacesTestUtils.getFaviconForPage(TEST_URI2)).uri.spec,
    SMALLSVG_DATA_URI.spec,
    "Large icon found"
  );

  info("Private copy to a bookmarked page");
  await PlacesUtils.bookmarks.insert({
    url: TEST_URI3,
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
  });
  promiseChange = promisePageChanged(TEST_URI3.spec);
  Assert.ok(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI3,
      LOAD_PRIVATE
    ),
    "Icon should have been copied"
  );
  await promiseChange;
  Assert.equal(
    (await PlacesTestUtils.getFaviconForPage(TEST_URI3, 1)).uri.spec,
    SMALLPNG_DATA_URI.spec,
    "Small icon found"
  );
  Assert.equal(
    (await PlacesTestUtils.getFaviconForPage(TEST_URI3)).uri.spec,
    SMALLSVG_DATA_URI.spec,
    "Large icon found"
  );

  PlacesUtils.favicons.expireAllFavicons();
  await PlacesUtils.history.clear();
});

add_task(async function test_tryCopyFavicons_overlap() {
  info("Copy to a page that has one of the favicons already");
  await PlacesTestUtils.addVisits(TEST_URI1);
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI1,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI1,
    SMALLSVG_DATA_URI,
    SMALLSVG_DATA_URI
  );
  await PlacesTestUtils.addVisits(TEST_URI2);
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI2,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  let promiseChange = promisePageChanged(TEST_URI2.spec);
  Assert.ok(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_URI2,
      LOAD_NON_PRIVATE
    ),
    "Icon should have been copied"
  );
  await promiseChange;
  Assert.equal(
    (await PlacesTestUtils.getFaviconForPage(TEST_URI2, 1)).uri.spec,
    SMALLPNG_DATA_URI.spec,
    "Small icon found"
  );
  Assert.equal(
    (await PlacesTestUtils.getFaviconForPage(TEST_URI2)).uri.spec,
    SMALLSVG_DATA_URI.spec,
    "Large icon found"
  );

  PlacesUtils.favicons.expireAllFavicons();
  await PlacesUtils.history.clear();
});

add_task(async function test_tryCopyFavicons_local_uri() {
  await PlacesTestUtils.addVisits(TEST_URI1);
  try {
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_LOCAL_URI,
      LOAD_NON_PRIVATE
    );
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_ILLEGAL_VALUE);
  }
});

add_task(async function test_tryCopyFavicons_cross_domain() {
  await PlacesTestUtils.addVisits(TEST_CROSS_DOMAIN_URI);
  await PlacesTestUtils.setFaviconForPage(
    TEST_CROSS_DOMAIN_URI,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.addVisits(TEST_URI1);

  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_CROSS_DOMAIN_URI,
      TEST_URI1,
      LOAD_NON_PRIVATE
    ),
    false,
    "Cross-domain copy must be blocked"
  );
  Assert.ok(
    !(await PlacesTestUtils.getFaviconForPage(TEST_URI1)),
    "Destination must have no favicon after blocked cross-domain copy"
  );

  PlacesUtils.favicons.expireAllFavicons();
  await PlacesUtils.history.clear();
});

add_task(async function test_tryCopyFavicons_non_http() {
  await PlacesTestUtils.addVisits(TEST_URI1);
  await PlacesTestUtils.setFaviconForPage(
    TEST_URI1,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );

  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_FILE_URI,
      TEST_URI1,
      LOAD_NON_PRIVATE
    ),
    false,
    "Copy from non-http/https source must be blocked"
  );
  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      TEST_URI1,
      TEST_FILE_URI,
      LOAD_NON_PRIVATE
    ),
    false,
    "Copy to non-http/https destination must be blocked"
  );

  PlacesUtils.favicons.expireAllFavicons();
  await PlacesUtils.history.clear();
});

add_task(async function test_tryCopyFavicons_public_suffix() {
  // github.io is itself a public suffix, so a.github.io and b.github.io have
  // different base domains and the copy must be blocked.
  const githubIoA = Services.io.newURI("http://a.github.io/");
  const githubIoB = Services.io.newURI("http://b.github.io/");
  await PlacesTestUtils.addVisits(githubIoA);
  await PlacesTestUtils.setFaviconForPage(
    githubIoA,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.addVisits(githubIoB);
  Assert.equal(
    await PlacesUtils.favicons.tryCopyFavicons(
      githubIoA,
      githubIoB,
      LOAD_NON_PRIVATE
    ),
    false,
    "Copy across different github.io subdomains must be blocked"
  );

  // co.uk is a public suffix, so a.example.co.uk and b.example.co.uk share
  // the base domain example.co.uk and the copy must be allowed.
  const coUkA = Services.io.newURI("http://a.example.co.uk/");
  const coUkB = Services.io.newURI("http://b.example.co.uk/");
  await PlacesTestUtils.addVisits(coUkA);
  await PlacesTestUtils.setFaviconForPage(
    coUkA,
    SMALLPNG_DATA_URI,
    SMALLPNG_DATA_URI
  );
  await PlacesTestUtils.addVisits(coUkB);
  let promiseChange = promisePageChanged(coUkB.spec);
  Assert.ok(
    await PlacesUtils.favicons.tryCopyFavicons(coUkA, coUkB, LOAD_NON_PRIVATE),
    "Copy across subdomains of the same base domain must be allowed"
  );
  await promiseChange;

  PlacesUtils.favicons.expireAllFavicons();
  await PlacesUtils.history.clear();
});
