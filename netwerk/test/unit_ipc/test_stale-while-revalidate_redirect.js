/*

Tests that a redirect received by the stale-while-revalidate background
revalidation channel isn't forwarded to the child channel whose load
triggered it (bug 2071998). The cached response is itself a redirect, so the
child is in the middle of its own redirect (HttpChannelChild::Redirect1Begin)
when the background revalidation also gets a 302.

The parent runs the server and tells the child when the background
revalidation is done. See child_stale-while-revalidate_redirect.js.

*/

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const TARGET_BODY = "target";

function redirect_handler(metadata, response) {
  response.setStatusLine(metadata.httpVersion, 302, "Found");
  response.setHeader("Location", "/target", false);
  response.setHeader(
    "Cache-control",
    "max-age=1, stale-while-revalidate=9999",
    false
  );
}

function target_handler(metadata, response) {
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Cache-control", "no-store", false);
  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.bodyOutputStream.write(TARGET_BODY, TARGET_BODY.length);
}

add_task(async function test_background_redirect_not_forwarded_to_child() {
  let httpserver = new HttpServer();
  httpserver.registerPathHandler("/redirect", redirect_handler);
  httpserver.registerPathHandler("/target", target_handler);
  httpserver.start(-1);
  registerCleanupFunction(() => httpserver.stop());

  Services.obs.addObserver(function observer() {
    Services.obs.removeObserver(observer, "http-on-background-revalidation");
    do_send_remote_message("revalidation-done");
  }, "http-on-background-revalidation");

  do_await_remote_message("start-test").then(() => {
    do_send_remote_message(
      "start-test-done",
      `http://localhost:${httpserver.identity.primaryPort}`
    );
  });

  await run_test_in_child("child_stale-while-revalidate_redirect.js");
});
