/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ObliviousHTTP } = ChromeUtils.importESModule(
  "resource://gre/modules/ObliviousHTTP.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * Test that the protocol handler rejects malformed moz-cached-ohttp URIs.
 */
add_task(async function test_malformed_uri_rejection() {
  const sandbox = sinon.createSandbox();

  try {
    // Stub OHTTP methods to avoid network calls
    sandbox
      .stub(ObliviousHTTP, "getOHTTPConfig")
      .resolves(new Uint8Array([1, 2, 3, 4]));
    sandbox.stub(ObliviousHTTP, "ohttpRequest").resolves({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

    const protocolHandler = new MozCachedOHTTPProtocolHandler();

    const malformedURIs = [
      "moz-cached-ohttp://newtab-image/",
      "moz-cached-ohttp://newtab-image/?url=",
      "moz-cached-ohttp://newtab-image/?url=http://example.com",
      "moz-cached-ohttp://newtab-image/?noturl=https://example.com",
      "moz-cached-ohttp://newtab-image/?url=ftp://example.com/file.jpg",
      "moz-cached-ohttp://newtab-image/?url=javascript:alert(1)",
      "moz-cached-ohttp://newtab-image/?url=data:image/png;base64,abc",
    ];

    // Use system principal for test environment
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const httpURI = Services.io.newURI("https://example.com/test");
    const loadInfo = NetUtil.newChannel({
      uri: httpURI,
      loadingPrincipal: principal,
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
      contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
    }).loadInfo;

    for (const uriString of malformedURIs) {
      const uri = Services.io.newURI(uriString);
      const channel = protocolHandler.newChannel(uri, loadInfo);

      // Test that the channel properly rejects the malformed URI
      let errorOccurred = false;
      await new Promise(resolve => {
        const listener = createCompletionListener(success => {
          errorOccurred = !success;
          resolve();
        });

        channel.asyncOpen(listener);
      });

      Assert.ok(errorOccurred, `Should reject malformed URI: ${uriString}`);
    }
  } finally {
    sandbox.restore();
  }
});

/**
 * Test that the protocol handler accepts valid HTTPS URLs.
 */
add_task(async function test_valid_url_acceptance() {
  const sandbox = sinon.createSandbox();

  try {
    // Mock successful OHTTP responses
    sandbox
      .stub(ObliviousHTTP, "getOHTTPConfig")
      .resolves(new Uint8Array([1, 2, 3, 4]));

    const validURIs = [
      createTestOHTTPResourceURI("https://example.com/image.jpg"),
      createTestOHTTPResourceURI("https://example.com/image.png"),
      createTestOHTTPResourceURI(
        "https://example.com/path/image.webp?param=value"
      ),
    ];

    for (const uriString of validURIs) {
      const channel = createTestChannel(uriString);

      // Channel should be created successfully
      Assert.ok(channel, `Should create channel for valid URI: ${uriString}`);
      Assert.equal(channel.URI.spec, uriString, "Channel URI should match");

      // Test that the channel can load successfully
      let success = false;
      await new Promise(resolve => {
        const listener = createCompletionListener(channelSuccess => {
          success = channelSuccess;
          resolve();
        });

        channel.asyncOpen(listener);
      });

      Assert.ok(success, `Should successfully load valid URI: ${uriString}`);
    }
  } finally {
    sandbox.restore();
  }
});
