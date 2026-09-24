"use strict";

const { XPCShellContentUtils } = ChromeUtils.importESModule(
  "resource://testing-common/XPCShellContentUtils.sys.mjs"
);

XPCShellContentUtils.init(this);

// "last-pb-context-exited" is fired from a private-context refcount kept on
// CanonicalBrowsingContext, which only counts content browsing contexts. The
// context therefore has to be created private -- an attached content context
// cannot have its origin attributes changed afterwards.
add_task(async function test_last_pb_context_exited() {
  const server = XPCShellContentUtils.createHttpServer({
    hosts: ["example.com"],
  });
  server.registerPathHandler("/", (request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.write("<!DOCTYPE html><title>private</title>");
  });

  const exited = TestUtils.topicObserved("last-pb-context-exited");

  const page = await XPCShellContentUtils.loadContentPage(
    "http://example.com/",
    { privateBrowsing: true }
  );

  const bc = page.browser.browsingContext;
  Assert.ok(bc.usePrivateBrowsing, "should be a private browsing context");
  Assert.ok(bc.isContent, "should be a content browsing context");

  await page.close();
  await exited;
});
