/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A load that may not be persisted opens the memory-only cache storage. When an
// entry for that URL already exists on disk the cache replaces it with a
// memory-only one, but an entry picked up through the No-Vary-Search secondary
// index is stored under a different URL: replacing it would doom another URL's
// representation, so such a candidate must not be used at all.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let gHttpServer;
let gPort;
let gRequests = [];
const PATH = "/nvs-mem";

function handler(metadata, response) {
  gRequests.push(metadata.queryString);

  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Cache-Control", "max-age=10000", false);
  response.setHeader("ETag", `"${metadata.queryString}"`, false);
  if (metadata.queryString === "u=a") {
    response.setHeader("No-Vary-Search", 'params=("u")', false);
  }

  const body = metadata.queryString;
  response.bodyOutputStream.write(body, body.length);
}

function uri(query) {
  return `http://localhost:${gPort}${PATH}?${query}`;
}

function fetchURI(spec, loadFlags = 0) {
  return new Promise(resolve => {
    let chan = NetUtil.newChannel({
      uri: spec,
      loadUsingSystemPrincipal: true,
    });
    chan.loadFlags |= loadFlags;
    chan.asyncOpen(
      new ChannelListener(
        (request, buffer) => resolve(buffer),
        null,
        CL_ALLOW_UNKNOWN_CL
      )
    );
  });
}

function openEntry(spec, where = "disk") {
  return new Promise((resolve, reject) => {
    asyncOpenCacheEntry(
      spec,
      where,
      Ci.nsICacheStorage.OPEN_READONLY | Ci.nsICacheStorage.OPEN_SECRETLY,
      null,
      (status, entry) => {
        if (!Components.isSuccessCode(status)) {
          reject(status);
          return;
        }
        resolve(entry);
      }
    );
  });
}

function entryBody(entry) {
  return new Promise(resolve => {
    pumpReadStream(entry.openInputStream(0), resolve);
  });
}

// The key of the entry a lookup for |spec| resolves to, or null when there is
// none. This is not an exact-key probe: the read-only open runs the same
// No-Vary-Search secondary lookup a channel would.
async function resolvedKey(spec, where = "disk") {
  try {
    let entry = await openEntry(spec, where);
    return entry.key;
  } catch (status) {
    return null;
  }
}

add_setup(function () {
  do_get_profile();
  Services.prefs.setBoolPref("network.cache.no_vary_search", true);

  gHttpServer = new HttpServer();
  gHttpServer.registerPathHandler(PATH, handler);
  gHttpServer.start(-1);
  gPort = gHttpServer.identity.primaryPort;

  registerCleanupFunction(() => {
    gHttpServer.stop(() => {});
    Services.prefs.clearUserPref("network.cache.no_vary_search");
  });
});

add_task(async function test_memory_only_load_keeps_nvs_sibling_on_disk() {
  Services.cache2.clear();
  gRequests = [];

  const a = uri("u=a");
  const b = uri("u=b");
  const c = uri("u=c");

  Assert.equal(await fetchURI(a), "u=a", "A is primed");
  Assert.equal(gRequests.length, 1, "A went to the network");

  // B may not be persisted, so it is opened on the memory-only storage. Its
  // exact key misses and No-Vary-Search offers A's disk entry as a candidate.
  Assert.equal(
    await fetchURI(b, Ci.nsIRequest.INHIBIT_PERSISTENT_CACHING),
    "u=b",
    "B is fetched"
  );
  Assert.equal(gRequests.length, 2, "B went to the network");

  // A is fresh for a long time and must be untouched: with the bug its disk
  // entry was doomed while staying in the entry table, so it can neither be
  // served nor replaced for the rest of the session.
  Assert.equal(await resolvedKey(a), a, "A's URL still resolves to A's entry");

  let entryA = await openEntry(a);
  Assert.ok(entryA.persistent, "A is still a persistent entry");
  Assert.equal(await entryBody(entryA), "u=a", "A's entry holds A's response");

  Assert.equal(await fetchURI(a), "u=a", "A is served from its own entry");
  Assert.equal(gRequests.length, 2, "A did not need the network");

  // And the secondary index still hands A out to the siblings it covers.
  Assert.equal(await fetchURI(c), "u=a", "C reused A's fresh entry");
  Assert.equal(gRequests.length, 2, "C did not need the network");
});
