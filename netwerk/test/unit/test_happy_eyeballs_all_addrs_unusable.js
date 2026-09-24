/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Regression test for bug 2068870. A host with a single resolved address whose
// address has been reported unusable must still be reachable: the legacy
// nsIDNSAddrRecord::getNextAddr() path resets the blocklist when every address
// is blocklisted, but Happy Eyeballs v3 reads the address list through
// getAddresses(), which has no such recovery and hands the state machine zero
// candidates, surfacing as NS_ERROR_UNKNOWN_HOST.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);

const HOST = "single-address.example.com";

// Happy Eyeballs looks up A records with RESOLVE_DISABLE_IPV6, and the address
// family is part of the DNS cache key. The blocklist lives on the cached host
// record, so the lookup that poisons it must use the same family.
const A_RECORD_FLAGS = Ci.nsIDNSService.RESOLVE_DISABLE_IPV6;

let server;
let baseURL;

add_setup(async function () {
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);

  server = new HttpServer();
  server.registerPathHandler("/ok", (req, resp) => {
    resp.setStatusLine(req.httpVersion, 200, "OK");
    resp.setHeader("Content-Type", "text/plain", false);
    resp.write("ok");
  });
  server.start(-1);
  baseURL = `http://${HOST}:${server.identity.primaryPort}`;

  override.addIPOverride(HOST, "127.0.0.1");

  registerCleanupFunction(async () => {
    override.clearOverrides();
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    Services.dns.clearCache(true);
    await new Promise(resolve => server.stop(resolve));
  });
});

function fetchOk() {
  return new Promise(resolve => {
    let chan = NetUtil.newChannel({
      uri: `${baseURL}/ok`,
      loadUsingSystemPrincipal: true,
    });
    NetUtil.asyncFetch(chan, (stream, status) => {
      if (Components.isSuccessCode(status)) {
        // Drain the stream so the connection is returned cleanly.
        NetUtil.readInputStreamToString(stream, stream.available());
      }
      resolve(status);
    });
  });
}

function asyncResolveARecord() {
  return new Promise((resolve, reject) => {
    Services.dns.asyncResolve(
      HOST,
      Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
      A_RECORD_FLAGS,
      null,
      {
        onLookupComplete(request, record, status) {
          if (!Components.isSuccessCode(status)) {
            reject(status);
            return;
          }
          resolve(record.QueryInterface(Ci.nsIDNSAddrRecord));
        },
      },
      Services.tm.currentThread,
      {}
    );
  });
}

// Mark the host's only address unusable, the way a transport failure does.
async function blocklistSoleAddress() {
  let record = await asyncResolveARecord();
  let addresses = [];
  while (record.hasMore()) {
    addresses.push(record.getNextAddrAsString());
  }
  Assert.deepEqual(
    addresses,
    ["127.0.0.1"],
    "the test host must resolve to exactly one address"
  );

  // getNextAddrAsString() left the iterator on the last address returned.
  record.rewind();
  record.getNextAddrAsString();
  record.reportUnusable(server.identity.primaryPort);
}

add_task(async function test_single_address_still_usable_after_unusable() {
  Assert.equal(await fetchOk(), Cr.NS_OK, "first request succeeds");

  await blocklistSoleAddress();

  // Force a new connection attempt; the DNS cache (and its blocklist) is
  // deliberately left intact, which is what the reporter observed.
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  Services.obs.notifyObservers(null, "net:prune-all-connections");

  Assert.equal(
    await fetchOk(),
    Cr.NS_OK,
    "the sole address must still be tried after it was reported unusable"
  );
});
