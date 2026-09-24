/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

let h2Port;
let h3Port;
let trrServer;

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);

add_setup(async function setup() {
  h3Port = Services.env.get("MOZHTTP3_PORT_NO_RESPONSE");
  Assert.notEqual(h3Port, null);
  Assert.notEqual(h3Port, "");

  trrServer = new TRRServer();
  await trrServer.start();
  h2Port = trrServer.port();

  trr_test_setup();

  if (mozinfo.socketprocess_networking) {
    Services.dns; // Needed to trigger socket process.
    await TestUtils.waitForCondition(() => Services.io.socketProcessLaunched);
  }

  Services.prefs.setIntPref("network.trr.mode", 2); // TRR first
  Services.prefs.setBoolPref("network.http.http3.enable", true);
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
  Services.prefs.setBoolPref(
    "network.dns.https_rr.check_record_with_cname",
    false
  );

  registerCleanupFunction(async () => {
    trr_clear_prefs();
    Services.prefs.clearUserPref("network.dns.upgrade_with_https_rr");
    Services.prefs.clearUserPref("network.dns.use_https_rr_as_altsvc");
    Services.prefs.clearUserPref("network.dns.echconfig.enabled");
    Services.prefs.clearUserPref("network.dns.http3_echconfig.enabled");
    Services.prefs.clearUserPref(
      "network.dns.echconfig.fallback_to_origin_when_all_failed"
    );
    Services.prefs.clearUserPref("network.dns.httpssvc.reset_exclustion_list");
    Services.prefs.clearUserPref("network.http.http3.enable");
    Services.prefs.clearUserPref(
      "network.dns.httpssvc.http3_fast_fallback_timeout"
    );
    Services.prefs.clearUserPref(
      "network.http.http3.alt-svc-mapping-for-testing"
    );
    Services.prefs.clearUserPref("network.http.http3.backup_timer_delay");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    Services.prefs.clearUserPref(
      "network.http.http3.parallel_fallback_conn_limit"
    );
    Services.prefs.clearUserPref(
      "network.dns.https_rr.check_record_with_cname"
    );
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref(
      "network.http.max-persistent-connections-per-server"
    );
    if (trrServer) {
      await trrServer.stop();
    }
  });
});

function makeChan(url) {
  let chan = NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
  return chan;
}

function channelOpenPromise(chan, flags, delay) {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async resolve => {
    function finish(req, buffer) {
      resolve([req, buffer]);
      certOverrideService.setDisableAllSecurityChecksAndLetAttackersInterceptMyData(
        false
      );
    }
    certOverrideService.setDisableAllSecurityChecksAndLetAttackersInterceptMyData(
      true
    );
    if (delay) {
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(r => setTimeout(r, delay));
    }
    chan.asyncOpen(new ChannelListener(finish, null, flags));
  });
}

let CheckOnlyHttp2Listener = function () {};

CheckOnlyHttp2Listener.prototype = {
  onStartRequest: function testOnStartRequest() {},

  onDataAvailable: function testOnDataAvailable(request, stream, off, cnt) {
    read_stream(stream, cnt);
  },

  onStopRequest: function testOnStopRequest(request, status) {
    Assert.equal(status, Cr.NS_OK);
    let httpVersion = "";
    try {
      httpVersion = request.protocolVersion;
    } catch (e) {}
    Assert.equal(httpVersion, "h2");

    let routed = "NA";
    try {
      routed = request.getRequestHeader("Alt-Used");
    } catch (e) {}
    dump("routed is " + routed + "\n");
    Assert.ok(routed === "0" || routed === "NA");
    this.finish();
  },
};

async function fast_fallback_test() {
  let result = 1;
  // We need to loop here because we need to wait for AltSvc storage to
  // to be started.
  // We also do not have a way to verify that HTTP3 has been tried, because
  // the fallback is automatic, so try a couple of times.
  do {
    // We need to close HTTP2 connections, otherwise our connection pooling
    // will dispatch the request over already existing HTTP2 connection.
    Services.obs.notifyObservers(null, "net:prune-all-connections");
    let chan = makeChan(`https://foo.example.com:${h2Port}/`);
    let listener = new CheckOnlyHttp2Listener();
    await altsvcSetupPromise(chan, listener);
    result++;
  } while (result < 3);
}

// Test the case when speculative connection is enabled. In this case, when the
// backup connection is ready, the http transaction is still in pending
// queue because the h3 connection is never ready to accept transactions.
add_task(async function test_fast_fallback_with_speculative_connection() {
  Services.prefs.setBoolPref("network.http.http3.enable", true);
  Services.prefs.setCharPref("network.dns.localDomains", "foo.example.com");
  // Set AltSvc to point to not existing HTTP3 server on port 443
  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    "foo.example.com;h3=:" + h3Port
  );
  Services.prefs.setBoolPref("network.dns.disableIPv6", true);
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);

  await fast_fallback_test();
});

// Test the case when speculative connection is disabled. In this case, when the
// back connection is ready, the http transaction is already activated,
// but the socket is not ready to write.
add_task(async function test_fast_fallback_without_speculative_connection() {
  // Make sure the h3 connection created by the previous test is cleared.
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Clear the h3 excluded list, otherwise the Alt-Svc mapping will not be used.
  Services.obs.notifyObservers(null, "network:reset-http3-excluded-list");
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);

  await fast_fallback_test();

  Services.prefs.clearUserPref(
    "network.http.http3.alt-svc-mapping-for-testing"
  );
});

// Test when echConfig is disabled and we have https rr for http3. We use a
// longer timeout in this test, so when fast fallback timer is triggered, the
// http transaction is already activated.
add_task(async function testFastfallback() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", false);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    1000
  );

  await trrServer.registerDoHAnswers("test.fastfallback.com", "HTTPS", {
    answers: [
      {
        name: "test.fastfallback.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.fastfallback1.com",
          values: [
            { key: "alpn", value: "h3" },
            { key: "no-default-alpn" },
            { key: "port", value: h3Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
      {
        name: "test.fastfallback.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 2,
          name: "test.fastfallback2.com",
          values: [
            { key: "alpn", value: "h2" },
            { key: "port", value: h2Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.fastfallback1.com", "A", {
    answers: [
      {
        name: "test.fastfallback1.com",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.fastfallback2.com", "A", {
    answers: [
      {
        name: "test.fastfallback2.com",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.fastfallback.com/server-timing`);
  let [req] = await channelOpenPromise(chan);
  Assert.equal(req.protocolVersion, "h2");
  let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
  Assert.equal(internal.remotePort, h2Port);
});

// Like the previous test, but with a shorter timeout, so when fast fallback
// timer is triggered, the http transaction is still in pending queue.
add_task(async function testFastfallback1() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", false);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    10
  );

  await trrServer.registerDoHAnswers("test.fastfallback.org", "HTTPS", {
    answers: [
      {
        name: "test.fastfallback.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.fastfallback1.org",
          values: [
            { key: "alpn", value: "h3" },
            { key: "no-default-alpn" },
            { key: "port", value: h3Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
      {
        name: "test.fastfallback.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 2,
          name: "test.fastfallback2.org",
          values: [
            { key: "alpn", value: "h2" },
            { key: "port", value: h2Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.fastfallback1.org", "A", {
    answers: [
      {
        name: "test.fastfallback1.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.fastfallback2.org", "A", {
    answers: [
      {
        name: "test.fastfallback2.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.fastfallback.org/server-timing`);
  let [req] = await channelOpenPromise(chan);
  Assert.equal(req.protocolVersion, "h2");
  let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
  Assert.equal(internal.remotePort, h2Port);
});

// Test when echConfig is enabled, we can sucessfully fallback to the last
// record.
add_task(async function testFastfallbackWithEchConfig() {
  // XXX(valenting): This test takes 30s to fallback.
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", true);
  Services.prefs.setBoolPref("network.dns.http3_echconfig.enabled", true);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    50
  );

  await trrServer.registerDoHAnswers("test.ech.org", "HTTPS", {
    answers: [
      {
        name: "test.ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.ech1.org",
          values: [
            { key: "alpn", value: "h3" },
            { key: "port", value: h3Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
      {
        name: "test.ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 2,
          name: "test.ech2.org",
          values: [
            { key: "alpn", value: "h2" },
            { key: "port", value: h2Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
      {
        name: "test.ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 3,
          name: "test.ech3.org",
          values: [
            { key: "alpn", value: "h2" },
            { key: "port", value: h2Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.ech1.org", "A", {
    answers: [
      {
        name: "test.ech1.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.ech3.org", "A", {
    answers: [
      {
        name: "test.ech3.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.ech.org/server-timing`);
  let [req] = await channelOpenPromise(chan);
  Assert.equal(req.protocolVersion, "h2");
  let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
  Assert.equal(internal.remotePort, h2Port);
});

// Test when echConfig is enabled, the connection should fail when not all
// records have echConfig.
add_task(async function testFastfallbackWithpartialEchConfig() {
  // XXX(valenting): This test takes 30s to fallback.
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", true);
  Services.prefs.setBoolPref("network.dns.http3_echconfig.enabled", true);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    50
  );

  await trrServer.registerDoHAnswers("test.partial_ech.org", "HTTPS", {
    answers: [
      {
        name: "test.partial_ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.partial_ech1.org",
          values: [
            { key: "alpn", value: "h3" },
            { key: "port", value: h3Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
      {
        name: "test.partial_ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 2,
          name: "test.partial_ech2.org",
          values: [
            { key: "alpn", value: "h2" },
            { key: "port", value: h2Port },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.partial_ech1.org", "A", {
    answers: [
      {
        name: "test.partial_ech1.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.partial_ech2.org", "A", {
    answers: [
      {
        name: "test.partial_ech2.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.partial_ech.org/server-timing`);
  await channelOpenPromise(chan, CL_EXPECT_LATE_FAILURE | CL_ALLOW_UNKNOWN_CL);
});

add_task(async function testFastfallbackWithoutEchConfig() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    50
  );

  await trrServer.registerDoHAnswers("test.no_ech_h2.org", "HTTPS", {
    answers: [
      {
        name: "test.no_ech_h2.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.no_ech_h3.org",
          values: [
            { key: "alpn", value: "h3" },
            { key: "port", value: h3Port },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.no_ech_h3.org", "A", {
    answers: [
      {
        name: "test.no_ech_h3.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.no_ech_h2.org", "A", {
    answers: [
      {
        name: "test.no_ech_h2.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.no_ech_h2.org:${h2Port}/server-timing`);
  let [req] = await channelOpenPromise(chan);
  Assert.equal(req.protocolVersion, "h2");
  let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
  Assert.equal(internal.remotePort, h2Port);
});

add_task(async function testH3FallbackWithMultipleTransactions() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", false);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  // Disable fast fallback.
  Services.prefs.setIntPref(
    "network.http.http3.parallel_fallback_conn_limit",
    0
  );
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);

  await trrServer.registerDoHAnswers("test.multiple_trans.org", "HTTPS", {
    answers: [
      {
        name: "test.multiple_trans.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.multiple_trans.org",
          values: [
            { key: "alpn", value: "h3" },
            { key: "port", value: h3Port },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.multiple_trans.org", "A", {
    answers: [
      {
        name: "test.multiple_trans.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let promises = [];
  for (let i = 0; i < 2; ++i) {
    let chan = makeChan(
      `https://test.multiple_trans.org:${h2Port}/server-timing`
    );
    promises.push(channelOpenPromise(chan));
  }

  let res = await Promise.all(promises);
  res.forEach(function (e) {
    let [req] = e;
    Assert.equal(req.protocolVersion, "h2");
    let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
    Assert.equal(internal.remotePort, h2Port);
  });
});

add_task(async function testTwoFastFallbackTimers() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", false);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
  Services.prefs.clearUserPref(
    "network.http.http3.parallel_fallback_conn_limit"
  );

  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    "foo.fallback.org;h3=:" + h3Port
  );

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    10
  );
  Services.prefs.setIntPref("network.http.http3.backup_timer_delay", 100);

  await trrServer.registerDoHAnswers("foo.fallback.org", "HTTPS", {
    answers: [
      {
        name: "foo.fallback.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "foo.fallback.org",
          values: [
            { key: "alpn", value: "h3" },
            { key: "port", value: h3Port },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("foo.fallback.org", "A", {
    answers: [
      {
        name: "foo.fallback.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  // Test the case that http3 backup timer is triggered after
  // fast fallback timer or HTTPS RR.
  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    10
  );
  Services.prefs.setIntPref("network.http.http3.backup_timer_delay", 100);

  async function createChannelAndStartTest() {
    let chan = makeChan(`https://foo.fallback.org:${h2Port}/server-timing`);
    let [req] = await channelOpenPromise(chan);
    Assert.equal(req.protocolVersion, "h2");
    let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
    Assert.equal(internal.remotePort, h2Port);
  }

  await createChannelAndStartTest();

  Services.obs.notifyObservers(null, "net:prune-all-connections");
  Services.obs.notifyObservers(null, "network:reset-http3-excluded-list");
  Services.dns.clearCache(true);

  // Do the same test again, but with a different configuration.
  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    100
  );
  Services.prefs.setIntPref("network.http.http3.backup_timer_delay", 10);

  await createChannelAndStartTest();
});

add_task(async function testH3FastFallbackWithMultipleTransactions() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", false);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
  Services.prefs.clearUserPref(
    "network.http.http3.parallel_fallback_conn_limit"
  );

  Services.prefs.setIntPref("network.http.http3.backup_timer_delay", 500);

  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    "test.multiple_fallback_trans.org;h3=:" + h3Port
  );

  await trrServer.registerDoHAnswers("test.multiple_fallback_trans.org", "A", {
    answers: [
      {
        name: "test.multiple_fallback_trans.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let promises = [];
  for (let i = 0; i < 3; ++i) {
    let chan = makeChan(
      `https://test.multiple_fallback_trans.org:${h2Port}/server-timing`
    );
    if (i == 0) {
      promises.push(channelOpenPromise(chan));
    } else {
      promises.push(channelOpenPromise(chan, null, 500));
    }
  }

  let res = await Promise.all(promises);
  res.forEach(function (e) {
    let [req] = e;
    Assert.equal(req.protocolVersion, "h2");
    let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
    Assert.equal(internal.remotePort, h2Port);
  });
});

add_task(async function testFastfallbackToTheSameRecord() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", true);
  Services.prefs.setBoolPref("network.dns.http3_echconfig.enabled", true);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    1000
  );

  await trrServer.registerDoHAnswers("test.ech.org", "HTTPS", {
    answers: [
      {
        name: "test.ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.ech1.org",
          values: [
            { key: "alpn", value: ["h3", "h2"] },
            { key: "port", value: h2Port },
            { key: "echconfig", value: "456..." },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.ech1.org", "A", {
    answers: [
      {
        name: "test.ech1.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.ech.org/server-timing`);
  let [req] = await channelOpenPromise(chan);
  Assert.equal(req.protocolVersion, "h2");
  let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
  Assert.equal(internal.remotePort, h2Port);
});

// Similar to the previous test, but no ech.
add_task(async function testFastfallbackToTheSameRecord1() {
  Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  Services.prefs.setBoolPref("network.dns.echconfig.enabled", true);
  Services.prefs.setBoolPref("network.dns.http3_echconfig.enabled", true);

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.http.http3.enable", true);

  Services.prefs.setIntPref(
    "network.dns.httpssvc.http3_fast_fallback_timeout",
    1000
  );

  await trrServer.registerDoHAnswers("test.no_ech.org", "HTTPS", {
    answers: [
      {
        name: "test.no_ech.org",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "test.no_ech.org",
          values: [
            { key: "alpn", value: ["h3", "h2"] },
            { key: "port", value: h2Port },
          ],
        },
      },
    ],
  });

  await trrServer.registerDoHAnswers("test.no_ech.org", "A", {
    answers: [
      {
        name: "test.no_ech.org",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  let chan = makeChan(`https://test.no_ech.org/server-timing`);
  let [req] = await channelOpenPromise(chan);
  Assert.equal(req.protocolVersion, "h2");
  let internal = req.QueryInterface(Ci.nsIHttpChannelInternal);
  Assert.equal(internal.remotePort, h2Port);
});

// Resolves on onStopRequest whatever the status is, so that a transaction
// stuck behind a dead HTTP/3 connection can be reported by the test itself
// instead of hanging the whole run.
function openChannelAndWaitForStop(chan) {
  return new Promise(resolve => {
    chan.asyncOpen({
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
      onStartRequest() {},
      onDataAvailable(request, stream, offset, count) {
        read_stream(stream, count);
      },
      onStopRequest(request, status) {
        resolve({ request, status });
      },
    });
  });
}

// When DoSpeculativeConnectionInternal() cannot create the backup socket for
// an HTTPS RR fast fallback, it logs and returns, dropping the
// FallbackTransaction's result callback. Nothing re-arms the timer, so the
// transaction never gets OnBackupConnectionReady() and sits on the HTTP/3
// connection entry until the QUIC connection times out, with every later
// request to the same origin queued behind it, even though the origin is
// reachable over h2.
//
// This is reached when several fast fallbacks race and the fallback connection
// entry hits max-persistent-connections-per-server. Over loopback a backup
// connection normally completes before the next fast fallback timer fires, so
// the entry never fills up. The fallback target is therefore pointed at a TCP
// proxy that sits on the connection for a while before forwarding it to the h2
// server, which holds the first backup connections open while the remaining
// fast fallback timers fire. Delaying DNS instead would not work: it also
// delays the other transactions' fast fallback timers by the same amount, so
// they never overlap.
add_task(
  { skip_if: () => AppConstants.platform == "android" },
  async function testH3FastFallbackAtConnectionLimit() {
    const kNumTransactions = 6;
    const kMaxPersistConns = 2;
    // Comfortably longer than the spread between the fast fallback timers.
    const kConnectDelayMs = 2000;
    const kTimeoutMs = 10000;

    Services.obs.notifyObservers(null, "net:cancel-all-connections");
    Services.obs.notifyObservers(null, "network:reset-http3-excluded-list");
    Services.dns.clearCache(true);

    Services.prefs.setBoolPref("network.dns.upgrade_with_https_rr", true);
    Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
    Services.prefs.setBoolPref("network.dns.echconfig.enabled", false);
    Services.prefs.setBoolPref("network.http.http3.enable", true);

    Services.prefs.setIntPref("network.trr.mode", 3);
    Services.prefs.setCharPref(
      "network.trr.uri",
      `https://foo.example.com:${trrServer.port()}/dns-query`
    );

    Services.prefs.setIntPref(
      "network.dns.httpssvc.http3_fast_fallback_timeout",
      10
    );
    Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
    Services.prefs.clearUserPref(
      "network.http.http3.parallel_fallback_conn_limit"
    );
    Services.prefs.clearUserPref("network.http.http3.backup_timer_delay");
    // Happy Eyeballs supersedes nsHttpTransaction's fast fallback timer, which
    // is the path under test here (and the one release builds still use).
    Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", false);
    // Only a couple of backup connections fit before the entry is full.
    Services.prefs.setIntPref(
      "network.http.max-persistent-connections-per-server",
      kMaxPersistConns
    );

    // Accepts a connection, waits, then splices it to the h2 server. TLS is not
    // terminated here, so the client still sees the real server's certificate.
    let slowPort = await trrServer.execute(`
    (() => {
      const net = require("net");
      global.slowConnectProxy = net.createServer(client => {
        client.on("error", () => {});
        setTimeout(() => {
          let upstream = net.connect(${h2Port}, "127.0.0.1", () => {
            client.pipe(upstream);
            upstream.pipe(client);
          });
          upstream.on("error", () => client.destroy());
        }, ${kConnectDelayMs});
      });
      return new Promise(resolve => {
        global.slowConnectProxy.listen(0, "127.0.0.1", () =>
          resolve(global.slowConnectProxy.address().port)
        );
      });
    })()
  `);

    await trrServer.registerDoHAnswers("test.fallback_limit.org", "HTTPS", {
      answers: [
        {
          name: "test.fallback_limit.org",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 1,
            name: "test.fallback_limit1.org",
            values: [
              { key: "alpn", value: "h3" },
              { key: "no-default-alpn" },
              { key: "port", value: h3Port },
            ],
          },
        },
        {
          name: "test.fallback_limit.org",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 2,
            name: "test.fallback_limit2.org",
            values: [
              { key: "alpn", value: "h2" },
              { key: "port", value: slowPort },
            ],
          },
        },
      ],
    });

    await trrServer.registerDoHAnswers("test.fallback_limit1.org", "A", {
      answers: [
        {
          name: "test.fallback_limit1.org",
          ttl: 55,
          type: "A",
          flush: false,
          data: "127.0.0.1",
        },
      ],
    });

    await trrServer.registerDoHAnswers("test.fallback_limit2.org", "A", {
      answers: [
        {
          name: "test.fallback_limit2.org",
          ttl: 55,
          type: "A",
          flush: false,
          data: "127.0.0.1",
        },
      ],
    });

    certOverrideService.setDisableAllSecurityChecksAndLetAttackersInterceptMyData(
      true
    );

    let channels = [];
    let promises = [];
    for (let i = 0; i < kNumTransactions; ++i) {
      // Distinct URLs: requests for one URL contend on a single cache entry and
      // would run one at a time, which is the opposite of what this test needs.
      let chan = makeChan(
        `https://test.fallback_limit.org/server-timing?i=${i}`
      );
      channels.push(chan);
      promises.push(openChannelAndWaitForStop(chan));
    }

    let timedOut = false;
    let timer;
    await Promise.race([
      Promise.all(promises),
      new Promise(resolve => {
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        timer = setTimeout(() => {
          timedOut = true;
          resolve();
        }, kTimeoutMs);
      }),
    ]);
    clearTimeout(timer);

    if (timedOut) {
      // Unblock the stuck transactions so the rest of the run can shut down.
      channels.forEach(chan => chan.cancel(Cr.NS_BINDING_ABORTED));
    }

    let results = await Promise.all(promises);
    certOverrideService.setDisableAllSecurityChecksAndLetAttackersInterceptMyData(
      false
    );
    await trrServer.execute(`global.slowConnectProxy.close(); "closed"`);

    // Assert only once everything above has run: a failing assertion throws and
    // would otherwise leave the channels open for the rest of the run.
    Assert.ok(
      !timedOut,
      `all ${kNumTransactions} transactions fell back to h2 within ${kTimeoutMs}ms`
    );

    results.forEach(({ request, status }) => {
      Assert.equal(status, Cr.NS_OK);
      Assert.equal(request.protocolVersion, "h2");
      let internal = request.QueryInterface(Ci.nsIHttpChannelInternal);
      Assert.equal(internal.remotePort, slowPort);
    });
  }
);
