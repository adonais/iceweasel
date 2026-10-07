/**
 * Verifies that the DictionaryCache is partitioned by OriginAttributes /
 * LoadContextInfo: a compression dictionary registered by one partition
 * (e.g. a container) must not be offered to requests from a different
 * partition, even for the exact same origin and matching path.
 */

"use strict";

Services.scriptloader.loadSubScript("resource://test/head_cache.js", this);

const { NodeHTTPSServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

let server = null;

add_setup(async function () {
  Services.prefs.setBoolPref("network.http.dictionaries.enable", true);

  server = new NodeHTTPSServer();
  await server.start();

  registerCleanupFunction(async () => {
    try {
      await server.stop();
    } catch (e) {
      // Ignore server stop errors during cleanup
    }
    Services.prefs.clearUserPref("network.http.dictionaries.enable");
  });
});

function makeChan(url, userContextId) {
  let chan = NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadInfo.originAttributes = { userContextId };
  return chan;
}

function channelOpenPromise(chan) {
  return new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener(
        (req, buffer) => resolve([req, buffer]),
        null,
        CL_ALLOW_UNKNOWN_CL
      )
    );
  });
}

function syncCache() {
  return new Promise(resolve => {
    syncWithCacheIOThread(resolve, true);
  });
}

add_task(async function test_dictionary_cache_isolated_by_origin_attributes() {
  await server.registerPathHandler("/dict1", function (request, response) {
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Use-As-Dictionary": `match="/content*", id="dict-container-1", type=raw`,
      "Cache-Control": "max-age=3600",
    });
    response.end("DICTIONARY_CONTENT_FOR_CONTAINER_1", "binary");
  });

  await server.registerPathHandler("/dict2", function (request, response) {
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Use-As-Dictionary": `match="/content*", id="dict-container-2", type=raw`,
      "Cache-Control": "max-age=3600",
    });
    response.end("DICTIONARY_CONTENT_FOR_CONTAINER_2", "binary");
  });

  await server.registerPathHandler("/content", function (request, response) {
    global.lastAvailableDictionary =
      request.headers["available-dictionary"] || null;
    global.lastDictionaryId = request.headers["dictionary-id"] || null;
    response.writeHead(200, {
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache",
    });
    response.end("PLAIN_CONTENT", "binary");
  });

  let dict1Url = `https://localhost:${server.port()}/dict1`;
  let dict2Url = `https://localhost:${server.port()}/dict2`;
  let contentUrl = `https://localhost:${server.port()}/content`;

  // Register a dictionary in container 1, and a different one -- matching
  // the same path pattern -- in container 2.
  await channelOpenPromise(makeChan(dict1Url, 1));
  await channelOpenPromise(makeChan(dict2Url, 2));
  await syncCache();

  async function lastOfferedDictionaryId(userContextId) {
    await server.execute(
      "global.lastAvailableDictionary = null; global.lastDictionaryId = null;"
    );
    await channelOpenPromise(makeChan(contentUrl, userContextId));
    return server.execute("global.lastDictionaryId");
  }

  Assert.equal(
    await lastOfferedDictionaryId(1),
    '"dict-container-1"',
    "Container 1 should be offered its own dictionary"
  );

  Assert.equal(
    await lastOfferedDictionaryId(2),
    '"dict-container-2"',
    "Container 2 should be offered its own dictionary, not container 1's"
  );

  Assert.equal(
    await lastOfferedDictionaryId(3),
    null,
    "A container with no registered dictionary must not be offered one " +
      "from a different partition"
  );

  // Re-check container 1 again, to make sure the intervening requests from
  // other partitions didn't clobber or replace its dictionary.
  Assert.equal(
    await lastOfferedDictionaryId(1),
    '"dict-container-1"',
    "Container 1 should still be offered its own dictionary"
  );
});
