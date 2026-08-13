"use strict";

// The harmful-addon feature carries an mRequestFilter that restricts
// classification to requests whose ContentClassifierRequest has
// mIsNonRecommendedAddon set — i.e. channels triggered or loaded by a
// non-recommended addon principal. This test verifies:
//
//   1. A plain page subresource fetch (non-addon triggering principal) is
//      NOT blocked even when the URL is in the harmful-addon list.
//
//   2. A fetch issued from an extension background script (addon triggering
//      principal, non-recommended) IS blocked.

add_task(async function test_harmful_addon_request_filter() {
  let client = getRSClient();
  let db = client.db;

  let record = await populateRS(db, "harmful-addon", "mozilla-harmful-addon", [
    "||example.org^",
  ]);

  await pushEnginePrefs({ protection: "harmful-addon" });

  let tab = await openTestTab();
  let browser = tab.linkedBrowser;
  await syncAndWaitForLists(client, [record]);

  // Non-addon channels to the listed URL must pass through.
  await assertImageLoaded(
    browser,
    TEST_BLOCKED_3RD_PARTY_DOMAIN,
    "Non-addon channel to example.org should not be blocked by harmful-addon"
  );

  // Addon-triggered channels to the listed URL must be blocked.
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      host_permissions: ["*://example.org/*"],
    },
    background() {
      const { browser } = this;
      browser.test.onMessage.addListener(async (msg, url) => {
        if (msg === "fetch") {
          try {
            await fetch(url);
            browser.test.sendMessage("fetch-result", true);
          } catch (_e) {
            browser.test.sendMessage("fetch-result", false);
          }
        }
      });
    },
  });
  await extension.startup();

  // The extension fetches from example.org. Its triggering principal is the
  // extension principal, so mIsNonRecommendedAddon is true and the
  // harmful-addon engine runs.
  let imageURL =
    TEST_BLOCKED_3RD_PARTY_DOMAIN +
    "browser/toolkit/components/antitracking/test/browser/raptor.jpg?" +
    Math.random();
  extension.sendMessage("fetch", imageURL);
  let fetchSucceeded = await extension.awaitMessage("fetch-result");
  ok(
    !fetchSucceeded,
    "Addon fetch to example.org should be blocked by harmful-addon feature"
  );

  await extension.unload();
});
