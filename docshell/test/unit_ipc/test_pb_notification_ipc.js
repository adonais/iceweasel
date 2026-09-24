"use strict";

const { XPCShellContentUtils } = ChromeUtils.importESModule(
  "resource://testing-common/XPCShellContentUtils.sys.mjs"
);

XPCShellContentUtils.init(this);

// The private browsing context can only be created in the parent process, so
// the parent drives it and the child only observes. This covers the relay in
// ContentParent::Observe -> ContentChild::RecvLastPrivateDocShellDestroyed,
// which the content process consumers of this topic depend on.
add_task(async function test_pb_notification_relayed_to_child() {
  const server = XPCShellContentUtils.createHttpServer({
    hosts: ["example.com"],
  });
  server.registerPathHandler("/", (request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.write("<!DOCTYPE html><title>private</title>");
  });

  const promiseFinished = run_test_in_child("child_pb_notification.js");
  await do_await_remote_message("pb_notification_child_ready");

  const page = await XPCShellContentUtils.loadContentPage(
    "http://example.com/",
    { privateBrowsing: true }
  );
  await page.close();

  await promiseFinished;
});
