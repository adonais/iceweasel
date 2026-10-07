"use strict";

// Bug 2072993: a content script's fetch carries an expanded loading
// principal, which has no base domain. That must not make the classifier
// treat a first-party request as third-party.

const IMAGE_PATH =
  "browser/toolkit/components/antitracking/test/browser/raptor.jpg";
const FIRST_PARTY_IMAGE = TEST_DOMAIN + IMAGE_PATH;
const THIRD_PARTY_IMAGE = TEST_BLOCKED_3RD_PARTY_DOMAIN + IMAGE_PATH;

add_task(async function test_content_script_first_party_fetch_not_blocked() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.net^", "||example.org^"],
    },
  ]);
  await pushEnginePrefs({ protection: "trackers" });

  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      content_scripts: [
        {
          matches: ["https://example.net/*"],
          js: ["cs.js"],
          run_at: "document_end",
        },
      ],
    },
    files: {
      "cs.js": function () {
        const { browser } = this;
        browser.test.onMessage.addListener(async (msg, url) => {
          if (msg !== "fetch") {
            return;
          }
          try {
            await fetch(url + "?" + Math.random(), { mode: "no-cors" });
            browser.test.sendMessage("fetch-result", true);
          } catch (_e) {
            browser.test.sendMessage("fetch-result", false);
          }
        });
        browser.test.sendMessage("content-script-ready");
      },
    },
  });
  await extension.startup();

  let tab = await openTestTab();
  await extension.awaitMessage("content-script-ready");
  await syncAndWaitForLists(client, records);

  extension.sendMessage("fetch", FIRST_PARTY_IMAGE);
  ok(
    await extension.awaitMessage("fetch-result"),
    "content script fetch of a first-party image on a listed site is not blocked"
  );

  extension.sendMessage("fetch", THIRD_PARTY_IMAGE);
  ok(
    !(await extension.awaitMessage("fetch-result")),
    "content script fetch of a third-party image on a listed site is blocked"
  );

  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});
