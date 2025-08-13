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
 * Test that host validation is properly integrated with channel loading.
 */
add_task(async function test_channel_loading_with_host_validation() {
  const sandbox = sinon.createSandbox();

  // Set up valid OHTTP preferences
  Services.prefs.setCharPref(
    "browser.newtabpage.activity-stream.discoverystream.ohttp.configURL",
    "https://example.com/ohttp-config"
  );
  Services.prefs.setCharPref(
    "browser.newtabpage.activity-stream.discoverystream.ohttp.relayURL",
    "https://example.com/ohttp-relay"
  );

  // Stub OHTTP methods
  sandbox
    .stub(ObliviousHTTP, "getOHTTPConfig")
    .resolves(new Uint8Array([1, 2, 3, 4]));

  MockOHTTPService.reset();

  try {
    // Test valid newtab-image host
    const validImageURL = "https://example.com/test-host-validation.jpg";
    const validTestURI = createTestOHTTPResourceURI(validImageURL);
    const validChannel = createTestChannel(validTestURI);

    let validLoadCompleted = false;
    await new Promise(resolve => {
      const listener = createCompletionListener(success => {
        validLoadCompleted = success;
        resolve();
      });

      validChannel.asyncOpen(listener);
    });

    Assert.ok(
      validLoadCompleted,
      "Should successfully load with valid newtab-image host"
    );
    Assert.ok(
      MockOHTTPService.channelCreated,
      "Should call OHTTP service for valid host"
    );

    // Reset mock for next test
    MockOHTTPService.reset();

    // Test invalid host
    const invalidHostURL =
      "moz-cached-ohttp://invalid-host/?url=" +
      encodeURIComponent("https://example.com/test-invalid-host.jpg");
    const invalidChannel = createTestChannel(invalidHostURL);

    let invalidLoadFailed = false;
    await new Promise(resolve => {
      const listener = createCompletionListener(success => {
        invalidLoadFailed = !success;
        resolve();
      });

      invalidChannel.asyncOpen(listener);
    });

    Assert.ok(invalidLoadFailed, "Should fail to load with invalid host");
    Assert.ok(
      !MockOHTTPService.channelCreated,
      "Should not call OHTTP service for invalid host"
    );
  } finally {
    sandbox.restore();
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.discoverystream.ohttp.configURL"
    );
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.discoverystream.ohttp.relayURL"
    );
  }
});
