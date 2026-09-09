/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Exercises the real packaged schemas (fetched via loadAssets from chrome://):
// buildPage() validates a page config against the schemas and returns the
// validated config.

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { loadAssets, buildPage } = AITab;

let gEnv;

add_setup(async function () {
  // Raise AITab's log verbosity for the duration of this file so a failing run
  // surfaces the module's debug/error output. Reverted automatically at teardown.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.conversation.logLevel", "Debug"]],
  });
  const { env } = await loadAssets();
  gEnv = env;
});

// The block taxonomy is expected to keep changing, so the positive case reuses
// the canonical example the page schema ships rather than restating a fixture
// here: a schema edit that forgets to update its own example fails this test.
add_task(function test_page_examples_validate() {
  const examples = gEnv.byName.page.examples ?? [];
  Assert.greater(examples.length, 0, "the page schema ships an example");
  examples.forEach((example, i) => {
    const result = buildPage(example, gEnv);
    Assert.ok(
      result.ok,
      `page example ${i} validates; errors: ${JSON.stringify(result.errors)}`
    );
    Assert.deepEqual(
      result.page,
      example,
      `page example ${i} is returned unchanged`
    );
  });
});

// The rejection cases below deliberately avoid naming any block type, so they
// stay meaningful whatever the taxonomy becomes.

add_task(function test_missing_required_blocks() {
  const result = buildPage(
    { header: { type: "header", title: "No blocks" } },
    gEnv
  );
  Assert.ok(!result.ok, "page without `blocks` is rejected");
  Assert.greater(result.errors.length, 0, "reports at least one error");
});

add_task(function test_header_missing_title() {
  const result = buildPage({ header: { type: "header" }, blocks: [] }, gEnv);
  Assert.ok(!result.ok, "header without required `title` is rejected");
});

add_task(function test_unknown_block_type() {
  const result = buildPage({ blocks: [{ type: "banner" }] }, gEnv);
  Assert.ok(!result.ok, "unknown block type is rejected");
  Assert.ok(
    result.errors.some(e => e.instanceLocation?.includes("/blocks")),
    "an error points at the offending blocks entry"
  );
});

add_task(function test_additional_property_rejected() {
  const result = buildPage(
    { blocks: [], header: { type: "header", title: "X", bogus: 1 } },
    gEnv
  );
  Assert.ok(!result.ok, "unexpected property on a block is rejected");
});
