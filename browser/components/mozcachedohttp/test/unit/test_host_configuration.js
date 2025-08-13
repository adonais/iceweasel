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
 * Test host validation and configuration mapping.
 */
add_task(async function test_host_validation_and_mapping() {
  const protocolHandler = new MozCachedOHTTPProtocolHandler();

  // Test invalid host throws error in getOHTTPGatewayConfigAndRelayURI
  await Assert.rejects(
    protocolHandler.getOHTTPGatewayConfigAndRelayURI("invalid-host"),
    /Unrecognized host for OHTTP config: invalid-host/,
    "Should reject invalid host in getOHTTPConfig"
  );
});

/**
 * Test lazy preference loading and caching behavior.
 */
add_task(async function test_lazy_preference_loading() {
  const protocolHandler = new MozCachedOHTTPProtocolHandler();

  // Set up preferences for testing
  const gatewayConfigURL = "https://example.com/ohttp-config";
  const relayURL = "https://example.com/ohttp-relay";

  Services.prefs.setCharPref(
    "browser.newtabpage.activity-stream.discoverystream.ohttp.configURL",
    gatewayConfigURL
  );
  Services.prefs.setCharPref(
    "browser.newtabpage.activity-stream.discoverystream.ohttp.relayURL",
    relayURL
  );

  // Stub ObliviousHTTP.getOHTTPConfig to avoid network requests
  const stub = sinon
    .stub(ObliviousHTTP, "getOHTTPConfig")
    .resolves(new Uint8Array([1, 2, 3, 4]));

  try {
    // First call should load preferences lazily
    const { ohttpGatewayConfig: config1 } =
      await protocolHandler.getOHTTPGatewayConfigAndRelayURI("newtab-image");
    Assert.ok(config1 instanceof Uint8Array, "Should return OHTTP config");
    Assert.ok(
      stub.calledWith(gatewayConfigURL),
      "Should call ObliviousHTTP with correct config URL"
    );

    // Second call should use cached preferences
    stub.resetHistory();
    const { ohttpGatewayConfig: config2 } =
      await protocolHandler.getOHTTPGatewayConfigAndRelayURI("newtab-image");
    Assert.ok(
      config2 instanceof Uint8Array,
      "Should return OHTTP config on second call"
    );
    Assert.ok(
      stub.calledWith(gatewayConfigURL),
      "Should still call ObliviousHTTP with same config URL"
    );

    // Test relay URI loading
    const { relayURI: relay1 } =
      await protocolHandler.getOHTTPGatewayConfigAndRelayURI("newtab-image");
    Assert.equal(relay1.spec, relayURL, "Should return correct relay URI");
  } finally {
    stub.restore();
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.discoverystream.ohttp.configURL"
    );
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.discoverystream.ohttp.relayURL"
    );
  }
});
