"use strict";

const server = createHttpServer({ hosts: ["example.com"] });

server.registerPathHandler("/dummy", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write("<!DOCTYPE html><html></html>");
});

// Test that a request redirected to a moz-extension: resource reports a
// resource timing entry under the original URL, and keeps the initiator type
// of the original request.
add_task(async function test_resource_timing_for_extension_redirect() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["webRequest", "webRequestBlocking", "*://example.com/*"],
      web_accessible_resources: ["redirected.txt"],
    },
    background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          return { redirectUrl: browser.runtime.getURL("redirected.txt") };
        },
        { urls: ["*://*/*file_redirect_me.txt*"] },
        ["blocking"]
      );
    },
    files: {
      "redirected.txt": "redirected",
    },
  });
  await extension.startup();

  let contentPage = await ExtensionTestUtils.loadContentPage(
    "http://example.com/dummy"
  );

  let result = await contentPage.spawn([], async () => {
    const url = "http://example.com/file_redirect_me.txt";
    const response = await content.wrappedJSObject.fetch(url);
    const responseText = await response.text();
    const entries = content.performance.getEntriesByType("resource");
    return {
      responseText,
      entries: entries.map(e => ({
        name: e.name,
        initiatorType: e.initiatorType,
      })),
    };
  });

  equal(
    result.responseText,
    "redirected",
    "the request was redirected to the extension resource"
  );
  equal(
    result.entries.length,
    1,
    "exactly one resource timing entry is reported"
  );
  equal(
    result.entries[0].name,
    "http://example.com/file_redirect_me.txt",
    "the entry is reported under the original URL"
  );
  equal(
    result.entries[0].initiatorType,
    "fetch",
    "the entry keeps the initiator type of the original request"
  );

  await contentPage.close();
  await extension.unload();
});
