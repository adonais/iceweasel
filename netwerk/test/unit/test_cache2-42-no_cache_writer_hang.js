/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Regression test for bug 2052908.
//
// A `Cache-Control: no-cache` response whose cache writer is suspended and then
// cancelled (as an address-bar autocomplete request is when the user keeps
// typing, and as tracking-protection annotation deferral can leave it -- bug
// 2030021) must not leave the cache entry perpetually "being written".  If it
// does, every later same-URL request has to revalidate, can't use the pending
// entry, and parks in nsHttpChannel's AwaitingCacheCallbacks state forever.
//
// We reproduce the wedged writer by suspending the writer channel from its
// listener's onStartRequest (once the cache output stream is being opened) and
// cancelling it while still suspended (never resuming, modelling the annotation
// callback that never fires).  We then issue a second no-cache request for the
// same URL and assert that it completes instead of hanging.
//
// End-to-end coverage note: this drives the real nsHttpChannel cache-wait path
// (RECHECK_AFTER_WRITE_FINISHED -> AwaitingCacheCallbacks).  The consumer is
// released by the writer-lock bypass / cache-wait backstop fixes.  Exercising
// the writer-side structural fix through its *specific* trigger (the ETP
// annotation suspend, mSuspendAfterExamineResponse) additionally requires the
// URL-classifier test-tracker setup plus
// privacy.trackingprotection.defer_annotation.enabled=true; see the block
// comment at the end for how to extend this test to that path.

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let httpServer = null;
let baseUrl = null;
let requestCount = 0;

function noCacheHandler(metadata, response) {
  requestCount++;
  response.setHeader("Content-Type", "text/plain", false);
  // Must revalidate before use -> later requests can't use a pending entry.
  response.setHeader("Cache-Control", "no-cache", false);
  const body = "suggestion-" + requestCount;
  response.bodyOutputStream.write(body, body.length);
}

function makeChannel(uri) {
  return NetUtil.newChannel({ uri, loadUsingSystemPrincipal: true });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

add_task(async function test_no_cache_writer_hang() {
  // Fire the suspended-writer bypass quickly so the test doesn't wait on its
  // production-sized default.  Disable the consumer-side cache-wait backstop
  // (set it to 0) so this test deterministically exercises exactly one release
  // path -- the writer-lock bypass -- and fails if that regresses instead of
  // being masked by the backstop.
  Services.prefs.setIntPref("network.cache.suspended_writer_delay_ms", 500);
  Services.prefs.setIntPref("network.cache.entry_wait_timeout_ms", 0);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("network.cache.suspended_writer_delay_ms");
    Services.prefs.clearUserPref("network.cache.entry_wait_timeout_ms");
  });

  // Strand the first (writer) channel as a cache writer whose output stream is
  // never closed and whose entry is never doomed.  We suspend it from its
  // listener's onStartRequest -- NOT from http-on-examine-response: suspending
  // that early makes ContinueProcessNormal2 defer the whole response (including
  // opening the cache output stream) to resume, so the entry never becomes
  // "being written".  By onStartRequest we are past that deferral point;
  // InstallCacheListener opens the cache output stream in the same synchronous
  // unwind right after onStartRequest returns, so the entry reaches READY with
  // its output stream open.  We then cancel while suspended, which defers the
  // channel's teardown (CloseCacheEntry / AsyncAbort) indefinitely -- exactly
  // the wedged-writer state from the bug.
  const writer = makeChannel(baseUrl);
  let resolveWriterDone;
  const writerDone = new Promise(resolve => {
    resolveWriterDone = resolve;
  });
  const writerStranded = new Promise(resolveStranded => {
    const listener = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
      onStartRequest() {
        writer.suspend();
        // Cancel on a fresh microtask, after the synchronous response
        // processing (which opens the cache output stream) has unwound.
        Promise.resolve().then(() => {
          writer.cancel(Cr.NS_BINDING_ABORTED);
          resolveStranded();
        });
      },
      onDataAvailable(request, stream, offset, count) {
        // Not expected while suspended, but drain defensively.
        const bis = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
          Ci.nsIBinaryInputStream
        );
        bis.setInputStream(stream);
        bis.readByteArray(count);
      },
      onStopRequest() {
        resolveWriterDone();
      },
    };
    writer.asyncOpen(listener);
  });
  await writerStranded;

  // Second request for the same URL. With the bug it parks forever behind the
  // zombie writer; with the fix it revalidates over the network and completes.
  let consumerData;
  try {
    const consumer = makeChannel(baseUrl);
    consumerData = await withTimeout(
      new Promise(resolve => {
        consumer.asyncOpen(
          new ChannelListener(
            (request, data) => resolve(data),
            null,
            CL_ALLOW_UNKNOWN_CL
          )
        );
      }),
      15000,
      "consumer hung in AwaitingCacheCallbacks behind a wedged cache writer"
    );
  } finally {
    // Resume the stranded writer so it can tear down cleanly (and not trip
    // xpcshell's shutdown checks), whether the consumer was released -- the
    // behavior under test -- or timed out because the fix is absent.
    writer.resume();
    await writerDone.catch(() => {});
  }

  Assert.greater(
    consumerData.length,
    0,
    "consumer received a response instead of hanging"
  );
});

function run_test() {
  httpServer = new HttpServer();
  httpServer.registerPathHandler("/sugg", noCacheHandler);
  httpServer.start(-1);
  baseUrl = `http://localhost:${httpServer.identity.primaryPort}/sugg`;

  registerCleanupFunction(() => {
    return new Promise(resolve => httpServer.stop(resolve));
  });

  run_next_test();
}

// To exercise the writer-side structural fix (nsHttpChannel::CancelInternal
// undoing the tracking-annotation suspend) through its exact trigger rather
// than a generic channel.suspend():
//
//   1. Set prefs:
//        privacy.trackingprotection.enabled = true
//        privacy.trackingprotection.annotate_channels = true
//        privacy.trackingprotection.defer_annotation.enabled = true
//   2. Register the served host on the URL classifier's tracking-annotation
//      table (UrlClassifierTestUtils.addTestTrackers() and load it in a
//      third-party context so NS_ShouldClassifyChannel(ETP) is true).
//   3. Drive the request so it becomes a cache writer, is suspended by
//      MaybeSuspendAfterExamineResponse() while annotation is pending, and is
//      cancelled before the annotation callback resolves.
//   4. Assert a second same-URL no-cache request completes (does not hang).
//
// That path is intentionally left out of the runnable test above because the
// classifier setup is substantially more involved; the scenario above already
// provides end-to-end regression coverage of the wedged-writer hang.
