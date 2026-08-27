/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that SmartWindowTasks actor gets registered when preference is enabled
 */
add_task(async function test_smartwindow_tasks_actor_registration() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  await BrowserTestUtils.withNewTab("about:smartwindowtasks", async browser => {
    const actor =
      browser.browsingContext.currentWindowGlobal.getActor("SmartWindowTasks");
    Assert.ok(actor, "SmartWindowTasks actor should be registered");
  });

  await SpecialPowers.popPrefEnv();
});

/**
 * Test that SmartWindowTasks actor is not available when preference is disabled
 */
add_task(async function test_smartwindow_tasks_actor_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", false]],
  });

  await BrowserTestUtils.withNewTab("about:smartwindowtasks", async browser => {
    Assert.throws(
      () =>
        browser.browsingContext.currentWindowGlobal.getActor(
          "SmartWindowTasks"
        ),
      /NotFoundError/,
      "SmartWindowTasks actor should not be available when disabled"
    );
  });

  await SpecialPowers.popPrefEnv();
});

/**
 * Test that SmartWindowTasks actor can communicate with parent process
 */
add_task(async function test_smartwindow_tasks_actor_communication() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    // Wait for page to load
    if (content.document.readyState !== "complete") {
      await ContentTaskUtils.waitForEvent(content, "load");
    }

    // Wait for custom element to be defined
    await content.customElements.whenDefined("ai-tasks");

    const aiTasks = content.document.querySelector("ai-tasks");
    Assert.ok(aiTasks, "AI Tasks component exists");

    const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

    // Wait for initialization to complete
    await ContentTaskUtils.waitForCondition(
      () => aiTasksJS.monitors !== undefined,
      "AI Tasks should initialize and load monitors"
    );

    // Test that constants were loaded from the parent process
    const actor = content.windowGlobalChild.getActor("SmartWindowTasks");
    const result = await actor.sendQuery("SmartWindowTasks:GetConstants", {});

    Assert.ok(result.success, "Should get constants from parent");
    Assert.ok(result.constants, "Constants should be returned");
    Assert.ok(
      result.constants.SCHEDULE_TYPES,
      "Schedule types should be defined"
    );
    Assert.ok(
      result.constants.TOTAL_NUM_URLS_IN_MONITOR,
      "URL limit should be defined"
    );
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

/**
 * Test that SmartWindowTasks actor can handle monitor operations
 */
add_task(async function test_smartwindow_tasks_monitor_operations() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    // Wait for page to load
    if (content.document.readyState !== "complete") {
      await ContentTaskUtils.waitForEvent(content, "load");
    }

    // Wait for custom element to be defined
    await content.customElements.whenDefined("ai-tasks");

    const aiTasks = content.document.querySelector("ai-tasks");
    const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

    // Wait for initialization to complete
    await ContentTaskUtils.waitForCondition(
      () => aiTasksJS.monitors !== undefined,
      "AI Tasks should initialize and load monitors"
    );

    const actor = content.windowGlobalChild.getActor("SmartWindowTasks");

    // Test listing monitors
    const listResult = await actor.sendQuery(
      "SmartWindowTasks:ListMonitors",
      {}
    );
    Assert.ok(listResult.success, "Should list monitors successfully");
    Assert.ok(
      Array.isArray(listResult.monitors),
      "Should return array of monitors"
    );

    const initialCount = listResult.monitors.length;

    // Test creating a monitor
    const createResult = await actor.sendQuery(
      "SmartWindowTasks:CreateMonitor",
      {
        prompt: "Test monitor from actor test",
        watchUrls: ["https://example.com/test"],
        pageTitle: "Actor Test Monitor",
        schedule: {
          type: "daily",
          hour: 9,
          minute: 0,
        },
        source: "test",
      }
    );

    Assert.ok(createResult.success, "Should create monitor successfully");
    Assert.ok(createResult.monitor, "Should return created monitor");

    // Verify monitor was created
    const verifyResult = await actor.sendQuery(
      "SmartWindowTasks:ListMonitors",
      {}
    );
    Assert.equal(
      verifyResult.monitors.length,
      initialCount + 1,
      "Monitor count should increase by 1"
    );

    // Find the newly created monitor
    const newMonitor = verifyResult.monitors.find(
      m => m.monitorPrompt === "Test monitor from actor test"
    );
    Assert.ok(newMonitor, "Should find the newly created monitor");
    Assert.equal(
      newMonitor.title,
      "Actor Test Monitor",
      "Monitor should have correct title"
    );

    // Clean up the created monitor to avoid affecting other tests
    // Skip confirmation dialog in tests
    const deleteResult = await actor.sendQuery(
      "SmartWindowTasks:DeleteMonitor",
      { id: newMonitor.id, skipConfirmation: true }
    );

    Assert.ok(deleteResult.success, "Should delete monitor successfully");
    Assert.ok(deleteResult.deleted, "Monitor should be deleted");
    Assert.ok(!deleteResult.cancelled, "Deletion should not be cancelled");

    // Verify cleanup
    const finalResult = await actor.sendQuery(
      "SmartWindowTasks:ListMonitors",
      {}
    );
    Assert.equal(
      finalResult.monitors.length,
      initialCount,
      "Monitor count should return to initial value after cleanup"
    );
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

/**
 * Test that SmartWindowTasks actor can pause and unpause monitors
 */
add_task(async function test_smartwindow_tasks_pause_monitor() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    // Wait for page to load
    if (content.document.readyState !== "complete") {
      await ContentTaskUtils.waitForEvent(content, "load");
    }

    // Wait for custom element to be defined
    await content.customElements.whenDefined("ai-tasks");

    const aiTasks = content.document.querySelector("ai-tasks");
    const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

    // Wait for initialization to complete
    await ContentTaskUtils.waitForCondition(
      () => aiTasksJS.monitors !== undefined,
      "AI Tasks should initialize and load monitors"
    );

    const actor = content.windowGlobalChild.getActor("SmartWindowTasks");

    // Create a test monitor
    const createResult = await actor.sendQuery(
      "SmartWindowTasks:CreateMonitor",
      {
        prompt: "Test pause monitor",
        watchUrls: ["https://example.com/test-pause"],
        pageTitle: "Pause Test Monitor",
        schedule: {
          type: "daily",
          hour: 9,
          minute: 0,
        },
        source: "test",
      }
    );

    Assert.ok(createResult.success, "Should create monitor successfully");
    const monitorId = createResult.monitor;
    Assert.ok(monitorId, "Should return monitor ID");

    // Test pausing the monitor
    const pauseResult = await actor.sendQuery("SmartWindowTasks:PauseMonitor", {
      id: monitorId,
      pause: true,
    });
    Assert.ok(pauseResult.success, "Should pause monitor successfully");

    // Verify monitor is paused (enabled=false)
    const listAfterPause = await actor.sendQuery(
      "SmartWindowTasks:ListMonitors",
      {}
    );
    const pausedMonitor = listAfterPause.monitors.find(m => m.id === monitorId);
    Assert.ok(pausedMonitor, "Should find the monitor");
    Assert.equal(
      pausedMonitor.enabled,
      false,
      "Monitor should be disabled after pause"
    );

    // Test unpausing the monitor
    const unpauseResult = await actor.sendQuery(
      "SmartWindowTasks:PauseMonitor",
      { id: monitorId, pause: false }
    );
    Assert.ok(unpauseResult.success, "Should unpause monitor successfully");

    // Verify monitor is unpaused (enabled=true)
    const listAfterUnpause = await actor.sendQuery(
      "SmartWindowTasks:ListMonitors",
      {}
    );
    const unpausedMonitor = listAfterUnpause.monitors.find(
      m => m.id === monitorId
    );
    Assert.equal(
      unpausedMonitor.enabled,
      true,
      "Monitor should be enabled after unpause"
    );

    // Test toggle behavior (when pause parameter is undefined)
    const toggleResult = await actor.sendQuery(
      "SmartWindowTasks:PauseMonitor",
      { id: monitorId }
    );
    Assert.ok(toggleResult.success, "Should toggle monitor state successfully");

    // Verify monitor state is toggled (should be false now)
    const listAfterToggle = await actor.sendQuery(
      "SmartWindowTasks:ListMonitors",
      {}
    );
    const toggledMonitor = listAfterToggle.monitors.find(
      m => m.id === monitorId
    );
    Assert.equal(
      toggledMonitor.enabled,
      false,
      "Monitor should be toggled to disabled"
    );

    // Clean up the created monitor
    // Skip confirmation dialog in tests
    const deleteResult = await actor.sendQuery(
      "SmartWindowTasks:DeleteMonitor",
      { id: monitorId, skipConfirmation: true }
    );

    Assert.ok(deleteResult.success, "Should delete monitor successfully");
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

/**
 * Test that SmartWindowTasks actor can run monitor check now
 */
add_task(async function test_smartwindow_tasks_run_monitor() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    // Wait for page to load
    if (content.document.readyState !== "complete") {
      await ContentTaskUtils.waitForEvent(content, "load");
    }

    // Wait for custom element to be defined
    await content.customElements.whenDefined("ai-tasks");

    const aiTasks = content.document.querySelector("ai-tasks");
    const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

    // Wait for initialization to complete
    await ContentTaskUtils.waitForCondition(
      () => aiTasksJS.monitors !== undefined,
      "AI Tasks should initialize and load monitors"
    );

    const actor = content.windowGlobalChild.getActor("SmartWindowTasks");

    // Create a test monitor
    const createResult = await actor.sendQuery(
      "SmartWindowTasks:CreateMonitor",
      {
        prompt: "Test check now functionality",
        watchUrls: ["https://example.com/test"],
        pageTitle: "Check Now Test Monitor",
        schedule: {
          type: "daily",
          hour: 9,
          minute: 0,
        },
        source: "test",
      }
    );

    Assert.ok(createResult.success, "Should create monitor successfully");
    const monitorId = createResult.monitor;
    Assert.ok(monitorId, "Should return monitor ID");

    // Test running the monitor now - simulating clicking "Check Now" button
    const runResult = await actor.sendQuery("SmartWindowTasks:RunMonitor", {
      id: monitorId,
    });

    // The actor call should return a response
    Assert.notStrictEqual(
      runResult.success,
      undefined,
      "Should get a response from RunMonitor"
    );

    // Log the result for debugging
    if (runResult.success) {
      info("Monitor check now completed successfully");
    } else if (runResult.error) {
      info(`Monitor check now returned: ${runResult.error}`);
    }

    // Clean up the created monitor
    // Skip confirmation dialog in tests
    const deleteResult = await actor.sendQuery(
      "SmartWindowTasks:DeleteMonitor",
      { id: monitorId, skipConfirmation: true }
    );

    Assert.ok(deleteResult.success, "Should delete monitor successfully");
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
