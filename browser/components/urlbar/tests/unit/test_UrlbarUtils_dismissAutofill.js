/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests UrlbarUtils.dismissAutofill, which blocks an autofill pairing (or
// removes the URL from history) and clears the URL's backspace bookkeeping.

"use strict";

const ORIGIN_URL = "https://example.com/";
const PAGE_URL = "https://example.com/some/page";

const ORIGIN_KEY = "origin:example.com";
const PAGE_KEY = "page:example.com";

async function cleanup() {
  UrlbarUtils._backspaceBlocks.clear();
  await PlacesUtils.history.clear();
}

registerCleanupFunction(cleanup);

add_task(async function blocks_an_origin() {
  await cleanup();
  await PlacesTestUtils.addVisits(ORIGIN_URL);
  await UrlbarUtils.recordAutofillBackspace(ORIGIN_URL);

  await UrlbarUtils.dismissAutofill(ORIGIN_URL);

  Assert.greater(
    await getOriginColumn(ORIGIN_URL, "block_until_ms"),
    Date.now(),
    "block_until_ms should be set in the future"
  );
  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(ORIGIN_KEY),
    "The backspace entry should be cleared"
  );
});

add_task(async function blocks_a_page() {
  await cleanup();
  await PlacesTestUtils.addVisits(PAGE_URL);
  await UrlbarUtils.recordAutofillBackspace(PAGE_URL);

  await UrlbarUtils.dismissAutofill(PAGE_URL);

  Assert.greater(
    await getOriginColumn(PAGE_URL, "block_pages_until_ms"),
    Date.now(),
    "block_pages_until_ms should be set in the future"
  );
  Assert.strictEqual(
    await getOriginColumn(PAGE_URL, "block_until_ms"),
    null,
    "The origin should not be blocked"
  );
  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(PAGE_KEY),
    "The backspace entry should be cleared"
  );
});

add_task(async function removes_from_history() {
  await cleanup();
  await PlacesTestUtils.addVisits(PAGE_URL);
  await UrlbarUtils.recordAutofillBackspace(PAGE_URL);

  await UrlbarUtils.dismissAutofill(PAGE_URL, { removeFromHistory: true });

  Assert.ok(
    !(await PlacesTestUtils.isPageInDB(PAGE_URL)),
    "The URL should be removed from history"
  );
  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(PAGE_KEY),
    "The backspace entry should be cleared"
  );
});

add_task(async function clears_the_entry_when_the_write_fails() {
  await cleanup();
  await UrlbarUtils.recordAutofillBackspace(ORIGIN_URL);

  // No visit, so there's no origin to block.
  await UrlbarUtils.dismissAutofill(ORIGIN_URL);

  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(ORIGIN_KEY),
    "The backspace entry should be cleared anyway"
  );
});
