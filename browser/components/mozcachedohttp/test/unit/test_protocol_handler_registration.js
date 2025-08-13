/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that the moz-cached-ohttp protocol handler is properly registered.
 */
add_task(async function test_protocol_handler_registration() {
  // Test that the protocol handler is registered
  let protocolHandler;
  try {
    protocolHandler = Services.io
      .getProtocolHandler("moz-cached-ohttp")
      .QueryInterface(Ci.nsIProtocolHandler);
  } catch (e) {
    Assert.ok(false, "moz-cached-ohttp protocol handler should be registered");
    return;
  }

  Assert.ok(protocolHandler, "Protocol handler should exist");
  Assert.equal(protocolHandler.scheme, "moz-cached-ohttp", "Correct scheme");
});

/**
 * Test that the protocol handler rejects invalid ports.
 */
add_task(async function test_port_handling() {
  const protocolHandler = Services.io
    .getProtocolHandler("moz-cached-ohttp")
    .QueryInterface(Ci.nsIProtocolHandler);

  Assert.equal(
    protocolHandler.allowPort(80, "moz-cached-ohttp"),
    false,
    "Should not allow any ports"
  );

  Assert.equal(
    protocolHandler.allowPort(443, "moz-cached-ohttp"),
    false,
    "Should not allow any ports"
  );
});

/**
 * Test that creating a channel with invalid context throws an error.
 */
add_task(async function test_invalid_context_rejection() {
  const protocolHandler = Services.io
    .getProtocolHandler("moz-cached-ohttp")
    .QueryInterface(Ci.nsIProtocolHandler);

  const testURI = Services.io.newURI(
    createTestOHTTPResourceURI("https://example.com/image.jpg")
  );

  // Create a regular web content principal (not privileged about)
  const webURI = Services.io.newURI("https://example.com");
  const webPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    webURI,
    {}
  );

  // Create loadInfo using a different URI scheme to avoid calling our protocol handler
  const httpURI = Services.io.newURI("https://example.com/test");
  const loadInfo = NetUtil.newChannel({
    uri: httpURI,
    loadingPrincipal: webPrincipal,
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
  }).loadInfo;

  Assert.throws(
    () => protocolHandler.newChannel(testURI, loadInfo),
    /moz-cached-ohttp protocol only accessible from privileged about content/,
    "Should reject non-privileged contexts"
  );
});
