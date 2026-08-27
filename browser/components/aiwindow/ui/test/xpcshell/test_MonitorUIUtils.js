/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MonitorUIUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/MonitorUIUtils.sys.mjs"
);

const { MonitorAgent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs"
);

const originalDelete = MonitorAgent.deleteMonitor;

/**
 * Test that deleteMonitorWithConfirmation returns correct values when confirmation is skipped
 */
add_task(async function test_deleteMonitorWithConfirmation_skip() {
  // Mock MonitorAgent.deleteMonitor to return true
  MonitorAgent.deleteMonitor = async () => true;

  try {
    // Test with skipConfirmation = true
    const result = await MonitorUIUtils.deleteMonitorWithConfirmation(
      null, // browsing context not needed when skipping
      "test-monitor-id",
      true // skipConfirmation
    );

    Assert.ok(result.success, "Should return success true");
    Assert.ok(result.deleted, "Should return deleted true");
    Assert.ok(!result.cancelled, "Should return cancelled false");
  } finally {
    // Restore original function
    MonitorAgent.deleteMonitor = originalDelete;
  }
});

/**
 * Test that deleteMonitorWithConfirmation handles deletion failure
 */
add_task(async function test_deleteMonitorWithConfirmation_delete_fails() {
  // Mock MonitorAgent.deleteMonitor to return false
  MonitorAgent.deleteMonitor = async () => false;

  try {
    // Test with skipConfirmation = true to avoid prompt
    const result = await MonitorUIUtils.deleteMonitorWithConfirmation(
      null,
      "test-monitor-id",
      true
    );

    Assert.ok(result.success, "Should return success true");
    Assert.ok(
      !result.deleted,
      "Should return deleted false when deletion fails"
    );
    Assert.ok(!result.cancelled, "Should return cancelled false");
  } finally {
    MonitorAgent.deleteMonitor = originalDelete;
  }
});

/**
 * Test that deleteMonitorWithConfirmation handles errors properly
 */
add_task(async function test_deleteMonitorWithConfirmation_error() {
  // Mock MonitorAgent.deleteMonitor to throw an error
  MonitorAgent.deleteMonitor = async () => {
    throw new Error("Test error");
  };

  try {
    const result = await MonitorUIUtils.deleteMonitorWithConfirmation(
      null,
      "test-monitor-id",
      true
    );

    Assert.ok(!result.success, "Should return success false on error");
    Assert.ok(!result.deleted, "Should return deleted false on error");
    Assert.ok(!result.cancelled, "Should return cancelled false on error");
    Assert.equal(result.error, "Test error", "Should include error message");
  } finally {
    MonitorAgent.deleteMonitor = originalDelete;
  }
});

/**
 * Test that all return values have consistent shape
 */
add_task(async function test_deleteMonitorWithConfirmation_return_shape() {
  // Test successful deletion
  MonitorAgent.deleteMonitor = async () => true;
  let result = await MonitorUIUtils.deleteMonitorWithConfirmation(
    null,
    "test-id",
    true
  );

  Assert.ok("success" in result, "Result should have success property");
  Assert.ok("deleted" in result, "Result should have deleted property");
  Assert.ok("cancelled" in result, "Result should have cancelled property");

  // Test deletion failure
  MonitorAgent.deleteMonitor = async () => false;
  result = await MonitorUIUtils.deleteMonitorWithConfirmation(
    null,
    "test-id",
    true
  );

  Assert.ok("success" in result, "Failed result should have success property");
  Assert.ok("deleted" in result, "Failed result should have deleted property");
  Assert.ok(
    "cancelled" in result,
    "Failed result should have cancelled property"
  );

  // Test error case
  MonitorAgent.deleteMonitor = async () => {
    throw new Error("Test");
  };
  result = await MonitorUIUtils.deleteMonitorWithConfirmation(
    null,
    "test-id",
    true
  );

  Assert.ok("success" in result, "Error result should have success property");
  Assert.ok("deleted" in result, "Error result should have deleted property");
  Assert.ok(
    "cancelled" in result,
    "Error result should have cancelled property"
  );
  Assert.ok("error" in result, "Error result should have error property");

  MonitorAgent.deleteMonitor = originalDelete;
});
