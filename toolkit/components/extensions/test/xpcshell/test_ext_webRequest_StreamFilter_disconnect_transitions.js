"use strict";

// Regression test for bug 2065230: filter.write() + filter.disconnect() from
// filter.onstart should preserve the expected order of the remaining response
// body. Data should not be reordered or dropped upon disconnect(). For more
// details, see https://bugzilla.mozilla.org/show_bug.cgi?id=2065230#c3
//
// The two failure modes are detected by the describeCorruption() helper:
// - "reordered" reproduced quite reliably without the fix.
// - "lost data" is a race condition that was much harder to trigger. To make
//    the race condition more likely to trigger, the response body required
//    compression (BODY -> DEFLATE_BYTES) and tuning of the body sizes, to make
//    the IO thread busier (spending time on decompression/inflating opposed to
//    reading from the socket; simultaneously the compressed body should be
//    sufficiently large such that the whole body does not arrive before the
//    race condition is triggered in FinishDisconnect).
//    For emphasis (already mentioned in the bugzilla comment above in more
//    detail), the race scenario was: actor thread sets state to Disconnected
//    (in StreamFilterParent::FinishDisconnect) while the IO thread runs Read()
//    (in StreamFilterParent::OnDataAvailable).

const server = createHttpServer({ hosts: ["example.com"] });

// 1 MB of BODY consisting of 64 byte lines, DEFLATE compression, resulting in
// DEFLATE_BYTES of ~41 KB (compression ratio ~1:25).
const DEFLATE_BYTES = []; // Populated by setup_generate_body from BODY.
let BODY = "";
for (let i = 0; i < 16_384; i++) {
  // Each line is unique for ease of data corruption detection.
  BODY += `/*${String(i).padStart(8, "0").padEnd(59, "x")}*/\n`;
}

server.registerPathHandler("/big.js", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/javascript", false);
  response.setHeader("Content-Encoding", "deflate", false);
  response.setHeader("Cache-Control", "no-store", false);
  let bos = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
    Ci.nsIBinaryOutputStream
  );
  bos.setOutputStream(response.bodyOutputStream);
  bos.writeByteArray(DEFLATE_BYTES);
});

server.registerPathHandler("/dummy", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write("<!DOCTYPE html>Dummy");
});

add_setup(async function setup_generate_body() {
  const inStream = new Blob([BODY]).stream();
  const csStream = inStream.pipeThrough(new CompressionStream("deflate"));
  for await (const chunk of csStream) {
    DEFLATE_BYTES.push(...chunk);
  }

  // Verify that the compression achieves the characteristics as described at
  // the top of the file; reminder: compression is merely to increase the
  // likelihood of triggering the original bug.
  const compressionRatio = BODY.length / DEFLATE_BYTES.length;
  info(`BODY size: ${BODY.length}; Compression ratio: ${compressionRatio}`);
  // If the compression ratios ever differ due to compression implementation
  // changes, try reverting the fix to bug 2065230 and see what BODY is needed
  // to still observe failures; see also describeCorruption.
  Assert.greater(compressionRatio, 24, "Expected 1:25 compression ratio");
  Assert.less(compressionRatio, 26, "Expected 1:25 compression ratio");

  // Sanity check that DEFLATE_BYTES decodes to BODY.
  const text = await ExtensionTestUtils.fetch(
    "http://example.com/dummy",
    "http://example.com/big.js?sanity_check"
  );
  // Using ok() instead of is() to avoid flooding the output with 1MB strings.
  // eslint-disable-next-line mozilla/no-comparison-or-assignment-inside-ok
  ok(text === BODY, "Sanity check: fixture decodes to expected body");
});

// For ease of debugging, when the response body is unexpected, describe what
// happened, as there may be multiple reasons for data corruption.
function describeCorruption(text, expected) {
  let i = 0;
  while (i < text.length && i < expected.length && text[i] === expected[i]) {
    i++;
  }
  // See top of this test file for an explanation of these scenarios.
  let kind = text.length === expected.length ? "reordered" : "lost data";
  return (
    `${kind}: length ${text.length} (expected ${expected.length}), ` +
    `first difference at ${i}: got ${JSON.stringify(text.substr(i, 10))}, ` +
    `expected ${JSON.stringify(expected.substr(i, 10))}`
  );
}

add_task(async function test_disconnect_keeps_body_intact() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["webRequest", "webRequestBlocking", "http://example.com/*"],
    },
    background() {
      const prefix = new TextEncoder().encode("/*PREFIX_FROM_FILTER_WRITE*/");
      browser.webRequest.onBeforeRequest.addListener(
        details => {
          let filter = browser.webRequest.filterResponseData(details.requestId);
          filter.onstart = () => {
            filter.write(prefix);
            filter.disconnect();
          };
          filter.onerror = () => {
            browser.test.fail(`Unexpected filter error: ${filter.error}`);
          };
        },
        { urls: ["http://example.com/big.js*"] },
        ["blocking"]
      );
    },
  });

  await extension.startup();

  // Number chosen such that the test failed reliably on my machine, without
  // needing to depend on --verify or --repeat. As noted at the top of the file
  // the "reordered" failure reproduced quite reliably, but the "lost data"
  // race condition was more rare, resulting in the need for many iterations:
  const REQUESTS = 32;
  const expected = "/*PREFIX_FROM_FILTER_WRITE*/" + BODY;
  let corrupted = [];
  for (let i = 0; i < REQUESTS; ++i) {
    const text = await ExtensionTestUtils.fetch(
      "http://example.com/dummy",
      `http://example.com/big.js?n=${i}`
    );
    if (text !== expected) {
      // Collect all observed failures instead of an Assert call that would
      // fail on the first failure, to make it easier to see their prevalence
      // and the kinds of failures.
      corrupted.push(`request ${i}: ${describeCorruption(text, expected)}`);
    }
  }

  await extension.unload();

  for (let problem of corrupted) {
    info(problem);
  }
  // When this fails, check the info() printed above, from describeCorruption.
  equal(
    corrupted.length,
    0,
    `${corrupted.length}/${REQUESTS} responses were corrupted`
  );
});
