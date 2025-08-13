/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that the protocol handler only accepts requests from privileged about content.
 */
add_task(async function test_privileged_about_content_only() {
  const protocolHandler = new MozCachedOHTTPProtocolHandler();
  const testURI = Services.io.newURI(
    createTestOHTTPResourceURI("https://example.com/image.jpg")
  );

  // Test valid privileged about content using system principal for test
  const systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
  const aboutLoadInfo = NetUtil.newChannel({
    uri: testURI,
    loadingPrincipal: systemPrincipal,
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).loadInfo;

  try {
    const channel = protocolHandler.newChannel(testURI, aboutLoadInfo);
    Assert.ok(channel, "Should accept requests from system principal in tests");
  } catch (e) {
    Assert.ok(false, `Should not throw for system principal: ${e.message}`);
  }

  // Test rejection of regular web content
  const webURI = Services.io.newURI("https://example.com");
  const webPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    webURI,
    {}
  );
  // Create loadInfo using a different URI scheme to avoid calling our protocol handler
  const httpURI = Services.io.newURI("https://example.com/web-test");
  const webLoadInfo = NetUtil.newChannel({
    uri: httpURI,
    loadingPrincipal: webPrincipal,
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).loadInfo;

  Assert.throws(
    () => protocolHandler.newChannel(testURI, webLoadInfo),
    /moz-cached-ohttp protocol only accessible from privileged about content/,
    "Should reject requests from regular web content"
  );

  // Test rejection of non-about content
  const mozURI = Services.io.newURI("moz-extension://test-extension-id/");
  const mozPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    mozURI,
    {}
  );
  // Create loadInfo using a different URI scheme to avoid calling our protocol handler
  const httpURI2 = Services.io.newURI("https://example.com/moz-test");
  const mozLoadInfo = NetUtil.newChannel({
    uri: httpURI2,
    loadingPrincipal: mozPrincipal,
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).loadInfo;

  Assert.throws(
    () => protocolHandler.newChannel(testURI, mozLoadInfo),
    /moz-cached-ohttp protocol only accessible from privileged about content/,
    "Should reject requests from extension content"
  );
});

/**
 * Test that the protocol handler's security context is preserved.
 */
add_task(async function test_security_context_preservation() {
  const testURI = createTestOHTTPResourceURI("https://example.com/image.jpg");
  const channel = createTestChannel(testURI);

  // Verify that the channel preserves the security context
  Assert.ok(channel.loadInfo, "Channel should have loadInfo");
  Assert.ok(
    channel.loadInfo.loadingPrincipal,
    "Channel should have loading principal"
  );

  const loadingPrincipal = channel.loadInfo.loadingPrincipal;
  Assert.ok(
    loadingPrincipal.isSystemPrincipal,
    "Loading principal should be system principal in tests"
  );

  // Verify security flags are preserved
  Assert.equal(
    channel.loadInfo.securityFlags,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
    "Security flags should be preserved"
  );

  // Verify content policy type
  Assert.equal(
    channel.loadInfo.externalContentPolicyType,
    Ci.nsIContentPolicy.TYPE_OTHER,
    "Content policy type should be preserved"
  );
});
