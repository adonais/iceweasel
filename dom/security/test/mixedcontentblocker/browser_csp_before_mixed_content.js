"use strict";

const TEST_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "file_csp_before_mixed_content.sjs";

const MIXED_CONTENT_MESSAGE = "Blocked loading mixed display content";
const CSP_MESSAGE = "blocked the loading of a resource (img-src)";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["security.mixed_content.block_display_content", true],
      ["security.mixed_content.upgrade_display_content", false],
    ],
  });
});

async function loadAndCollectMessages(url, expected) {
  let messages = [];
  let listener = {
    observe(msg) {
      messages.push(msg.message);
    },
  };
  Services.console.registerListener(listener);
  await BrowserTestUtils.withNewTab(url, async () => {
    await TestUtils.waitForCondition(
      () => messages.some(m => m.includes(expected)),
      `Waiting for "${expected}"`
    );
  });
  Services.console.unregisterListener(listener);
  return messages;
}

add_task(async function test_mixed_content_only() {
  let messages = await loadAndCollectMessages(TEST_URL, MIXED_CONTENT_MESSAGE);
  ok(
    !messages.some(m => m.includes(CSP_MESSAGE)),
    "No CSP violation without a CSP"
  );
});

add_task(async function test_csp_and_mixed_content() {
  let messages = await loadAndCollectMessages(TEST_URL + "?csp", CSP_MESSAGE);
  ok(
    !messages.some(m => m.includes(MIXED_CONTENT_MESSAGE)),
    "Image is blocked by CSP before reaching the mixed content blocker"
  );
});
