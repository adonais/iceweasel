"use strict";

// Bug 2072993: a content script's fetch carries an expanded loading
// principal, which has no base domain. That must not make the classifier
// treat a first-party request as third-party.

const IMAGE_PATH =
  "browser/toolkit/components/antitracking/test/browser/raptor.jpg";
const FIRST_PARTY_IMAGE = TEST_DOMAIN + IMAGE_PATH;
const THIRD_PARTY_IMAGE = TEST_BLOCKED_3RD_PARTY_DOMAIN + IMAGE_PATH;

function loadFetchingExtension(permissions = []) {
  return ExtensionTestUtils.loadExtension({
    manifest: {
      permissions,
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
}

async function fetchFromContentScript(extension, url) {
  extension.sendMessage("fetch", url);
  return extension.awaitMessage("fetch-result");
}

async function setupTrackersList() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.net^", "||example.org^"],
    },
  ]);
  await pushEnginePrefs({ protection: "trackers" });
  return { client, records };
}

add_task(async function test_content_script_first_party_fetch_not_blocked() {
  let { client, records } = await setupTrackersList();

  let extension = loadFetchingExtension();
  await extension.startup();

  let tab = await openTestTab();
  await extension.awaitMessage("content-script-ready");
  await syncAndWaitForLists(client, records);

  ok(
    await fetchFromContentScript(extension, FIRST_PARTY_IMAGE),
    "content script fetch of a first-party image on a listed site is not blocked"
  );

  ok(
    !(await fetchFromContentScript(extension, THIRD_PARTY_IMAGE)),
    "content script fetch of a third-party image on a listed site is blocked"
  );

  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});

// Bug 2080291: a content script's request to a host its extension has
// explicit host permission for is not blocked. Wildcard permissions such as
// <all_urls> don't count.
add_task(async function test_content_script_fetch_with_host_permission() {
  let { client, records } = await setupTrackersList();
  await syncAndWaitForLists(client, records);

  for (let { permissions, blocked } of [
    { permissions: ["https://example.org/*"], blocked: false },
    { permissions: ["<all_urls>"], blocked: true },
  ]) {
    let extension = loadFetchingExtension(permissions);
    await extension.startup();

    let tab = await openTestTab();
    await extension.awaitMessage("content-script-ready");

    is(
      !(await fetchFromContentScript(extension, THIRD_PARTY_IMAGE)),
      blocked,
      `content script fetch of a listed third-party image with permissions ${JSON.stringify(permissions)} is ${blocked ? "" : "not "}blocked`
    );

    BrowserTestUtils.removeTab(tab);
    await extension.unload();
  }
});
