/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { NodeHTTPServer, NodeHTTPSServer, NodeHTTP2Server, with_node_servers } =
  ChromeUtils.importESModule("resource://testing-common/NodeServer.sys.mjs");

/* globals require */

// Runs in the node server process, so it must be self-contained.
function akamaiHandler(req, resp) {
  const BLOCK_BODY = `<HTML><HEAD>
<TITLE>Access Denied</TITLE>
</HEAD><BODY>
<H1>Access Denied</H1>

You don't have permission to access "http&#58;&#47;&#47;localhost&#47;" on this server.<P>
Reference&#32;&#35;18&#46;4ba4c017&#46;1790874798&#46;14cb90f9
<P>https&#58;&#47;&#47;errors&#46;edgesuite&#46;net&#47;18&#46;4ba4c017&#46;1790874798&#46;14cb90f9</P>
</BODY>
</HTML>
`;
  let status = 200;
  let body = "<html><body>ok</body></html>";
  switch (new URL(req.url, "http://localhost").search.slice(1)) {
    case "blocked":
      status = 403;
      body = BLOCK_BODY;
      resp.setHeader("Server", "AkamaiGHost");
      break;
    case "blocked-gzip":
      status = 403;
      body = require("zlib").gzipSync(BLOCK_BODY);
      resp.setHeader("Server", "AkamaiGHost");
      resp.setHeader("Content-Encoding", "gzip");
      break;
    case "blocked-br":
      status = 403;
      body = require("zlib").brotliCompressSync(BLOCK_BODY);
      resp.setHeader("Server", "AkamaiGHost");
      resp.setHeader("Content-Encoding", "br");
      break;
    case "blocked-plain":
      status = 403;
      body = `Access Denied. Reference #18.4ba4c017.1790874798.14cb90f9
https://errors.edgesuite.net/18.4ba4c017.1790874798.14cb90f9
`;
      resp.setHeader("Server", "AkamaiGHost");
      break;
    case "forbidden":
      status = 403;
      body = "<html><body>Forbidden</body></html>";
      resp.setHeader("Server", "AkamaiGHost");
      break;
    case "grn":
      resp.setHeader("akamai-grn", "0.1913d517.1790875720.49941523");
      break;
    case "x-akamai":
      resp.setHeader("X-Akamai-Transformed", "9 - 0 pmb=mRUM,1");
      break;
    case "not-akamai-blocked":
      status = 403;
      body = BLOCK_BODY;
      break;
    case "frame-blocked":
      body = `<html><body><iframe src="/akamai?blocked"></iframe></body></html>`;
      break;
  }
  resp.setHeader("Content-Type", "text/html");
  resp.setHeader("Cache-Control", "no-store");
  resp.setHeader("Content-Length", body.length);
  resp.writeHead(status);
  resp.end(body);
}

function akamaiTelemetry() {
  const loads = Glean.network.akamaiDocumentLoads;
  return {
    document: {
      ok: loads.ok.testGetValue() ?? 0,
      forbidden: loads.forbidden.testGetValue() ?? 0,
      blocked: loads.waf_blocked.testGetValue() ?? 0,
    },
    page: {
      akamai: Glean.useCounterPage.akamaiUsed.testGetValue() ?? 0,
      forbidden: Glean.useCounterPage.akamaiForbidden.testGetValue() ?? 0,
      blocked: Glean.useCounterPage.akamaiWafBlocked.testGetValue() ?? 0,
    },
    wafBlocked: Glean.network.akamaiWafBlocked.testGetValue(),
    wafBlockedSubresource:
      Glean.network.akamaiWafBlockedSubresource.testGetValue(),
  };
}

function expected({
  document = {},
  page = {},
  wafBlocked = null,
  wafBlockedSubresource = null,
} = {}) {
  return {
    document: { ok: 0, forbidden: 0, blocked: 0, ...document },
    page: { akamai: 0, forbidden: 0, blocked: 0, ...page },
    wafBlocked,
    wafBlockedSubresource,
  };
}

// Loads `page` as a document from the server, then fetches each of
// `fetchQueries` from within it, and returns the recorded telemetry.
async function loadAndCollect(server, page, fetchQueries = []) {
  Services.fog.testResetFOG();
  const url = `${server.origin()}/akamai`;
  await BrowserTestUtils.withNewTab(`${url}?${page}`, async browser => {
    await SpecialPowers.spawn(
      browser,
      [url, fetchQueries],
      async (fetchURL, queries) => {
        for (const query of queries) {
          const response = await content.fetch(`${fetchURL}?${query}`);
          await response.text();
        }
      }
    );
    // Flush while the content process for the tab is still alive.
    await Services.fog.testFlushAllChildren();
  });
  // Use counters are reported when the document is destroyed, which happens
  // some time after the tab is closed.
  await TestUtils.waitForCondition(async () => {
    await Services.fog.testFlushAllChildren();
    return Glean.useCounter.topLevelContentDocumentsDestroyed.testGetValue();
  }, "Waiting for the page use counters to be reported");
  return akamaiTelemetry();
}

async function runAkamaiScenarios(server) {
  const label = `${server.protocol()}/${server.version()}`;
  await server.registerPathHandler("/akamai", akamaiHandler);

  Assert.deepEqual(
    await loadAndCollect(server, "plain"),
    expected(),
    `[${label}] Non-Akamai documents are not counted`
  );

  Assert.deepEqual(
    await loadAndCollect(server, "not-akamai-blocked"),
    expected(),
    `[${label}] A non-Akamai document with the block page body is not counted`
  );

  for (const page of ["grn", "x-akamai"]) {
    Assert.deepEqual(
      await loadAndCollect(server, page),
      expected({ document: { ok: 1 }, page: { akamai: 1 } }),
      `[${label}] An Akamai document load (${page}) is counted`
    );
  }

  Assert.deepEqual(
    await loadAndCollect(server, "forbidden"),
    expected({
      document: { forbidden: 1 },
      page: { akamai: 1, forbidden: 1 },
    }),
    `[${label}] A 403 Akamai document without the WAF page is counted as forbidden`
  );

  for (const page of [
    "blocked",
    "blocked-gzip",
    "blocked-br",
    "blocked-plain",
  ]) {
    Assert.deepEqual(
      await loadAndCollect(server, page),
      expected({
        document: { blocked: 1 },
        page: { akamai: 1, blocked: 1 },
        wafBlocked: true,
      }),
      `[${label}] The WAF block of a document load (${page}) is counted`
    );
  }

  Assert.deepEqual(
    await loadAndCollect(server, "frame-blocked"),
    expected({
      document: { blocked: 1 },
      page: { akamai: 1, blocked: 1 },
      wafBlocked: true,
    }),
    `[${label}] The WAF block of a frame is counted as a document load`
  );

  Assert.deepEqual(
    await loadAndCollect(server, "plain", ["grn", "x-akamai"]),
    expected({ page: { akamai: 1 } }),
    `[${label}] Multiple Akamai subresources count the page once`
  );

  Assert.deepEqual(
    await loadAndCollect(server, "plain", ["forbidden"]),
    expected({ page: { akamai: 1, forbidden: 1 } }),
    `[${label}] A 403 Akamai subresource without the WAF page is counted as forbidden`
  );

  for (const query of [
    "blocked",
    "blocked-gzip",
    "blocked-br",
    "blocked-plain",
  ]) {
    Assert.deepEqual(
      await loadAndCollect(server, "plain", [query]),
      expected({
        page: { akamai: 1, blocked: 1 },
        wafBlockedSubresource: true,
      }),
      `[${label}] The WAF block of a subresource (${query}) is counted`
    );
  }

  Assert.deepEqual(
    await loadAndCollect(server, "plain", [
      "grn",
      "blocked",
      "blocked-gzip",
      "forbidden",
      "forbidden",
    ]),
    expected({
      page: { akamai: 1, blocked: 1, forbidden: 1 },
      wafBlockedSubresource: true,
    }),
    `[${label}] Multiple Akamai responses count the page and each failure type once`
  );

  Assert.deepEqual(
    await loadAndCollect(server, "grn", ["blocked"]),
    expected({
      document: { ok: 1 },
      page: { akamai: 1, blocked: 1 },
      wafBlockedSubresource: true,
    }),
    `[${label}] A blocked subresource in an Akamai document is counted`
  );

  Assert.deepEqual(
    await loadAndCollect(server, "blocked", ["blocked"]),
    expected({
      document: { blocked: 1 },
      page: { akamai: 1, blocked: 1 },
      wafBlocked: true,
      wafBlockedSubresource: true,
    }),
    `[${label}] Document and subresource blocks set both booleans`
  );

  Assert.deepEqual(
    await loadAndCollect(server, "plain", ["not-akamai-blocked"]),
    expected(),
    `[${label}] A non-Akamai subresource with the block page body is not counted`
  );

  await SpecialPowers.pushPrefEnv({
    set: [["network.http.akamai_waf_telemetry.enabled", false]],
  });
  Assert.deepEqual(
    await loadAndCollect(server, "blocked"),
    expected(),
    `[${label}] Blocked documents are not counted when the pref is disabled`
  );
  Assert.deepEqual(
    await loadAndCollect(server, "frame-blocked", ["blocked"]),
    expected(),
    `[${label}] Blocked subresources are not counted when the pref is disabled`
  );
  await SpecialPowers.popPrefEnv();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["network.http.akamai_waf_telemetry.enabled", true],
      ["network.proxy.allow_hijacking_localhost", false],
    ],
  });
});

add_task(async function test_akamai_waf_telemetry() {
  await with_node_servers(
    [NodeHTTPServer, NodeHTTPSServer, NodeHTTP2Server],
    runAkamaiScenarios
  );
});
