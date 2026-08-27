/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests UrlbarUtils.reintegrateAutofill, which clears a URL's autofill block
// and its backspace bookkeeping and reports what it cleared so the caller can
// record re-integration telemetry.

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

async function triggerBackspaceBlock(url) {
  for (let i = 0; i < UrlbarPrefs.get("autoFill.backspaceThreshold"); i++) {
    await UrlbarUtils.recordAutofillBackspace(url);
  }
}

add_task(async function clears_an_origin_block() {
  await cleanup();
  await PlacesTestUtils.addVisits(ORIGIN_URL);
  await UrlbarUtils.blockAutofill(ORIGIN_URL, Date.now() + 10000);

  let { wasBlocked, level } = await UrlbarUtils.reintegrateAutofill(ORIGIN_URL);

  Assert.ok(wasBlocked, "A block should have been cleared");
  Assert.equal(level, "origin", "An origin URL should report the origin level");
  Assert.strictEqual(
    await getOriginColumn(ORIGIN_URL, "block_until_ms"),
    null,
    "block_until_ms should be cleared"
  );
});

add_task(async function clears_a_page_block() {
  await cleanup();
  await PlacesTestUtils.addVisits(PAGE_URL);
  await UrlbarUtils.blockAutofill(PAGE_URL, Date.now() + 10000);

  let { wasBlocked, level } = await UrlbarUtils.reintegrateAutofill(PAGE_URL);

  Assert.ok(wasBlocked, "A block should have been cleared");
  Assert.equal(level, "url", "A page URL should report the url level");
  Assert.strictEqual(
    await getOriginColumn(PAGE_URL, "block_pages_until_ms"),
    null,
    "block_pages_until_ms should be cleared"
  );
});

add_task(async function reports_no_block_when_not_blocked() {
  await cleanup();
  await PlacesTestUtils.addVisits(ORIGIN_URL);

  let { wasBlocked, backspaceBlock } =
    await UrlbarUtils.reintegrateAutofill(ORIGIN_URL);

  Assert.ok(!wasBlocked, "No block should be reported");
  Assert.equal(backspaceBlock, null, "No backspace block should be reported");
});

add_task(async function returns_and_consumes_the_backspace_block() {
  await cleanup();
  await PlacesTestUtils.addVisits(PAGE_URL);
  await triggerBackspaceBlock(PAGE_URL);

  let { backspaceBlock } = await UrlbarUtils.reintegrateAutofill(PAGE_URL);
  Assert.equal(
    backspaceBlock.level,
    "url",
    "The backspace block should be reported at the url level"
  );
  Assert.greater(backspaceBlock.blockedAt, 0, "blockedAt should be set");
  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(PAGE_KEY),
    "The entry should be consumed"
  );

  let second = await UrlbarUtils.reintegrateAutofill(PAGE_URL);
  Assert.equal(
    second.backspaceBlock,
    null,
    "A second call should report no backspace block"
  );
});

add_task(async function drops_a_stale_backspace_block_but_clears_it() {
  await cleanup();
  await PlacesTestUtils.addVisits(ORIGIN_URL);
  await triggerBackspaceBlock(ORIGIN_URL);
  UrlbarUtils._backspaceBlocks.get(ORIGIN_KEY).blockedAt =
    Date.now() -
    (UrlbarUtils._BACKSPACE_BLOCK_MAX_AGE_HOURS + 1) * 60 * 60 * 1000;

  let { backspaceBlock } = await UrlbarUtils.reintegrateAutofill(ORIGIN_URL);

  Assert.equal(backspaceBlock, null, "A stale block should not be reported");
  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(ORIGIN_KEY),
    "The stale entry should still be cleared"
  );
});

add_task(async function clears_a_sub_threshold_count() {
  await cleanup();
  await PlacesTestUtils.addVisits(ORIGIN_URL);
  await UrlbarUtils.recordAutofillBackspace(ORIGIN_URL);
  Assert.equal(
    UrlbarUtils._backspaceBlocks.get(ORIGIN_KEY).count,
    1,
    "A sub-threshold count should be recorded"
  );

  let { backspaceBlock } = await UrlbarUtils.reintegrateAutofill(ORIGIN_URL);

  Assert.equal(
    backspaceBlock,
    null,
    "A count-only entry should not be reported as a backspace block"
  );
  Assert.ok(
    !UrlbarUtils._backspaceBlocks.has(ORIGIN_KEY),
    "The count should be cleared anyway"
  );
});
