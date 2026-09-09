/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let h2Port;
let trrServer;

function inChildProcess() {
  return Services.appinfo.processType != Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT;
}

async function clearCache() {
  if (inChildProcess()) {
    do_send_remote_message("clearCache");
    await do_await_remote_message("clearCache-done");
  } else {
    Services.dns.clearCache(true);
  }
}

async function setTRRURI(uri) {
  if (!inChildProcess()) {
    Services.prefs.setCharPref("network.trr.uri", uri);
    Services.prefs.setIntPref("network.trr.mode", 3);
  } else {
    do_send_remote_message("set-trr-uri", uri);
    await do_await_remote_message("set-trr-uri-done");
  }
}

add_setup(async function setup() {
  trrServer = new TRRServer();
  await trrServer.start();
  h2Port = trrServer.port();
  ok(h2Port);

  registerCleanupFunction(async () => {
    if (trrServer) {
      await trrServer.stop();
    }
    if (inChildProcess()) {
      do_send_remote_message("set-trr-uri", "test-done");
      do_send_remote_message("clearCache", "test-done");
    }
  });

  if (inChildProcess()) {
    return;
  }

  trr_test_setup();

  registerCleanupFunction(async () => {
    trr_clear_prefs();
    Services.prefs.clearUserPref("network.dns.port_prefixed_qname_https_rr");
  });

  if (mozinfo.socketprocess_networking) {
    Services.dns; // Needed to trigger socket process.
    await TestUtils.waitForCondition(() => Services.io.socketProcessLaunched);
  }
});

add_task(async function testHTTPSSVC() {
  // Initialize FOG before the DNS lookup so that server knobs (which enable
  // metrics disabled by default in non-Firefox builds) are applied before the
  // metric recording runs.
  if (!inChildProcess()) {
    Services.fog.initializeFOG();
  }

  // use the h2 server as DOH provider
  await setTRRURI("https://foo.example.com:" + h2Port + "/doh?httpssvc=1");

  let { inRecord } = await new TRRDNSListener("test.httpssvc.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  });
  Assert.ok(
    inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).IsTRR(),
    "resolved by TRR"
  );
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer[0].priority, 1);
  Assert.equal(answer[0].name, "h3pool");
  Assert.equal(answer[0].values.length, 7);
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
  Assert.equal(answer[1].name, "test.httpssvc.com");
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
  Assert.equal(answer[2].priority, 3);
  Assert.equal(answer[2].name, "hello");
  Assert.equal(answer[2].values.length, 0);

  // The HTTPS RR was resolved over DoH/TRR, so https_rr_lookup_time should
  // have a sample under the "doh" key.
  if (!inChildProcess()) {
    let doh = Glean.dns.httpsRrLookupTime.doh.testGetValue();
    Assert.ok(doh, "https_rr_lookup_time(doh) was recorded");
  }
});

add_task(async function test_aliasform() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  // Make sure that HTTPS AliasForm is only treated as a CNAME for HTTPS requests
  await trrServer.registerDoHAnswers("test1.com", "A", {
    answers: [
      {
        name: "test1.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "something1.com",
          values: [],
        },
      },
    ],
  });
  await trrServer.registerDoHAnswers("something1.com", "A", {
    answers: [
      {
        name: "something1.com",
        ttl: 55,
        type: "A",
        flush: false,
        data: "1.2.3.4",
      },
    ],
  });

  {
    let { inStatus } = await new TRRDNSListener("test1.com", {
      expectedSuccess: false,
    });
    Assert.ok(
      !Components.isSuccessCode(inStatus),
      `${inStatus} should be an error code`
    );
  }

  // Test that HTTPS priority = 0 (AliasForm) behaves like a CNAME
  await trrServer.registerDoHAnswers("test.com", "HTTPS", {
    answers: [
      {
        name: "test.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "something.com",
          values: [],
        },
      },
    ],
  });
  await trrServer.registerDoHAnswers("something.com", "HTTPS", {
    answers: [
      {
        name: "something.com",
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

  {
    let { inStatus, inRecord } = await new TRRDNSListener("test.com", {
      type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      expectedSuccess: false,
    });
    Assert.ok(Components.isSuccessCode(inStatus), `${inStatus} should succeed`);
    let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
    Assert.equal(answer[0].priority, 1);
    Assert.equal(answer[0].name, "h3pool");
  }

  // Test a chain of HTTPSSVC AliasForm and CNAMEs
  await trrServer.registerDoHAnswers("x.com", "HTTPS", {
    answers: [
      {
        name: "x.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "y.com",
          values: [],
        },
      },
    ],
  });
  await trrServer.registerDoHAnswers("y.com", "HTTPS", {
    answers: [
      {
        name: "y.com",
        type: "CNAME",
        ttl: 55,
        class: "IN",
        flush: false,
        data: "z.com",
      },
    ],
  });
  await trrServer.registerDoHAnswers("z.com", "HTTPS", {
    answers: [
      {
        name: "z.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "target.com",
          values: [],
        },
      },
    ],
  });
  await trrServer.registerDoHAnswers("target.com", "HTTPS", {
    answers: [
      {
        name: "target.com",
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

  let { inStatus, inRecord } = await new TRRDNSListener("x.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(Components.isSuccessCode(inStatus), `${inStatus} should succeed`);
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer[0].priority, 1);
  Assert.equal(answer[0].name, "h3pool");

  // We get a ServiceForm instead of a A answer, CNAME or AliasForm
  await trrServer.registerDoHAnswers("no-ip-host.com", "A", {
    answers: [
      {
        name: "no-ip-host.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "h3pool",
          values: [
            { key: "alpn", value: ["h2", "h3"] },
            { key: "no-default-alpn" },
            { key: "port", value: 8888 },
            { key: "ipv4hint", value: "1.2.3.4" },
            { key: "echconfig", value: "123..." },
            { key: "ipv6hint", value: "::1" },
          ],
        },
      },
    ],
  });

  ({ inStatus } = await new TRRDNSListener("no-ip-host.com", {
    expectedSuccess: false,
  }));
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} should be an error code`
  );

  // Test CNAME/AliasForm loop
  await trrServer.registerDoHAnswers("loop.com", "HTTPS", {
    answers: [
      {
        name: "loop.com",
        type: "CNAME",
        ttl: 55,
        class: "IN",
        flush: false,
        data: "loop2.com",
      },
    ],
  });
  await trrServer.registerDoHAnswers("loop2.com", "HTTPS", {
    answers: [
      {
        name: "loop2.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "loop.com",
          values: [],
        },
      },
    ],
  });

  // Make sure these are the first requests
  Assert.equal(await trrServer.requestCount("loop.com", "HTTPS"), 0);
  Assert.equal(await trrServer.requestCount("loop2.com", "HTTPS"), 0);

  ({ inStatus } = await new TRRDNSListener("loop.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  }));
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} should be an error code`
  );
  // Make sure the error was actually triggered by a loop.
  Assert.greater(await trrServer.requestCount("loop.com", "HTTPS"), 2);
  Assert.greater(await trrServer.requestCount("loop2.com", "HTTPS"), 2);

  // Alias form for .
  await trrServer.registerDoHAnswers("empty.com", "A", {
    answers: [
      {
        name: "empty.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "", // This is not allowed
          values: [],
        },
      },
    ],
  });

  ({ inStatus } = await new TRRDNSListener("empty.com", {
    expectedSuccess: false,
  }));
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} should be an error code`
  );

  // We should ignore ServiceForm if an AliasForm record is also present
  await trrServer.registerDoHAnswers("multi.com", "HTTPS", {
    answers: [
      {
        name: "multi.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "h3pool",
          values: [
            { key: "alpn", value: ["h2", "h3"] },
            { key: "no-default-alpn" },
            { key: "port", value: 8888 },
            { key: "ipv4hint", value: "1.2.3.4" },
            { key: "echconfig", value: "123..." },
            { key: "ipv6hint", value: "::1" },
          ],
        },
      },
      {
        name: "multi.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "example.com",
          values: [],
        },
      },
    ],
  });

  let { inStatus: inStatus2 } = await new TRRDNSListener("multi.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    !Components.isSuccessCode(inStatus2),
    `${inStatus2} should be an error code`
  );

  // the svcparam keys are in reverse order
  await trrServer.registerDoHAnswers("order.com", "HTTPS", {
    answers: [
      {
        name: "order.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "h3pool",
          values: [
            { key: "ipv6hint", value: "::1" },
            { key: "echconfig", value: "123..." },
            { key: "ipv4hint", value: "1.2.3.4" },
            { key: "port", value: 8888 },
            { key: "no-default-alpn" },
            { key: "alpn", value: ["h2", "h3"] },
          ],
        },
      },
    ],
  });

  ({ inStatus: inStatus2 } = await new TRRDNSListener("order.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  }));
  Assert.ok(
    !Components.isSuccessCode(inStatus2),
    `${inStatus2} should be an error code`
  );

  // duplicate svcparam keys
  await trrServer.registerDoHAnswers("duplicate.com", "HTTPS", {
    answers: [
      {
        name: "duplicate.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "h3pool",
          values: [
            { key: "alpn", value: ["h2", "h3"] },
            { key: "alpn", value: ["h2", "h3", "h4"] },
          ],
        },
      },
    ],
  });

  ({ inStatus: inStatus2 } = await new TRRDNSListener("duplicate.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  }));
  Assert.ok(
    !Components.isSuccessCode(inStatus2),
    `${inStatus2} should be an error code`
  );

  // mandatory svcparam
  await trrServer.registerDoHAnswers("mandatory.com", "HTTPS", {
    answers: [
      {
        name: "mandatory.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "h3pool",
          values: [
            { key: "mandatory", value: ["key100"] },
            { key: "alpn", value: ["h2", "h3"] },
            { key: "key100" },
          ],
        },
      },
    ],
  });

  ({ inStatus: inStatus2 } = await new TRRDNSListener("mandatory.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  }));
  Assert.ok(!Components.isSuccessCode(inStatus2), `${inStatus2} should fail`);

  // mandatory svcparam
  await trrServer.registerDoHAnswers("mandatory2.com", "HTTPS", {
    answers: [
      {
        name: "mandatory2.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "h3pool",
          values: [
            {
              key: "mandatory",
              value: [
                "alpn",
                "no-default-alpn",
                "port",
                "ipv4hint",
                "echconfig",
                "ipv6hint",
              ],
            },
            { key: "alpn", value: ["h2", "h3"] },
            { key: "no-default-alpn" },
            { key: "port", value: 8888 },
            { key: "ipv4hint", value: "1.2.3.4" },
            { key: "echconfig", value: "123..." },
            { key: "ipv6hint", value: "::1" },
          ],
        },
      },
    ],
  });

  ({ inStatus: inStatus2 } = await new TRRDNSListener("mandatory2.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  }));

  Assert.ok(Components.isSuccessCode(inStatus2), `${inStatus2} should succeed`);

  // alias-mode with . targetName
  await trrServer.registerDoHAnswers("no-alias.com", "HTTPS", {
    answers: [
      {
        name: "no-alias.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: ".",
          values: [],
        },
      },
    ],
  });

  ({ inStatus: inStatus2 } = await new TRRDNSListener("no-alias.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  }));

  Assert.ok(!Components.isSuccessCode(inStatus2), `${inStatus2} should fail`);

  // service-mode with . targetName
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
          values: [{ key: "alpn", value: ["h2", "h3"] }],
        },
      },
    ],
  });

  ({ inRecord, inStatus: inStatus2 } = await new TRRDNSListener("service.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  }));
  Assert.ok(Components.isSuccessCode(inStatus2), `${inStatus2} should work`);
  answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer[0].priority, 1);
  Assert.equal(answer[0].name, "service.com");
});

// Real recursive resolvers set the Recursion-Available (RA) flag but do not
// chase HTTPS AliasMode targets themselves, so Firefox must query the
// TargetName. Regression test for bug 1869075.
add_task(async function test_aliasform_recursion_available() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  // RECURSION_AVAILABLE flag (1 << 7) as encoded by dns-packet.
  const RECURSION_AVAILABLE = 1 << 7;

  await trrServer.registerDoHAnswers("ra-alias.com", "HTTPS", {
    flags: RECURSION_AVAILABLE,
    answers: [
      {
        name: "ra-alias.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "ra-target.com",
          values: [],
        },
      },
    ],
  });
  await trrServer.registerDoHAnswers("ra-target.com", "HTTPS", {
    flags: RECURSION_AVAILABLE,
    answers: [
      {
        name: "ra-target.com",
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

  let { inStatus, inRecord } = await new TRRDNSListener("ra-alias.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    Components.isSuccessCode(inStatus),
    `${inStatus} should follow the alias even when RA is set`
  );
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer[0].priority, 1);
  Assert.equal(answer[0].name, "h3pool");
});

// When an HTTPS AliasMode target has no HTTPS record of its own, TRR must still
// succeed and return the AliasMode record carrying the target name, so the
// connection is routed to the target. Regression test for bug 2056195.
add_task(async function test_aliasform_target_without_record() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  await trrServer.registerDoHAnswers("alias-noh.com", "HTTPS", {
    answers: [
      {
        name: "alias-noh.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 0,
          name: "target-noh.com",
          values: [],
        },
      },
    ],
  });
  // The target resolves, but has no HTTPS record (NODATA).
  await trrServer.registerDoHAnswers("target-noh.com", "HTTPS", {
    answers: [],
  });

  let { inStatus, inRecord } = await new TRRDNSListener("alias-noh.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    Components.isSuccessCode(inStatus),
    `${inStatus} should follow the alias even when the target has no record`
  );
  let record = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord);
  let answer = record.records;
  Assert.equal(answer.length, 1, "should return a single AliasMode record");
  Assert.equal(
    answer[0].priority,
    0,
    "record should be AliasMode (priority 0)"
  );
  Assert.equal(
    answer[0].name,
    "target-noh.com",
    "AliasMode record should carry the target name"
  );

  // The AliasMode record is not a ServiceMode record; routing to the target is
  // handled by the connection layer (HTTPSRecordResolver), not here.
  Assert.throws(
    () => record.GetServiceModeRecord(false, false),
    /NS_ERROR_NOT_AVAILABLE/,
    "an AliasMode record must not be exposed as a ServiceMode record"
  );
});

// A chain of HTTPS AliasMode records ending at a target with no HTTPS record
// must resolve to the final TargetName as an AliasMode record. Bug 2056195.
add_task(async function test_aliasform_alias_chain_no_record() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  await trrServer.registerDoHAnswers("chain-a.com", "HTTPS", {
    answers: [
      {
        name: "chain-a.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: { priority: 0, name: "chain-b.com", values: [] },
      },
    ],
  });
  await trrServer.registerDoHAnswers("chain-b.com", "HTTPS", {
    answers: [
      {
        name: "chain-b.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: { priority: 0, name: "chain-c.com", values: [] },
      },
    ],
  });
  // chain-c.com resolves but has no HTTPS record (NODATA).
  await trrServer.registerDoHAnswers("chain-c.com", "HTTPS", { answers: [] });

  let { inStatus, inRecord } = await new TRRDNSListener("chain-a.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    Components.isSuccessCode(inStatus),
    `${inStatus} alias->alias->no-record should succeed`
  );
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer.length, 1, "should return a single AliasMode record");
  Assert.equal(
    answer[0].priority,
    0,
    "record should be AliasMode (priority 0)"
  );
  Assert.equal(answer[0].name, "chain-c.com", "record carries final target");
});

// A chain mixing an HTTPS AliasMode record and a CNAME ending at a target with
// no HTTPS record must resolve to the final TargetName. Bug 2056195.
add_task(async function test_aliasform_cname_chain_no_record() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  await trrServer.registerDoHAnswers("cchain-a.com", "HTTPS", {
    answers: [
      {
        name: "cchain-a.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: { priority: 0, name: "cchain-b.com", values: [] },
      },
    ],
  });
  await trrServer.registerDoHAnswers("cchain-b.com", "HTTPS", {
    answers: [
      {
        name: "cchain-b.com",
        type: "CNAME",
        ttl: 55,
        class: "IN",
        flush: false,
        data: "cchain-c.com",
      },
    ],
  });
  // cchain-c.com resolves but has no HTTPS record (NODATA).
  await trrServer.registerDoHAnswers("cchain-c.com", "HTTPS", { answers: [] });

  let { inStatus, inRecord } = await new TRRDNSListener("cchain-a.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    Components.isSuccessCode(inStatus),
    `${inStatus} alias->cname->no-record should succeed`
  );
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer.length, 1, "should return a single AliasMode record");
  Assert.equal(
    answer[0].priority,
    0,
    "record should be AliasMode (priority 0)"
  );
  Assert.equal(answer[0].name, "cchain-c.com", "record carries final target");
});

// A plain CNAME chain is not an HTTPS AliasMode chain: when the CNAME target
// has no HTTPS record, the lookup must fail instead of synthesizing an
// AliasMode record. Regression test for bug 2066852.
add_task(async function test_plain_cname_chain_no_record() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  await trrServer.registerDoHAnswers("pcname-a.com", "HTTPS", {
    answers: [
      {
        name: "pcname-a.com",
        type: "CNAME",
        ttl: 55,
        class: "IN",
        flush: false,
        data: "pcname-b.com",
      },
    ],
  });
  // pcname-b.com resolves but has no HTTPS record (NODATA).
  await trrServer.registerDoHAnswers("pcname-b.com", "HTTPS", { answers: [] });

  let { inStatus } = await new TRRDNSListener("pcname-a.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} cname->no-record must not synthesize an AliasMode record`
  );
});

// Same as above, but the CNAME response has the Recursion-Available flag set.
// A recursive resolver inlines the CNAME target's HTTPS records, so their
// absence is definitive and we must not re-query the target. Bug 2066852.
add_task(async function test_plain_cname_chain_recursion_available() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await clearCache();

  // RECURSION_AVAILABLE flag (1 << 7) as encoded by dns-packet.
  const RECURSION_AVAILABLE = 1 << 7;

  await trrServer.registerDoHAnswers("racname-a.com", "HTTPS", {
    flags: RECURSION_AVAILABLE,
    answers: [
      {
        name: "racname-a.com",
        type: "CNAME",
        ttl: 55,
        class: "IN",
        flush: false,
        data: "racname-b.com",
      },
    ],
  });
  await trrServer.registerDoHAnswers("racname-b.com", "HTTPS", {
    flags: RECURSION_AVAILABLE,
    answers: [],
  });

  let { inStatus } = await new TRRDNSListener("racname-a.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} cname->no-record with RA must fail`
  );
  Assert.equal(
    await trrServer.requestCount("racname-b.com", "HTTPS"),
    0,
    "must not query the CNAME target when recursion is available"
  );
});

add_task(async function testNegativeResponse() {
  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  let { inStatus } = await new TRRDNSListener("negative_test.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  });
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} should be an error code`
  );

  await trrServer.registerDoHAnswers("negative_test.com", "HTTPS", {
    answers: [
      {
        name: "negative_test.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "negative_test.com",
          values: [{ key: "alpn", value: ["h2", "h3"] }],
        },
      },
    ],
  });

  // Should still be failed because a negative response is from DNS cache.
  ({ inStatus } = await new TRRDNSListener("negative_test.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    expectedSuccess: false,
  }));
  Assert.ok(
    !Components.isSuccessCode(inStatus),
    `${inStatus} should be an error code`
  );

  await clearCache();

  let inRecord;
  ({ inRecord, inStatus } = await new TRRDNSListener("negative_test.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  }));
  Assert.ok(Components.isSuccessCode(inStatus), `${inStatus} should work`);
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer[0].priority, 1);
  Assert.equal(answer[0].name, "negative_test.com");
});

add_task(async function testPortPrefixedName() {
  if (inChildProcess()) {
    do_send_remote_message("set-port-prefixed-pref");
    await do_await_remote_message("set-port-prefixed-pref-done");
  } else {
    Services.prefs.setBoolPref(
      "network.dns.port_prefixed_qname_https_rr",
      true
    );
  }

  await trrServer.registerDoHAnswers(
    "_4433._https.port_prefix.test.com",
    "HTTPS",
    {
      answers: [
        {
          name: "_4433._https.port_prefix.test.com",
          ttl: 55,
          type: "HTTPS",
          flush: false,
          data: {
            priority: 1,
            name: "port_prefix.test1.com",
            values: [{ key: "alpn", value: ["h2", "h3"] }],
          },
        },
      ],
    }
  );

  let { inRecord, inStatus } = await new TRRDNSListener(
    "port_prefix.test.com",
    {
      type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
      port: 4433,
    }
  );
  Assert.ok(Components.isSuccessCode(inStatus), `${inStatus} should work`);
  let answer = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(answer[0].priority, 1);
  Assert.equal(answer[0].name, "port_prefix.test1.com");
});

async function doTestFlattenRecordsWithECH(host, targetName, alpn, expected) {
  await clearCache();

  await trrServer.registerDoHAnswers(host, "HTTPS", {
    answers: [
      {
        name: host,
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: targetName,
          values: [
            ...(alpn ? [{ key: "alpn", value: alpn }] : []),
            { key: "echconfig", value: "456..." },
          ],
        },
      },
    ],
  });

  let { inRecord } = await new TRRDNSListener(host, {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  });

  let notused = {};
  let answer = inRecord
    .QueryInterface(Ci.nsIDNSHTTPSSVCRecord)
    .GetAllRecordsWithEchConfig(false, false, "", notused, notused);

  Assert.equal(answer.length, expected.length);
  for (let i = 0; i < answer.length; i++) {
    Assert.equal(answer[i].priority, expected[i].priority);
    Assert.equal(answer[i].name, expected[i].name);
    if (expected[i].selectedAlpn !== null) {
      Assert.equal(answer[i].selectedAlpn, expected[i].selectedAlpn);
    }
  }
}

add_task(async function testFlattenRecordsWithECH() {
  // Test when host name and targetName are the same.
  await doTestFlattenRecordsWithECH(
    "test.target.com",
    "test.target.com",
    ["h3"],
    [
      { priority: 1, name: "test.target.com", selectedAlpn: "h3" },
      { priority: 1, name: "test.target.com", selectedAlpn: "" },
    ]
  );
  await doTestFlattenRecordsWithECH(
    "test.target.com",
    ".",
    ["h3"],
    [
      { priority: 1, name: "test.target.com", selectedAlpn: "h3" },
      { priority: 1, name: "test.target.com", selectedAlpn: "" },
    ]
  );

  // Test when host name and targetName are not the same.
  // We add
  await doTestFlattenRecordsWithECH(
    "test.target.com",
    "test.target_1.com",
    ["h3"],
    [
      { priority: 1, name: "test.target_1.com", selectedAlpn: "h3" },
      { priority: 1, name: "test.target_1.com", selectedAlpn: "" },
    ]
  );

  // Test when alpn is empty.
  await doTestFlattenRecordsWithECH("test.target.com", ".", null, [
    { priority: 1, name: "test.target.com", selectedAlpn: null },
  ]);
  await doTestFlattenRecordsWithECH(
    "test.target.com",
    "test.target_1.com",
    null,
    [{ priority: 1, name: "test.target_1.com", selectedAlpn: null }]
  );
});

async function doTestFlattenRecordsWithoutECH(
  host,
  targetName,
  alpn,
  expected
) {
  await clearCache();

  await setTRRURI(`https://foo.example.com:${trrServer.port()}/dns-query`);
  await trrServer.registerDoHAnswers(host, "HTTPS", {
    answers: [
      {
        name: host,
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: targetName,
          values: [...(alpn ? [{ key: "alpn", value: alpn }] : [])],
        },
      },
    ],
  });

  let { inRecord } = await new TRRDNSListener(host, {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  });

  let notused = {};
  let answer = inRecord
    .QueryInterface(Ci.nsIDNSHTTPSSVCRecord)
    .GetAllRecords(false, false, "", notused, notused);

  Assert.equal(answer.length, expected.length);
  for (let i = 0; i < answer.length; i++) {
    Assert.equal(answer[i].priority, expected[i].priority);
    Assert.equal(answer[i].name, expected[i].name);
    if (expected[i].selectedAlpn !== null) {
      Assert.equal(answer[i].selectedAlpn, expected[i].selectedAlpn);
    }
  }
}

add_task(async function testFlattenRecordsWithoutECH() {
  // Test when host name and targetName are the same.
  await doTestFlattenRecordsWithoutECH(
    "test.target_noech.com",
    "test.target_noech.com",
    ["h3"],
    [{ priority: 1, name: "test.target_noech.com", selectedAlpn: "h3" }]
  );
  await doTestFlattenRecordsWithoutECH(
    "test.target_noech.com",
    ".",
    ["h3"],
    [{ priority: 1, name: "test.target_noech.com", selectedAlpn: "h3" }]
  );

  // Test when host name and targetName are not the same.
  await doTestFlattenRecordsWithoutECH(
    "test.target_noech.com",
    "test.target_noech_1.com",
    ["h3"],
    [
      { priority: 1, name: "test.target_noech_1.com", selectedAlpn: "h3" },
      { priority: 1, name: "test.target_noech_1.com", selectedAlpn: "" },
    ]
  );

  // Test when alpn is empty.
  await doTestFlattenRecordsWithoutECH("test.target_noech.com", ".", null, [
    { priority: 1, name: "test.target_noech.com", selectedAlpn: null },
  ]);
  await doTestFlattenRecordsWithoutECH(
    "test.target_noech.com",
    "test.target_noech_1.com",
    null,
    [{ priority: 1, name: "test.target_noech_1.com", selectedAlpn: null }]
  );
});
