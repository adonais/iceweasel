/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPChannelFilter } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs"
);

const { MasqueProtocol, ConnectProtocol, Server } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs"
);

add_task(async function test_constructProxyInfo_masque_protocol() {
  const authToken = "Bearer test-token";
  const isolationKey = "test-isolation-key";
  const fallBackInfo = null;

  const masqueProtocol = new MasqueProtocol({
    name: "masque",
    host: "masque.example.com",
    port: 443,
    templateString: "proxy/{target_host}/{target_port}/",
  });

  const proxyInfo = IPPChannelFilter.constructProxyInfo(
    authToken,
    isolationKey,
    masqueProtocol,
    fallBackInfo
  );

  Assert.equal(proxyInfo.type, "masque", "Proxy type should be masque");
  Assert.equal(proxyInfo.host, "masque.example.com", "Host should match");
  Assert.equal(proxyInfo.port, 443, "Port should match");
  Assert.equal(
    proxyInfo.connectionIsolationKey,
    isolationKey,
    "Isolation key should match"
  );
  Assert.equal(
    proxyInfo.flags & Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST,
    Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST,
    "Should have TRANSPARENT_PROXY_RESOLVES_HOST flag"
  );
  Assert.equal(
    proxyInfo.failoverTimeout,
    10,
    "Failover timeout should be 10 seconds"
  );
  Assert.equal(proxyInfo.failoverProxy, null, "Should have no fallback proxy");
});

add_task(async function test_constructProxyInfo_connect_protocol_https() {
  const authToken = "Bearer test-token";
  const isolationKey = "test-isolation-key";
  const fallBackInfo = null;

  const connectProtocol = new ConnectProtocol({
    name: "connect",
    host: "connect.example.com",
    port: 8443,
    scheme: "https",
  });

  const proxyInfo = IPPChannelFilter.constructProxyInfo(
    authToken,
    isolationKey,
    connectProtocol,
    fallBackInfo
  );

  Assert.equal(proxyInfo.type, "https", "Proxy type should be https");
  Assert.equal(proxyInfo.host, "connect.example.com", "Host should match");
  Assert.equal(proxyInfo.port, 8443, "Port should match");
  Assert.equal(
    proxyInfo.connectionIsolationKey,
    isolationKey,
    "Isolation key should match"
  );
  Assert.equal(
    proxyInfo.flags & Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST,
    Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST,
    "Should have TRANSPARENT_PROXY_RESOLVES_HOST flag"
  );
  Assert.equal(
    proxyInfo.failoverTimeout,
    10,
    "Failover timeout should be 10 seconds"
  );
  Assert.equal(proxyInfo.failoverProxy, null, "Should have no fallback proxy");
});

add_task(async function test_constructProxyInfo_connect_protocol_http() {
  const authToken = "Bearer test-token";
  const isolationKey = "test-isolation-key";
  const fallBackInfo = null;

  const connectProtocol = new ConnectProtocol({
    name: "connect",
    host: "connect.example.com",
    port: 8080,
    scheme: "http",
  });

  const proxyInfo = IPPChannelFilter.constructProxyInfo(
    authToken,
    isolationKey,
    connectProtocol,
    fallBackInfo
  );

  Assert.equal(proxyInfo.type, "http", "Proxy type should be http");
  Assert.equal(proxyInfo.host, "connect.example.com", "Host should match");
  Assert.equal(proxyInfo.port, 8080, "Port should match");
  Assert.equal(
    proxyInfo.connectionIsolationKey,
    isolationKey,
    "Isolation key should match"
  );
});

add_task(async function test_constructProxyInfo_with_fallback() {
  const authToken = "Bearer test-token";
  const isolationKey = "test-isolation-key";

  // Create a fallback proxy
  const fallbackProtocol = new ConnectProtocol({
    name: "connect",
    host: "fallback.example.com",
    port: 8080,
    scheme: "http",
  });

  const fallBackInfo = IPPChannelFilter.constructProxyInfo(
    authToken,
    isolationKey,
    fallbackProtocol,
    null
  );

  const primaryProtocol = new MasqueProtocol({
    name: "masque",
    host: "primary.example.com",
    port: 443,
    templateString: "proxy/{target_host}/{target_port}/",
  });

  const proxyInfo = IPPChannelFilter.constructProxyInfo(
    authToken,
    isolationKey,
    primaryProtocol,
    fallBackInfo
  );

  Assert.equal(proxyInfo.type, "masque", "Primary proxy type should be masque");
  Assert.equal(
    proxyInfo.host,
    "primary.example.com",
    "Primary host should match"
  );
  Assert.notEqual(
    proxyInfo.failoverProxy,
    null,
    "Should have a fallback proxy"
  );
  Assert.equal(
    proxyInfo.failoverProxy.type,
    "http",
    "Fallback proxy type should be http"
  );
  Assert.equal(
    proxyInfo.failoverProxy.host,
    "fallback.example.com",
    "Fallback host should match"
  );
});

add_task(async function test_constructProxyInfo_unknown_protocol() {
  const authToken = "Bearer test-token";
  const isolationKey = "test-isolation-key";

  const unknownProtocol = {
    name: "unknown",
    host: "unknown.example.com",
    port: 443,
  };

  Assert.throws(
    () =>
      IPPChannelFilter.constructProxyInfo(
        authToken,
        isolationKey,
        unknownProtocol,
        null
      ),
    /Cannot construct ProxyInfo for Unknown server-protocol: unknown/,
    "Should throw error for unknown protocol"
  );
});

add_task(async function test_serverToProxyInfo_single_protocol() {
  const authToken = "Bearer test-token";

  const server = new Server({
    hostname: "single.example.com",
    port: 443,
    protocols: [
      {
        name: "masque",
        host: "single.example.com",
        port: 443,
        templateString: "proxy/{target_host}/{target_port}/",
      },
    ],
  });

  const proxyInfo = IPPChannelFilter.serverToProxyInfo(authToken, server);

  Assert.equal(proxyInfo.type, "masque", "Proxy type should be masque");
  Assert.equal(proxyInfo.host, "single.example.com", "Host should match");
  Assert.equal(proxyInfo.port, 443, "Port should match");
  Assert.equal(proxyInfo.failoverProxy, null, "Should have no fallback proxy");
  Assert.notEqual(
    proxyInfo.connectionIsolationKey,
    "",
    "Should have generated isolation key"
  );
});

add_task(
  async function test_serverToProxyInfo_multiple_protocols_fallback_chain() {
    const authToken = "Bearer test-token";

    const server = new Server({
      hostname: "multi.example.com",
      port: 443,
      protocols: [
        {
          name: "masque",
          host: "multi.example.com",
          port: 443,
          templateString: "proxy/{target_host}/{target_port}/",
        },
        {
          name: "connect",
          host: "multi.example.com",
          port: 8443,
          scheme: "https",
        },
        {
          name: "connect",
          host: "multi.example.com",
          port: 8080,
          scheme: "http",
        },
      ],
    });

    const proxyInfo = IPPChannelFilter.serverToProxyInfo(authToken, server);

    // Verify the primary proxy (first protocol - masque)
    Assert.equal(
      proxyInfo.type,
      "masque",
      "Primary proxy type should be masque"
    );
    Assert.equal(
      proxyInfo.host,
      "multi.example.com",
      "Primary host should match"
    );
    Assert.equal(proxyInfo.port, 443, "Primary port should match");

    // Verify the first fallback (second protocol - https connect)
    const firstFallback = proxyInfo.failoverProxy;
    Assert.notEqual(firstFallback, null, "Should have first fallback proxy");
    Assert.equal(
      firstFallback.type,
      "https",
      "First fallback type should be https"
    );
    Assert.equal(
      firstFallback.host,
      "multi.example.com",
      "First fallback host should match"
    );
    Assert.equal(firstFallback.port, 8443, "First fallback port should match");

    // Verify the second fallback (third protocol - http connect)
    const secondFallback = firstFallback.failoverProxy;
    Assert.notEqual(secondFallback, null, "Should have second fallback proxy");
    Assert.equal(
      secondFallback.type,
      "http",
      "Second fallback type should be http"
    );
    Assert.equal(
      secondFallback.host,
      "multi.example.com",
      "Second fallback host should match"
    );
    Assert.equal(
      secondFallback.port,
      8080,
      "Second fallback port should match"
    );

    // Verify end of chain
    Assert.equal(
      secondFallback.failoverProxy,
      null,
      "Should be end of fallback chain"
    );

    // Verify all proxies share the same isolation key
    const isolationKey = proxyInfo.connectionIsolationKey;
    Assert.equal(
      firstFallback.connectionIsolationKey,
      isolationKey,
      "First fallback should share isolation key"
    );
    Assert.equal(
      secondFallback.connectionIsolationKey,
      isolationKey,
      "Second fallback should share isolation key"
    );
  }
);

add_task(async function test_serverToProxyInfo_empty_protocols() {
  const authToken = "Bearer test-token";

  // Server with no protocols (should default to connect)
  const server = new Server({
    hostname: "default.example.com",
    port: 443,
    protocols: [],
  });

  const proxyInfo = IPPChannelFilter.serverToProxyInfo(authToken, server);

  Assert.equal(proxyInfo.type, "https", "Should default to https connect");
  Assert.equal(proxyInfo.host, "default.example.com", "Host should match");
  Assert.equal(proxyInfo.port, 443, "Port should match");
  Assert.equal(proxyInfo.failoverProxy, null, "Should have no fallback proxy");
});

add_task(async function test_serverToProxyInfo_isolation_key_uniqueness() {
  const authToken = "Bearer test-token";

  const server = new Server({
    hostname: "isolation.example.com",
    port: 443,
    protocols: [
      {
        name: "connect",
        host: "isolation.example.com",
        port: 443,
        scheme: "https",
      },
    ],
  });

  const proxyInfo1 = IPPChannelFilter.serverToProxyInfo(authToken, server);
  const proxyInfo2 = IPPChannelFilter.serverToProxyInfo(authToken, server);

  Assert.notEqual(
    proxyInfo1.connectionIsolationKey,
    proxyInfo2.connectionIsolationKey,
    "Each call should generate unique isolation keys"
  );
});
