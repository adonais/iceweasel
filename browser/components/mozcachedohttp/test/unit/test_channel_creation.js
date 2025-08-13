/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that channels are created with correct properties.
 */
add_task(async function test_channel_creation() {
  const testURI = createTestOHTTPResourceURI("https://example.com/image.jpg");
  const channel = createTestChannel(testURI);

  Assert.ok(channel, "Channel should be created");
  Assert.equal(channel.URI.spec, testURI, "Channel URI should match input");
  Assert.equal(channel.originalURI.spec, testURI, "Original URI should match");
  Assert.equal(channel.loadFlags, 0, "Default load flags should be 0");
  Assert.equal(channel.contentType, "", "Default content type should be empty");
  Assert.equal(
    channel.contentLength,
    -1,
    "Default content length should be -1"
  );
  Assert.equal(channel.status, Cr.NS_OK, "Default status should be NS_OK");
});

/**
 * Test that synchronous open throws an error.
 */
add_task(async function test_synchronous_open_not_supported() {
  const channel = createTestChannel(
    createTestOHTTPResourceURI("https://example.com/image.jpg")
  );

  Assert.throws(
    () => channel.open(),
    /moz-cached-ohttp protocol does not support synchronous open/,
    "Should throw error for synchronous open"
  );
});

/**
 * Test channel cancellation.
 */
add_task(async function test_channel_cancellation() {
  const channel = createTestChannel(
    createTestOHTTPResourceURI("https://example.com/image.jpg")
  );

  // Cancel the channel
  channel.cancel(Cr.NS_ERROR_ABORT);

  Assert.equal(channel.status, Cr.NS_ERROR_ABORT, "Status should be updated");
  Assert.equal(
    channel.isPending(),
    false,
    "Should not be pending after cancel"
  );

  // Try to open cancelled channel
  Assert.throws(
    () => {
      channel.asyncOpen({
        onStartRequest() {},
        onDataAvailable() {},
        onStopRequest() {},
      });
    },
    /Channel was cancelled/,
    "Should throw error when opening cancelled channel"
  );
});

/**
 * Test other channel properties.
 */
add_task(async function test_channel_properties() {
  const channel = createTestChannel(
    createTestOHTTPResourceURI("https://example.com/image.jpg")
  );

  Assert.ok(channel.QueryInterface(Ci.nsIChannel));

  // Test content type
  channel.contentType = "image/png";
  Assert.equal(channel.contentType, "image/png", "Should update content type");

  // Test content length
  channel.contentLength = 2048;
  Assert.equal(channel.contentLength, 2048, "Should update content length");

  // Test load flags
  channel.loadFlags = Ci.nsIRequest.LOAD_BYPASS_CACHE;
  Assert.equal(
    channel.loadFlags,
    Ci.nsIRequest.LOAD_BYPASS_CACHE,
    "Should update load flags"
  );

  // Test name property
  Assert.equal(
    channel.name,
    channel.URI.spec,
    "Channel name should match URI spec"
  );
});
