/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const CONTENT_CLASSIFIER_COLLECTION = "content-classifier-lists";
const CONTENT_CLASSIFIER_LISTS_LOADED_TOPIC =
  "test-content-classifier-filter-lists-loaded";

add_setup(async () => {
  do_get_profile();
  Services.fog.initializeFOG();

  Services.prefs.setCharPref(
    "urlclassifier.features.harmfuladdon.blocklistHosts",
    "example.org"
  );
  Services.prefs.setCharPref(
    "urlclassifier.features.harmfuladdon.entitylistHosts",
    ""
  );
  Services.prefs.setCharPref(
    "urlclassifier.features.harmfuladdon.skipURLs",
    ""
  );

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      "urlclassifier.features.harmfuladdon.blocklistHosts"
    );
    Services.prefs.clearUserPref(
      "urlclassifier.features.harmfuladdon.entitylistHosts"
    );
    Services.prefs.clearUserPref(
      "urlclassifier.features.harmfuladdon.skipURLs"
    );
  });

  let contentClassifierClient = RemoteSettings(CONTENT_CLASSIFIER_COLLECTION);
  await populateContentClassifierHarmfulAddon(contentClassifierClient);
  registerCleanupFunction(async () => {
    await contentClassifierClient.db.clear();
  });
});

const server = AddonTestUtils.createHttpServer({
  hosts: ["example.com", "example.org"],
});

server.registerPathHandler("/dummy", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write("<!DOCTYPE html><html></html>");
});

server.registerPathHandler("/contentScript", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write("<h1>Content Script</h1>");
});

server.registerPathHandler("/backgroundScript", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write("<h1>Background Script</h1>");
});

add_task(
  { pref_set: [["privacy.trackingprotection.harmfuladdon.enabled", true]] },
  async function test_addon_blocked_by_url_classifier() {
    await runTest("backgroundScript_failed", "contentScript_failed", true);
  }
);

add_task(
  { pref_set: [["privacy.trackingprotection.harmfuladdon.enabled", false]] },
  async function test_addon_not_blocked_by_url_classifier() {
    await runTest("backgroundScript_loaded", "contentScript_loaded", false);
  }
);

async function runTest(message1, message2, expectGleanEvent) {
  Services.fog.testResetFOG();

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      version: "1.2.3",
      host_permissions: ["http://example.org/"],

      content_scripts: [
        {
          matches: ["http://example.com/*"],
          run_at: "document_end",
          js: ["contentscript.js"],
        },
      ],
    },

    background: async () => {
      try {
        await fetch("http://example.org/backgroundScript").then(r => r.text());
        browser.test.sendMessage("backgroundScript_loaded");
      } catch (e) {
        browser.test.sendMessage("backgroundScript_failed");
      }
    },

    files: {
      "contentscript.js": async () => {
        try {
          await fetch("http://example.org/contentScript").then(r => r.text());
          browser.test.sendMessage("contentScript_loaded");
        } catch (e) {
          browser.test.sendMessage("contentScript_failed");
        }
      },
    },
  });

  await extension.startup();

  // Sanity check.
  Assert.equal(
    WebExtensionPolicy.getByID(extension.id).version,
    "1.2.3",
    "Got the expected addon version set on the WebExtensionPolicy instance"
  );

  const finalizeTest = async () => {
    const contentPage = await ExtensionTestUtils.loadContentPage(
      "http://example.com/dummy"
    );

    await extension.awaitMessage(message1);
    await extension.awaitMessage(message2);

    await contentPage.close();
    await extension.unload();

    Services.obs.notifyObservers(null, "idle-daily");
  };

  if (!expectGleanEvent) {
    await finalizeTest();

    const events = Glean.network.urlclassifierHarmfulAddonBlock.testGetValue();
    Assert.equal(events, undefined, "We haven't received glean events");

    return;
  }

  const legacyEnabled = Services.prefs.getBoolPref(
    "privacy.trackingprotection.harmfuladdon.enabled",
    false
  );

  await GleanPings.urlClassifierHarmfulAddon.testSubmission(() => {
    const events = Glean.network.urlclassifierHarmfulAddonBlock.testGetValue();
    Assert.greater(events.length, 1, "We have received glean events");

    let glean = events[0];
    Assert.greater(glean.extra.addon_id.length, 0);
    Assert.equal(glean.extra.addon_version, "1.2.3");
    if (legacyEnabled) {
      Assert.equal(glean.extra.table, "harmfuladdon-blocklist-pref");
    } else {
      Assert.equal(
        glean.extra.table,
        undefined,
        "content-classifier path does not record a table extra"
      );
    }
    Assert.equal(glean.extra.etld, "example.org");

    glean = events[1];
    Assert.greater(glean.extra.addon_id.length, 0);
    Assert.equal(glean.extra.addon_version, "1.2.3");
    if (legacyEnabled) {
      Assert.equal(glean.extra.table, "harmfuladdon-blocklist-pref");
    } else {
      Assert.equal(
        glean.extra.table,
        undefined,
        "content-classifier path does not record a table extra"
      );
    }
    Assert.equal(glean.extra.etld, "example.org");
  }, finalizeTest);
}

async function populateContentClassifierHarmfulAddon(client) {
  let id = "harmful-addon";
  let name = "mozilla-harmful-addon";
  let bytes = new TextEncoder().encode("||example.org^\n");
  let blob = new Blob([bytes]);
  let buffer = await blob.arrayBuffer();
  let hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  let hash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  let record = {
    id,
    Name: name,
    last_modified: Date.now(),
    attachment: {
      hash,
      size: bytes.length,
      filename: name + ".txt",
      location: `main-workspace/content-classifier-lists/${id}.txt`,
      mimetype: "text/plain",
    },
  };
  await client.db.importChanges({}, Date.now(), [record], { clear: true });
  await client.db.saveAttachment(id, { record, blob });
  return record;
}

add_task(async function test_addon_blocked_by_content_classifier() {
  let listsLoaded = TestUtils.topicObserved(
    CONTENT_CLASSIFIER_LISTS_LOADED_TOPIC
  );
  await runWithPrefs(
    [
      ["privacy.trackingprotection.harmfuladdon.enabled", false],
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.engines",
        "harmful-addon",
      ],
    ],
    async () => {
      // We need to wait for asynchronous loading of the lists.
      // Unloading is synchronous, so we don't need to await its destruction.
      await listsLoaded;

      await runTest("backgroundScript_failed", "contentScript_failed", true);
    }
  );
});

add_task(async function test_addon_not_blocked_by_content_classifier() {
  await runWithPrefs(
    [
      ["privacy.trackingprotection.harmfuladdon.enabled", false],
      ["privacy.trackingprotection.content.protection.enabled", false],
    ],
    async () => {
      await runTest("backgroundScript_loaded", "contentScript_loaded", false);
    }
  );
});
