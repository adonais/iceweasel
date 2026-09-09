"use strict";

const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);
const defaultOriginAttributes = {};
const mainThread = Services.tm.currentThread;

class Listener {
  constructor() {
    this.promise = new Promise(resolve => {
      this.resolve = resolve;
    });
  }

  onLookupComplete(inRequest, inRecord, inStatus) {
    this.resolve([inRequest, inRecord, inStatus]);
  }

  async firstAddress() {
    let all = await this.addresses();
    if (all.length) {
      return all[0];
    }

    return undefined;
  }

  async addresses() {
    let [, inRecord] = await this.promise;
    let addresses = [];
    if (!inRecord) {
      return addresses; // returns []
    }
    inRecord.QueryInterface(Ci.nsIDNSAddrRecord);
    while (inRecord.hasMore()) {
      addresses.push(inRecord.getNextAddrAsString());
    }
    return addresses;
  }

  then() {
    return this.promise.then.apply(this.promise, arguments);
  }
}
Listener.prototype.QueryInterface = ChromeUtils.generateQI(["nsIDNSListener"]);

const DOMAIN = "example.org";
const OTHER = "example.com";

add_setup(async function setup() {
  trr_test_setup();
  // For canon-name flags
  Services.prefs.setBoolPref("network.dns.always_ai_canonname", false);

  registerCleanupFunction(async () => {
    trr_clear_prefs();
  });
});

add_task(async function test_bad_IPs() {
  Assert.throws(
    () => override.addIPOverride(DOMAIN, DOMAIN),
    /NS_ERROR_UNEXPECTED/,
    "Should throw if input is not an IP address"
  );
  Assert.throws(
    () => override.addIPOverride(DOMAIN, ""),
    /NS_ERROR_UNEXPECTED/,
    "Should throw if input is not an IP address"
  );
  Assert.throws(
    () => override.addIPOverride(DOMAIN, " "),
    /NS_ERROR_UNEXPECTED/,
    "Should throw if input is not an IP address"
  );
  Assert.throws(
    () => override.addIPOverride(DOMAIN, "1-2-3-4"),
    /NS_ERROR_UNEXPECTED/,
    "Should throw if input is not an IP address"
  );
});

add_task(async function test_ipv4() {
  let listener = new Listener();
  override.addIPOverride(DOMAIN, "1.2.3.4");
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.equal(await listener.firstAddress(), "1.2.3.4");

  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_ipv6() {
  let listener = new Listener();
  override.addIPOverride(DOMAIN, "fe80::6a99:9b2b:6ccc:6e1b");
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.equal(await listener.firstAddress(), "fe80::6a99:9b2b:6ccc:6e1b");

  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_clearOverrides() {
  let listener = new Listener();
  override.addIPOverride(DOMAIN, "1.2.3.4");
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.equal(await listener.firstAddress(), "1.2.3.4");

  Services.dns.clearCache(false);
  override.clearOverrides();

  listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.notEqual(await listener.firstAddress(), "1.2.3.4");

  await new Promise(resolve => do_timeout(1000, resolve));
  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_clearHostOverride() {
  override.addIPOverride(DOMAIN, "2.2.2.2");
  override.addIPOverride(OTHER, "2.2.2.2");
  override.clearHostOverride(DOMAIN);
  let listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );

  Assert.notEqual(await listener.firstAddress(), "2.2.2.2");

  listener = new Listener();
  Services.dns.asyncResolve(
    OTHER,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.equal(await listener.firstAddress(), "2.2.2.2");

  // Note: this test will use the actual system resolver. On windows we do a
  // second async call to the system libraries to get the TTL values, which
  // keeps the record alive after the onLookupComplete()
  // We need to wait for a bit, until the second call is finished before we
  // can clear the cache to make sure we evict everything.
  // If the next task ever starts failing, with an IP that is not in this
  // file, then likely the timeout is too small.
  await new Promise(resolve => do_timeout(1000, resolve));
  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_multiple_IPs() {
  override.addIPOverride(DOMAIN, "2.2.2.2");
  override.addIPOverride(DOMAIN, "1.1.1.1");
  override.addIPOverride(DOMAIN, "::1");
  override.addIPOverride(DOMAIN, "fe80::6a99:9b2b:6ccc:6e1b");
  let listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.deepEqual(await listener.addresses(), [
    "2.2.2.2",
    "1.1.1.1",
    "::1",
    "fe80::6a99:9b2b:6ccc:6e1b",
  ]);

  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_address_family_flags() {
  override.addIPOverride(DOMAIN, "2.2.2.2");
  override.addIPOverride(DOMAIN, "1.1.1.1");
  override.addIPOverride(DOMAIN, "::1");
  override.addIPOverride(DOMAIN, "fe80::6a99:9b2b:6ccc:6e1b");
  let listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    Ci.nsIDNSService.RESOLVE_DISABLE_IPV4,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.deepEqual(await listener.addresses(), [
    "::1",
    "fe80::6a99:9b2b:6ccc:6e1b",
  ]);

  listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    Ci.nsIDNSService.RESOLVE_DISABLE_IPV6,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  Assert.deepEqual(await listener.addresses(), ["2.2.2.2", "1.1.1.1"]);

  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_cname_flag() {
  override.addIPOverride(DOMAIN, "2.2.2.2");
  let listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  let [, inRecord] = await listener;
  inRecord.QueryInterface(Ci.nsIDNSAddrRecord);
  Assert.throws(
    () => inRecord.canonicalName,
    /NS_ERROR_NOT_AVAILABLE/,
    "No canonical name flag"
  );
  Assert.equal(inRecord.getNextAddrAsString(), "2.2.2.2");

  listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    Ci.nsIDNSService.RESOLVE_CANONICAL_NAME,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  [, inRecord] = await listener;
  inRecord.QueryInterface(Ci.nsIDNSAddrRecord);
  Assert.equal(inRecord.canonicalName, DOMAIN, "No canonical name specified");
  Assert.equal(inRecord.getNextAddrAsString(), "2.2.2.2");

  Services.dns.clearCache(false);
  override.clearOverrides();

  override.addIPOverride(DOMAIN, "2.2.2.2");
  override.setCnameOverride(DOMAIN, OTHER);
  listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    Ci.nsIDNSService.RESOLVE_CANONICAL_NAME,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  [, inRecord] = await listener;
  inRecord.QueryInterface(Ci.nsIDNSAddrRecord);
  Assert.equal(inRecord.canonicalName, OTHER, "Must have correct CNAME");
  Assert.equal(inRecord.getNextAddrAsString(), "2.2.2.2");

  Services.dns.clearCache(false);
  override.clearOverrides();
});

add_task(async function test_nxdomain() {
  override.addIPOverride(DOMAIN, "N/A");
  let listener = new Listener();
  Services.dns.asyncResolve(
    DOMAIN,
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    Ci.nsIDNSService.RESOLVE_CANONICAL_NAME,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );

  let [, , inStatus] = await listener;
  equal(inStatus, Cr.NS_ERROR_UNKNOWN_HOST);
});

function makeChan(url) {
  let chan = NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  return chan;
}

function channelOpenPromise(chan, flags) {
  return new Promise(resolve => {
    function finish(req, buffer) {
      resolve([req, buffer]);
    }
    chan.asyncOpen(new ChannelListener(finish, null, flags));
  });
}

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_override() {
    let trrServer = new TRRServer();
    await trrServer.start();
    registerCleanupFunction(async () => {
      await trrServer.stop();
    });

    await trrServer.registerDoHAnswers("service.com", "HTTPS", {
      answers: [
        {
          name: "service.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 1,
            name: ".",
            values: [
              { key: "alpn", value: ["h2", "h3"] },
              { key: "no-default-alpn" },
              { key: "port", value: 8888 },
              { key: "ipv4hint", value: "1.2.3.4" },
              { key: "echconfig", value: "123..." },
              { key: "ipv6hint", value: "::1" },
              { key: "odoh", value: "456..." },
            ],
          },
        },
        {
          name: "service.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 2,
            name: "test.com",
            values: [
              { key: "alpn", value: "h2" },
              { key: "ipv4hint", value: ["1.2.3.4", "5.6.7.8"] },
              { key: "echconfig", value: "abc..." },
              { key: "ipv6hint", value: ["::1", "2001:db8::1"] },
              { key: "odoh", value: "def..." },
            ],
          },
        },
      ],
    });

    let chan = makeChan(
      `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=service.com&type=HTTPS`
    );
    let [, buf] = await channelOpenPromise(chan);
    let rawBuffer = hexToUint8Array(buf);

    override.addHTTPSRecordOverride("service.com", rawBuffer, rawBuffer.length);

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
      Services.prefs.clearUserPref("network.trr.excluded-domains");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "service.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, inRecord, inStatus] = await listener;
    equal(inStatus, Cr.NS_OK);
    Assert.ok(
      !inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).IsTRR(),
      "resolved by Native"
    );
    let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
    equal(answer[0].priority, 1);
    equal(answer[0].name, "service.com");
    Assert.deepEqual(
      answer[0].values[0].QueryInterface(Ci.nsISVCParamAlpn).alpn,
      ["h2", "h3"],
      "got correct answer"
    );
    Assert.ok(
      answer[0].values[1].QueryInterface(Ci.nsISVCParamNoDefaultAlpn),
      "got correct answer"
    );
    Assert.equal(
      answer[0].values[2].QueryInterface(Ci.nsISVCParamPort).port,
      8888,
      "got correct answer"
    );
    Assert.equal(
      answer[0].values[3].QueryInterface(Ci.nsISVCParamIPv4Hint).ipv4Hint[0]
        .address,
      "1.2.3.4",
      "got correct answer"
    );
    Assert.equal(
      answer[0].values[4].QueryInterface(Ci.nsISVCParamEchConfig).echconfig,
      "123...",
      "got correct answer"
    );
    Assert.equal(
      answer[0].values[5].QueryInterface(Ci.nsISVCParamIPv6Hint).ipv6Hint[0]
        .address,
      "::1",
      "got correct answer"
    );
    Assert.equal(
      answer[0].values[6].QueryInterface(Ci.nsISVCParamODoHConfig).ODoHConfig,
      "456...",
      "got correct answer"
    );

    Assert.equal(answer[1].priority, 2);
    Assert.equal(answer[1].name, "test.com");
    Assert.equal(answer[1].values.length, 5);
    Assert.deepEqual(
      answer[1].values[0].QueryInterface(Ci.nsISVCParamAlpn).alpn,
      ["h2"],
      "got correct answer"
    );
    Assert.equal(
      answer[1].values[1].QueryInterface(Ci.nsISVCParamIPv4Hint).ipv4Hint[0]
        .address,
      "1.2.3.4",
      "got correct answer"
    );
    Assert.equal(
      answer[1].values[1].QueryInterface(Ci.nsISVCParamIPv4Hint).ipv4Hint[1]
        .address,
      "5.6.7.8",
      "got correct answer"
    );
    Assert.equal(
      answer[1].values[2].QueryInterface(Ci.nsISVCParamEchConfig).echconfig,
      "abc...",
      "got correct answer"
    );
    Assert.equal(
      answer[1].values[3].QueryInterface(Ci.nsISVCParamIPv6Hint).ipv6Hint[0]
        .address,
      "::1",
      "got correct answer"
    );
    Assert.equal(
      answer[1].values[3].QueryInterface(Ci.nsISVCParamIPv6Hint).ipv6Hint[1]
        .address,
      "2001:db8::1",
      "got correct answer"
    );
    Assert.equal(
      answer[1].values[4].QueryInterface(Ci.nsISVCParamODoHConfig).ODoHConfig,
      "def...",
      "got correct answer"
    );

    // Adding "service.com" into excluded-domains should fail
    // native HTTPS query.
    Services.prefs.setCharPref("network.trr.excluded-domains", "service.com");
    listener = new Listener();
    try {
      Services.dns.asyncResolve(
        "service.com",
        Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
        0,
        null,
        listener,
        mainThread,
        defaultOriginAttributes
      );
      Assert.ok(false, "asyncResolve should fail");
    } catch (e) {
      Assert.equal(e.result, Cr.NS_ERROR_UNKNOWN_HOST);
    }
  }
);

// Native resolution must follow an HTTPS AliasMode (priority 0) record to the
// TargetName, which is resolved as a separate lookup. Regression test for
// bug 1869075.
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_follow() {
    let trrServer = new TRRServer();
    await trrServer.start();
    registerCleanupFunction(async () => {
      await trrServer.stop();
    });

    // The origin is an HTTPS AliasMode record pointing at a target.
    await trrServer.registerDoHAnswers("alias-native.com", "HTTPS", {
      answers: [
        {
          name: "alias-native.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: { priority: 0, name: "target-native.com", values: [] },
        },
      ],
    });
    // The target exposes a ServiceMode record.
    await trrServer.registerDoHAnswers("target-native.com", "HTTPS", {
      answers: [
        {
          name: "target-native.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 1,
            name: "h3pool",
            values: [{ key: "alpn", value: ["h2", "h3"] }],
          },
        },
      ],
    });

    let aliasChan = makeChan(
      `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=alias-native.com&type=HTTPS`
    );
    let [, aliasBuf] = await channelOpenPromise(aliasChan);
    let aliasRaw = hexToUint8Array(aliasBuf);
    override.addHTTPSRecordOverride(
      "alias-native.com",
      aliasRaw,
      aliasRaw.length
    );

    let targetChan = makeChan(
      `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=target-native.com&type=HTTPS`
    );
    let [, targetBuf] = await channelOpenPromise(targetChan);
    let targetRaw = hexToUint8Array(targetBuf);
    override.addHTTPSRecordOverride(
      "target-native.com",
      targetRaw,
      targetRaw.length
    );

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "alias-native.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, inRecord, inStatus] = await listener;
    equal(inStatus, Cr.NS_OK, "native lookup should follow the HTTPS alias");
    Assert.ok(
      !inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).IsTRR(),
      "resolved by Native"
    );
    let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
    equal(answer[0].priority, 1);
    equal(answer[0].name, "h3pool");
  }
);

// An HTTPS AliasMode chain that never resolves to a ServiceMode record must
// terminate once the alias-following limit is reached, rather than looping
// forever. Regression test for bug 1869075.
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_chain_limit() {
    let trrServer = new TRRServer();
    await trrServer.start();
    registerCleanupFunction(async () => {
      await trrServer.stop();
    });

    // Two AliasMode records pointing at each other, so following never reaches
    // a ServiceMode record.
    await trrServer.registerDoHAnswers("cycle-a.com", "HTTPS", {
      answers: [
        {
          name: "cycle-a.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: { priority: 0, name: "cycle-b.com", values: [] },
        },
      ],
    });
    await trrServer.registerDoHAnswers("cycle-b.com", "HTTPS", {
      answers: [
        {
          name: "cycle-b.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: { priority: 0, name: "cycle-a.com", values: [] },
        },
      ],
    });

    for (let host of ["cycle-a.com", "cycle-b.com"]) {
      let chan = makeChan(
        `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=${host}&type=HTTPS`
      );
      let [, buf] = await channelOpenPromise(chan);
      let raw = hexToUint8Array(buf);
      override.addHTTPSRecordOverride(host, raw, raw.length);
    }

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "cycle-a.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, , inStatus] = await listener;
    equal(
      inStatus,
      Cr.NS_ERROR_UNKNOWN_HOST,
      "alias chain that never resolves should fail at the follow limit"
    );
  }
);

// Native resolution must follow a chain that mixes HTTPS AliasMode records and
// CNAMEs to the final TargetName. Regression test for bug 1869075.
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_cname_chain() {
    let trrServer = new TRRServer();
    await trrServer.start();
    registerCleanupFunction(async () => {
      await trrServer.stop();
    });

    // chain-origin.com (AliasMode) -> chain-mid.com (CNAME) -> chain-end.com
    // (ServiceMode).
    await trrServer.registerDoHAnswers("chain-origin.com", "HTTPS", {
      answers: [
        {
          name: "chain-origin.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: { priority: 0, name: "chain-mid.com", values: [] },
        },
      ],
    });
    await trrServer.registerDoHAnswers("chain-mid.com", "HTTPS", {
      answers: [
        {
          name: "chain-mid.com",
          type: "CNAME",
          ttl: 55,
          class: "IN",
          flush: false,
          data: "chain-end.com",
        },
      ],
    });
    await trrServer.registerDoHAnswers("chain-end.com", "HTTPS", {
      answers: [
        {
          name: "chain-end.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 1,
            name: "h3pool",
            values: [{ key: "alpn", value: ["h2", "h3"] }],
          },
        },
      ],
    });

    for (let host of ["chain-origin.com", "chain-mid.com", "chain-end.com"]) {
      let chan = makeChan(
        `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=${host}&type=HTTPS`
      );
      let [, buf] = await channelOpenPromise(chan);
      let raw = hexToUint8Array(buf);
      override.addHTTPSRecordOverride(host, raw, raw.length);
    }

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "chain-origin.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, inRecord, inStatus] = await listener;
    equal(
      inStatus,
      Cr.NS_OK,
      "native lookup should follow the alias/CNAME chain"
    );
    Assert.ok(
      !inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).IsTRR(),
      "resolved by Native"
    );
    let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
    equal(answer[0].priority, 1);
    equal(answer[0].name, "h3pool");
  }
);

function encodeDnsName(name) {
  let bytes = [];
  for (let label of name.split(".")) {
    bytes.push(label.length);
    for (let i = 0; i < label.length; i++) {
      bytes.push(label.charCodeAt(i));
    }
  }
  bytes.push(0); // root label
  return bytes;
}

function u16(n) {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

// Build a single HTTPS response for |origin| that contains an AliasMode record
// pointing at |target|, immediately followed by a malformed ServiceMode record
// for |target| (SvcParamKeys out of order, which the decoder rejects). Decoding
// |target| within this response therefore fails hard.
function buildAliasThenMalformedTargetPacket(origin, target) {
  const TYPE_HTTPS = 65;
  const CLASS_IN = 1;
  let bytes = [];
  // Header: id, flags (QR|RD|RA), qdcount=1, ancount=2, nscount=0, arcount=0.
  bytes.push(...u16(0));
  bytes.push(...u16(0x8180));
  bytes.push(...u16(1));
  bytes.push(...u16(2));
  bytes.push(...u16(0));
  bytes.push(...u16(0));
  // Question: origin HTTPS IN. The name starts at offset 12.
  bytes.push(...encodeDnsName(origin));
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  // Answer 1: origin HTTPS AliasMode -> target.
  bytes.push(0xc0, 0x0c); // compressed pointer to the question name (offset 12)
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  bytes.push(...u32(55));
  let rdata1 = [];
  rdata1.push(...u16(0)); // priority 0 => AliasMode
  rdata1.push(...encodeDnsName(target));
  bytes.push(...u16(rdata1.length));
  bytes.push(...rdata1);
  // Answer 2: target HTTPS ServiceMode with SvcParamKeys out of order.
  bytes.push(...encodeDnsName(target));
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  bytes.push(...u32(55));
  let rdata2 = [];
  rdata2.push(...u16(1)); // priority 1 => ServiceMode
  rdata2.push(0); // target "."
  rdata2.push(...u16(3), ...u16(2), ...u16(443)); // key 3 (port)
  rdata2.push(...u16(1), ...u16(2), ...u16(0x6832)); // key 1 (alpn), out of order
  bytes.push(...u16(rdata2.length));
  bytes.push(...rdata2);
  return new Uint8Array(bytes);
}

// When following an HTTPS AliasMode target, a hard decode error on the target
// record must be surfaced, not masked by re-querying a separately-cached copy
// of the target. Regression test for bug 1869075.
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_decode_error_not_masked() {
    let trrServer = new TRRServer();
    await trrServer.start();
    registerCleanupFunction(async () => {
      await trrServer.stop();
    });

    // A valid ServiceMode record cached under the alias target. If the decode
    // error in the origin response were ignored, following the alias would pick
    // this record up and hide the failure.
    await trrServer.registerDoHAnswers("mask-target.com", "HTTPS", {
      answers: [
        {
          name: "mask-target.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 1,
            name: "h3pool",
            values: [{ key: "alpn", value: ["h2", "h3"] }],
          },
        },
      ],
    });
    let targetChan = makeChan(
      `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=mask-target.com&type=HTTPS`
    );
    let [, targetBuf] = await channelOpenPromise(targetChan);
    let targetRaw = hexToUint8Array(targetBuf);
    override.addHTTPSRecordOverride(
      "mask-target.com",
      targetRaw,
      targetRaw.length
    );

    // The origin response aliases to mask-target.com but includes a malformed
    // record for it in the same response, so decoding the target fails.
    let originRaw = buildAliasThenMalformedTargetPacket(
      "mask-origin.com",
      "mask-target.com"
    );
    override.addHTTPSRecordOverride(
      "mask-origin.com",
      originRaw,
      originRaw.length
    );

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "mask-origin.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, , inStatus] = await listener;
    equal(
      inStatus,
      Cr.NS_ERROR_UNKNOWN_HOST,
      "a malformed alias-target record must fail rather than be masked by the cached target"
    );
  }
);

// Build a single HTTPS response for |host| that contains a valid ServiceMode
// record followed by a malformed one (SvcParamKeys out of order). Decoding
// appends the first record and then fails hard, leaving partial data behind.
function buildValidThenMalformedPacket(host) {
  const TYPE_HTTPS = 65;
  const CLASS_IN = 1;
  let bytes = [];
  // Header: id, flags (QR|RD|RA), qdcount=1, ancount=2, nscount=0, arcount=0.
  bytes.push(...u16(0));
  bytes.push(...u16(0x8180));
  bytes.push(...u16(1));
  bytes.push(...u16(2));
  bytes.push(...u16(0));
  bytes.push(...u16(0));
  // Question: host HTTPS IN. The name starts at offset 12.
  bytes.push(...encodeDnsName(host));
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  // Answer 1: host HTTPS ServiceMode, valid (single alpn value).
  bytes.push(0xc0, 0x0c); // compressed pointer to the question name (offset 12)
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  bytes.push(...u32(55));
  let rdata1 = [];
  rdata1.push(...u16(1)); // priority 1 => ServiceMode
  rdata1.push(0); // target "."
  rdata1.push(...u16(1), ...u16(3), 0x02, 0x68, 0x32); // alpn = ["h2"]
  bytes.push(...u16(rdata1.length));
  bytes.push(...rdata1);
  // Answer 2: host HTTPS ServiceMode with SvcParamKeys out of order.
  bytes.push(0xc0, 0x0c);
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  bytes.push(...u32(55));
  let rdata2 = [];
  rdata2.push(...u16(1)); // priority 1 => ServiceMode
  rdata2.push(0); // target "."
  rdata2.push(...u16(3), ...u16(2), ...u16(443)); // key 3 (port)
  rdata2.push(...u16(1), ...u16(2), ...u16(0x6832)); // key 1 (alpn), out of order
  bytes.push(...u16(rdata2.length));
  bytes.push(...rdata2);
  return new Uint8Array(bytes);
}

// A response that parses one valid record before hitting a hard decode error
// must not be reported as a successful resolution with the partial data.
// Regression test for bug 1869075.
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_partial_result_not_returned() {
    let partialRaw = buildValidThenMalformedPacket("partial-native.com");
    override.addHTTPSRecordOverride(
      "partial-native.com",
      partialRaw,
      partialRaw.length
    );

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "partial-native.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, , inStatus] = await listener;
    equal(
      inStatus,
      Cr.NS_ERROR_UNKNOWN_HOST,
      "a decode error must not surface partially-parsed records as success"
    );
  }
);

// A single HTTPS AliasMode answer for |origin| pointing at |target|, with no
// record for |target| in the same response.
function buildAliasOnlyPacket(origin, target) {
  const TYPE_HTTPS = 65;
  const CLASS_IN = 1;
  let bytes = [];
  // Header: id, flags (QR|RD|RA), qdcount=1, ancount=1, nscount=0, arcount=0.
  bytes.push(...u16(0));
  bytes.push(...u16(0x8180));
  bytes.push(...u16(1));
  bytes.push(...u16(1));
  bytes.push(...u16(0));
  bytes.push(...u16(0));
  bytes.push(...encodeDnsName(origin));
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  bytes.push(0xc0, 0x0c); // compressed pointer to the question name (offset 12)
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  bytes.push(...u32(55));
  let rdata = [];
  rdata.push(...u16(0)); // priority 0 => AliasMode
  rdata.push(...encodeDnsName(target));
  bytes.push(...u16(rdata.length));
  bytes.push(...rdata);
  return new Uint8Array(bytes);
}

// An HTTPS response for |host| with no answers (NODATA).
function buildNoAnswerPacket(host) {
  const TYPE_HTTPS = 65;
  const CLASS_IN = 1;
  let bytes = [];
  // Header: id, flags (QR|RD|RA), qdcount=1, ancount=0, nscount=0, arcount=0.
  bytes.push(...u16(0));
  bytes.push(...u16(0x8180));
  bytes.push(...u16(1));
  bytes.push(...u16(0));
  bytes.push(...u16(0));
  bytes.push(...u16(0));
  bytes.push(...encodeDnsName(host));
  bytes.push(...u16(TYPE_HTTPS));
  bytes.push(...u16(CLASS_IN));
  return new Uint8Array(bytes);
}

// When an HTTPS AliasMode target has no HTTPS record of its own, resolution
// must still succeed and return the AliasMode record carrying the target name,
// so the connection is routed to the target (bug 2056195).
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_target_without_record() {
    let originRaw = buildAliasOnlyPacket("alias-noh.com", "target-noh.com");
    override.addHTTPSRecordOverride(
      "alias-noh.com",
      originRaw,
      originRaw.length
    );
    let targetRaw = buildNoAnswerPacket("target-noh.com");
    override.addHTTPSRecordOverride(
      "target-noh.com",
      targetRaw,
      targetRaw.length
    );

    Services.prefs.setBoolPref("network.dns.native_https_query", true);
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref("network.dns.native_https_query");
    });

    let listener = new Listener();
    Services.dns.asyncResolve(
      "alias-noh.com",
      Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      0,
      null,
      listener,
      mainThread,
      defaultOriginAttributes
    );

    let [, inRecord, inStatus] = await listener;
    equal(
      inStatus,
      Cr.NS_OK,
      "resolving an alias whose target lacks an HTTPS record should succeed"
    );
    let httpsRecord = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord);
    let answer = httpsRecord.records;
    equal(answer.length, 1, "should return a single AliasMode record");
    equal(answer[0].priority, 0, "record should be AliasMode (priority 0)");
    equal(
      answer[0].name,
      "target-noh.com",
      "AliasMode record should carry the target name"
    );

    // The AliasMode record is not a ServiceMode record; the connection layer
    // (HTTPSRecordResolver) handles routing to the target separately.
    Assert.throws(
      () => httpsRecord.GetServiceModeRecord(false, false),
      /NS_ERROR_NOT_AVAILABLE/,
      "an AliasMode record must not be exposed as a ServiceMode record"
    );
  }
);

// Resolves an HTTPS record through the given chain of registered answers (each
// {name, type, data}) and returns the resolved nsIDNSHTTPSSVCRecord records.
async function resolveHTTPSChain(entries, queryHost) {
  let trrServer = new TRRServer();
  await trrServer.start();
  registerCleanupFunction(async () => {
    await trrServer.stop();
  });

  for (let entry of entries) {
    await trrServer.registerDoHAnswers(entry.name, entry.type || "HTTPS", {
      answers: entry.answers,
    });
  }

  for (let entry of entries) {
    let chan = makeChan(
      `https://foo.example.com:${trrServer.port()}/dnsAnswer?host=${
        entry.name
      }&type=HTTPS`
    );
    let [, buf] = await channelOpenPromise(chan);
    let raw = hexToUint8Array(buf);
    override.addHTTPSRecordOverride(entry.name, raw, raw.length);
  }

  Services.prefs.setBoolPref("network.dns.native_https_query", true);
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.dns.native_https_query");
  });

  let listener = new Listener();
  Services.dns.asyncResolve(
    queryHost,
    Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    0,
    null,
    listener,
    mainThread,
    defaultOriginAttributes
  );
  return listener;
}

function aliasAnswer(name, target) {
  return [
    {
      name,
      ttl: 55,
      type: "HTTPS",
      flush: false,
      data: { priority: 0, name: target, values: [] },
    },
  ];
}

function cnameAnswer(name, target) {
  return [
    { name, type: "CNAME", ttl: 55, class: "IN", flush: false, data: target },
  ];
}

// A chain of two HTTPS AliasMode records ending at a target with no HTTPS
// record must resolve to the last TargetName as an AliasMode record so the
// connection is routed there (bug 2056195).
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_alias_chain_no_record() {
    let listener = await resolveHTTPSChain(
      [
        {
          name: "a1-origin.com",
          answers: aliasAnswer("a1-origin.com", "a1-mid.com"),
        },
        {
          name: "a1-mid.com",
          answers: aliasAnswer("a1-mid.com", "a1-end.com"),
        },
        // a1-end.com resolves but has no HTTPS record (NODATA).
        { name: "a1-end.com", answers: [] },
      ],
      "a1-origin.com"
    );

    let [, inRecord, inStatus] = await listener;
    equal(inStatus, Cr.NS_OK, "alias->alias->no-record should succeed");
    let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
    equal(answer.length, 1, "should return a single AliasMode record");
    equal(answer[0].priority, 0, "record should be AliasMode (priority 0)");
    equal(answer[0].name, "a1-end.com", "record carries the final target name");
  }
);

// A chain mixing an HTTPS AliasMode record and a CNAME ending at a target with
// no HTTPS record must resolve to the final TargetName as an AliasMode record
// (bug 2056195).
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_alias_cname_chain_no_record() {
    let listener = await resolveHTTPSChain(
      [
        {
          name: "c1-origin.com",
          answers: aliasAnswer("c1-origin.com", "c1-mid.com"),
        },
        {
          name: "c1-mid.com",
          answers: cnameAnswer("c1-mid.com", "c1-end.com"),
        },
        // c1-end.com resolves but has no HTTPS record (NODATA).
        { name: "c1-end.com", answers: [] },
      ],
      "c1-origin.com"
    );

    let [, inRecord, inStatus] = await listener;
    equal(inStatus, Cr.NS_OK, "alias->cname->no-record should succeed");
    let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
    equal(answer.length, 1, "should return a single AliasMode record");
    equal(answer[0].priority, 0, "record should be AliasMode (priority 0)");
    equal(answer[0].name, "c1-end.com", "record carries the final target name");
  }
);

// A plain CNAME chain is not an HTTPS AliasMode chain: when the CNAME target
// has no HTTPS record, resolution must fail instead of synthesizing an
// AliasMode record (bug 2066852).
add_task(
  {
    skip_if: () =>
      mozinfo.os == "win" ||
      mozinfo.os == "android" ||
      mozinfo.socketprocess_networking,
  },
  async function test_https_record_plain_cname_chain_no_record() {
    let listener = await resolveHTTPSChain(
      [
        {
          name: "p1-origin.com",
          answers: cnameAnswer("p1-origin.com", "p1-end.com"),
        },
        // p1-end.com resolves but has no HTTPS record (NODATA).
        { name: "p1-end.com", answers: [] },
      ],
      "p1-origin.com"
    );

    let [, , inStatus] = await listener;
    equal(
      inStatus,
      Cr.NS_ERROR_UNKNOWN_HOST,
      "cname->no-record must not synthesize an AliasMode record"
    );
  }
);
