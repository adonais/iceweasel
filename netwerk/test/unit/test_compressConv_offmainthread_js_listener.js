/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Regression test for off-main-thread decompression (nsHTTPCompressConv).
//
// In a content process, HttpChannelChild applies the content-encoding stream
// converter and calls nsHTTPCompressConv::MaybeRetarget, which decompresses the
// body on a background thread and dispatches the decoded data back to the main
// thread whenever the consumer's listener chain is not retargetable. A plain
// JS-implemented nsIStreamListener is exactly such a consumer: it is both
// non-retargetable (it does not implement nsIThreadRetargetableStreamListener)
// and non-threadsafe-refcounted (XPConnect/cycle-collected, main-thread-only).
//
// nsHTTPCompressConv::do_OnDataAvailable must not take a strong reference to the
// main-thread-only listener on the background thread: AddRef-ing a non-threadsafe
// object off the main thread crashes builds with thread-ownership assertions
// (DEBUG / Nightly) and races the reference count in release builds.
//
// This test serves gzip content to a JS listener. When run from a content
// process (see the *_wrap.js variant under unit_ipc), it exercises the
// off-main-thread decompression path and verifies the data is decoded and
// delivered correctly rather than crashing.
//
// The prefs that force off-main-thread decompression are set via the manifest
// (xpcshell.toml) rather than here, because this test also runs in a content
// process, which cannot set prefs.

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

// gzip-compressed body that decodes to 14 bytes.
const GZIP_BODY = [
  0x1f, 0x8b, 0x08, 0x08, 0x5a, 0xa0, 0x31, 0x4f, 0x00, 0x03, 0x74, 0x78, 0x74,
  0x00, 0x2b, 0xc9, 0xc8, 0x2c, 0x56, 0x00, 0xa2, 0x92, 0xd4, 0xe2, 0x12, 0x43,
  0x2e, 0x00, 0xb9, 0x23, 0xd7, 0x3b, 0x0e, 0x00, 0x00, 0x00,
];
const DECODED_LENGTH = 14;

var httpserver = new HttpServer();

function serverHandler(metadata, response) {
  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Content-Encoding", "gzip", false);
  response.setHeader("Content-Length", "" + GZIP_BODY.length, false);

  let bos = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
    Ci.nsIBinaryOutputStream
  );
  bos.setOutputStream(response.bodyOutputStream);
  response.processAsync();
  bos.writeByteArray(GZIP_BODY);
  response.finish();
}

registerCleanupFunction(async () => {
  await httpserver.stop();
});

add_task(async function test_omt_decompress_to_js_listener() {
  // The off-main-thread decompression path is content-process only. Log which
  // process we are in so a harness change that stops running this in a content
  // process is visible rather than silently neutering the regression coverage.
  let isContent =
    Services.appinfo.processType == Ci.nsIXULRuntime.PROCESS_TYPE_CONTENT;
  info(
    isContent
      ? "running in a content process: off-main-thread decompression is active"
      : "running in the parent process: decompression stays on the main thread"
  );

  httpserver.registerPathHandler("/gzip", serverHandler);
  httpserver.start(-1);

  let uri = "http://localhost:" + httpserver.identity.primaryPort + "/gzip";

  let data = await new Promise(resolve => {
    let chan = NetUtil.newChannel({
      uri,
      loadUsingSystemPrincipal: true,
    });
    // Bypass the cache so no nsStreamListenerTee is inserted between the
    // converter and the JS listener.
    chan.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    // Plain JS listener: non-retargetable and non-threadsafe-refcounted.
    chan.asyncOpen(
      new ChannelListener(
        (request, receivedData) => resolve(receivedData),
        null,
        CL_EXPECT_GZIP
      )
    );
  });

  Assert.equal(
    data.length,
    DECODED_LENGTH,
    "gzip body was decompressed and fully delivered to the JS listener"
  );
});
