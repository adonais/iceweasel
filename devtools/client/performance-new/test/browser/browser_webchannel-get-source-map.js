/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const ASSETS_BASE =
  "https://example.com/browser/devtools/client/performance-new/test/browser/webchannel-source-map-assets/";

const FRONTEND_URL =
  "https://example.com/browser/devtools/client/performance-new/test/browser/webchannel-source-map.html";

function buildFrontendUrl(params) {
  return FRONTEND_URL + "?" + new URLSearchParams(params).toString();
}

/**
 * Test that a relative sourceMapURL is resolved against the bundle URL,
 * and that a source map with pre-populated sourcesContent is returned as-is.
 */
add_task(async function test_webchannel_get_source_map() {
  info("Test GET_SOURCE_MAP with a relative source map URL");

  const sourceId = "test-source-uuid-1";
  const bundleUrl = ASSETS_BASE + "bundle.js";
  const sourceMapURL = "bundle.js.map";
  const expectedSourcesContent = ["function hello() { return 42; }"];

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      BackgroundJSM.registerProfileCaptureForBrowser(
        browser,
        Promise.resolve(new ArrayBuffer(0)),
        null,
        { [sourceId]: { url: bundleUrl, sourceMapURL } }
      );

      const url = buildFrontendUrl({
        sourceId,
        expectedSourcesContent: JSON.stringify(expectedSourcesContent),
      });

      const loaded = BrowserTestUtils.browserLoaded(browser);
      BrowserTestUtils.startLoadingURIString(browser, url);
      await loaded;

      await waitForTabTitle("Source map received");
      ok(true, "The source map was successfully fetched via the WebChannel.");
    }
  );
});

/**
 * Test that source files missing from sourcesContent are fetched and
 * the returned source map has a fully-populated sourcesContent array.
 */
add_task(async function test_webchannel_get_source_map_fetch_sources() {
  info("Test GET_SOURCE_MAP fetches missing source file content");

  const sourceId = "test-source-uuid-2";
  const bundleUrl = ASSETS_BASE + "bundle.js";
  const sourceMapURL = "bundle-no-content.js.map";
  // The source file "source.js" sits next to the source map and will be fetched.
  const expectedSourcesContent = [
    '"use strict";\n\n/* exported hello */\nfunction hello() {\n  return 42;\n}\n',
  ];

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      BackgroundJSM.registerProfileCaptureForBrowser(
        browser,
        Promise.resolve(new ArrayBuffer(0)),
        null,
        { [sourceId]: { url: bundleUrl, sourceMapURL } }
      );

      const url = buildFrontendUrl({
        sourceId,
        expectedSourcesContent: JSON.stringify(expectedSourcesContent),
      });

      const loaded = BrowserTestUtils.browserLoaded(browser);
      BrowserTestUtils.startLoadingURIString(browser, url);
      await loaded;

      await waitForTabTitle("Source map received");
      ok(
        true,
        "Missing source content was fetched and the sourcesContent array was populated."
      );
    }
  );
});

/**
 * Test that an inline data: source map URL is handled correctly.
 * Relative source paths resolve against the bundle URL.
 */
add_task(async function test_webchannel_get_source_map_inline() {
  info("Test GET_SOURCE_MAP with an inline data: source map URL");

  const sourceMapObject = {
    version: 3,
    sources: ["src/main.js"],
    sourcesContent: ["function hello() { return 42; }"],
    mappings: "AAAA",
  };
  const inlineSourceMapURL =
    "data:application/json," +
    encodeURIComponent(JSON.stringify(sourceMapObject));

  const sourceId = "test-source-uuid-3";
  const bundleUrl = ASSETS_BASE + "bundle.js";
  const expectedSourcesContent = ["function hello() { return 42; }"];

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async browser => {
      BackgroundJSM.registerProfileCaptureForBrowser(
        browser,
        Promise.resolve(new ArrayBuffer(0)),
        null,
        { [sourceId]: { url: bundleUrl, sourceMapURL: inlineSourceMapURL } }
      );

      const url = buildFrontendUrl({
        sourceId,
        expectedSourcesContent: JSON.stringify(expectedSourcesContent),
      });

      const loaded = BrowserTestUtils.browserLoaded(browser);
      BrowserTestUtils.startLoadingURIString(browser, url);
      await loaded;

      await waitForTabTitle("Source map received");
      ok(
        true,
        "The inline data: source map was successfully parsed via the WebChannel."
      );
    }
  );
});
