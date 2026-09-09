/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Proxy resolution for TRR happens against a channel synthesized by
   ProxyConfigLookup rather than the TRRServiceChannel itself. This test checks
   that the synthesized channel still reports isTRRServiceChannel, so that
   proxy filters (notably IP Protection's, which must keep DoH out of the
   tunnel to avoid a circular resolution dependency) can recognize DoH traffic.
*/

"use strict";

/* import-globals-from head_trr.js */

const pps = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(
  Ci.nsIProtocolProxyService
);

trr_test_setup();
registerCleanupFunction(async () => {
  trr_clear_prefs();
  Services.prefs.clearUserPref("network.trr.async_connInfo");
});

// Records, per URI, whether the channel handed to the filter claimed to be a
// TRR service channel. Leaves the proxy decision untouched.
class RecordingChannelFilter {
  constructor() {
    this.seen = new Map();
    this.QueryInterface = ChromeUtils.generateQI([
      "nsIProtocolProxyChannelFilter",
    ]);
  }

  applyFilter(channel, proxyInfo, callback) {
    let isTRR = false;
    try {
      isTRR = channel.QueryInterface(
        Ci.nsIHttpChannelInternal
      ).isTRRServiceChannel;
    } catch (e) {
      // Not an HTTP channel; leave isTRR false.
    }
    this.seen.set(channel.URI.spec, isTRR);
    callback.onProxyFilterResult(proxyInfo);
  }
}

async function doTest(asyncConnInfo, hostname) {
  Services.prefs.setBoolPref("network.trr.async_connInfo", asyncConnInfo);

  let trrServer = new TRRServer();
  await trrServer.start();

  let filter = new RecordingChannelFilter();
  pps.registerChannelFilter(filter, 10);

  try {
    Services.dns.clearCache(true);
    let trrURI = `https://foo.example.com:${trrServer.port()}/dns-query`;
    Services.prefs.setIntPref("network.trr.mode", 3);
    Services.prefs.setCharPref("network.trr.uri", trrURI);

    await trrServer.registerDoHAnswers(hostname, "A", {
      answers: [
        {
          name: hostname,
          ttl: 55,
          type: "A",
          flush: false,
          data: "2.2.2.2",
        },
      ],
    });

    await new TRRDNSListener(hostname, "2.2.2.2");

    // A GET-style DoH request carries the query in a "?dns=" parameter, so
    // match on the DoH endpoint rather than the full spec.
    let dohEntries = [...filter.seen].filter(([spec]) =>
      spec.startsWith(trrURI)
    );
    info(`filter saw: ${JSON.stringify([...filter.seen.keys()])}`);

    Assert.greater(
      dohEntries.length,
      0,
      `async_connInfo=${asyncConnInfo}: the proxy filter should have been ` +
        `consulted for the DoH URI`
    );
    Assert.ok(
      dohEntries.every(([, isTRR]) => isTRR),
      `async_connInfo=${asyncConnInfo}: every channel handed to the proxy ` +
        `filter for the DoH URI should report isTRRServiceChannel`
    );
  } finally {
    pps.unregisterChannelFilter(filter);
    await trrServer.stop();
  }
}

add_task(async function test_doh_flagged_for_filters_sync_conninfo() {
  await doTest(false, "sync.example.com");
});

add_task(async function test_doh_flagged_for_filters_async_conninfo() {
  await doTest(true, "async.example.com");
});
