/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MonitorAgent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs"
);

const { Region } = ChromeUtils.importESModule(
  "resource://gre/modules/Region.sys.mjs"
);

const SUPPORTED_REGIONS_PREF = "browser.smartwindow.agent.supportedRegions";
const TEST_REGION = "US";

/**
 * Tests for monitor creation in ai-tasks component
 */

// Pin the home region so the region gate is deterministic. Individual tests
// control support via the SUPPORTED_REGIONS_PREF pref.
add_setup(async function () {
  const originalRegion = Region.home;
  Region._setHomeRegion(TEST_REGION, false);
  registerCleanupFunction(() => {
    Region._setHomeRegion(originalRegion, false);
  });
});

// Test that the about:smartwindowtasks page loads and ai-tasks element exists
add_task(async function test_ai_tasks_page_loads() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, TEST_REGION],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    // Wait for page to load
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      // Wait for custom element to be defined
      await content.customElements.whenDefined("ai-tasks");

      const aiTasks = content.document.querySelector("ai-tasks");
      Assert.ok(aiTasks, "ai-tasks element exists");

      // Check that shadow root exists
      Assert.ok(aiTasks.shadowRoot, "ai-tasks has shadow root");

      // Check that the add button exists
      const addButton = aiTasks.shadowRoot.querySelector(".add-task-button");
      Assert.ok(addButton, "Add Monitor button exists");
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
  }

  await SpecialPowers.popPrefEnv();
});

// Test that clicking the Add Monitor button opens the dialog
add_task(async function test_dialog_opens() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, TEST_REGION],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      // Wait for page to load
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      // Wait for custom element to be defined
      await content.customElements.whenDefined("ai-tasks");

      const aiTasks = content.document.querySelector("ai-tasks");
      const addButton = aiTasks.shadowRoot.querySelector(".add-task-button");

      // Click the add button
      addButton.click();

      // Wait a moment for the dialog to open
      await new Promise(resolve => content.setTimeout(resolve, 100));

      // Check that dialog is now open
      const dialog = aiTasks.shadowRoot.querySelector("dialog");
      Assert.ok(dialog, "Dialog element exists");
      Assert.ok(dialog.open, "Dialog is open");

      // Check dialog title exists and is localized (avoid asserting on copy)
      const title = dialog.querySelector(".modal-title");
      Assert.ok(title, "Dialog title element exists");
      Assert.ok(
        title.hasAttribute("data-l10n-id"),
        "Dialog title is localized"
      );

      // Check that form elements exist
      const nameInput = dialog.querySelector("moz-input-text");
      const alertTextarea = dialog.querySelector("moz-textarea");
      const pageInput = dialog.querySelector("moz-input-url");
      const cancelButton = dialog.querySelector(
        'moz-button[data-l10n-id="ai-tasks-alert-cancel-button"]'
      );
      const startButton = dialog.querySelector(
        'moz-button[data-l10n-id="ai-tasks-alert-create-button"]'
      );

      Assert.ok(nameInput, "Name input exists");
      Assert.ok(alertTextarea, "Alert textarea exists");
      Assert.ok(pageInput, "Page URL input exists");
      Assert.ok(cancelButton, "Cancel button exists");
      Assert.ok(startButton, "Create alert button exists");

      // Check that start button is initially disabled
      Assert.ok(
        startButton.hasAttribute("disabled"),
        "Start button is initially disabled"
      );

      // Close the dialog
      cancelButton.click();

      // Wait for dialog to close
      await new Promise(resolve => content.setTimeout(resolve, 100));
      Assert.ok(!dialog.open, "Dialog closed after cancel");
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
  }

  await SpecialPowers.popPrefEnv();
});

// Test form validation - button enables when form is valid
add_task(async function test_form_validation() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, TEST_REGION],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      // Wait for page to load
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      // Wait for custom element to be defined
      await content.customElements.whenDefined("ai-tasks");

      const aiTasks = content.document.querySelector("ai-tasks");
      const addButton = aiTasks.shadowRoot.querySelector(".add-task-button");

      // Open the dialog
      addButton.click();
      await new Promise(resolve => content.setTimeout(resolve, 100));

      const dialog = aiTasks.shadowRoot.querySelector("dialog");
      const nameInput = dialog.querySelector("moz-input-text");
      const alertTextarea = dialog.querySelector("moz-textarea");
      const pageInput = dialog.querySelector("moz-input-url");
      const addPageButton = dialog.querySelector(".add-page-btn");
      const startButton = dialog.querySelector(
        'moz-button[data-l10n-id="ai-tasks-alert-create-button"]'
      );

      // Start button should be disabled initially
      Assert.ok(
        startButton.hasAttribute("disabled"),
        "Start button initially disabled"
      );

      // Get the component reference for property access
      const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

      // Fill in name (optional field)
      nameInput.value = "Test Monitor";
      nameInput.dispatchEvent(new content.Event("input", { bubbles: true }));

      // Update the component's monitorName property directly as well
      aiTasksJS.monitorName = "Test Monitor";

      // Start button should still be disabled (need alert description and URL)
      Assert.ok(
        startButton.hasAttribute("disabled"),
        "Start button still disabled without alert description"
      );

      // Fill in alert description
      alertTextarea.value = "Watch for price changes";
      alertTextarea.dispatchEvent(
        new content.Event("input", { bubbles: true })
      );

      // Update the component's alertDescription property directly as well
      aiTasksJS.alertDescription = "Watch for price changes";

      // Start button should still be disabled (need URL)
      Assert.ok(
        startButton.hasAttribute("disabled"),
        "Start button still disabled without URL"
      );

      // Add a URL - set value and trigger input event
      pageInput.value = "https://example.com";
      pageInput.dispatchEvent(new content.Event("input", { bubbles: true }));

      // Update the component's pendingUrl property directly as well
      aiTasksJS.pendingUrl = "https://example.com";

      // Wait a tick for the component to update
      await new Promise(resolve => content.setTimeout(resolve, 50));

      // Click the plus button to add the URL
      addPageButton.click();

      // Wait for URL pill to appear
      await ContentTaskUtils.waitForCondition(
        () => {
          const pills = aiTasks.shadowRoot.querySelectorAll(".page-pill");
          return pills && Boolean(pills.length);
        },
        "URL pill should appear after adding URL",
        100,
        50
      );

      // Check that URL pill exists
      const pagePill = aiTasks.shadowRoot.querySelector(".page-pill");
      Assert.ok(pagePill, "URL pill should exist");

      // Check that the pill contains the expected URL text
      const pillText = pagePill.querySelector(".page-pill-url");
      Assert.ok(
        pillText && pillText.textContent.includes("example.com"),
        "URL pill should display the domain"
      );

      // Now start button should be enabled
      await ContentTaskUtils.waitForCondition(
        () => !startButton.hasAttribute("disabled"),
        "Start button should be enabled with valid form",
        100,
        50
      );

      // Close dialog
      const cancelButton = dialog.querySelector(
        'moz-button[data-l10n-id="ai-tasks-alert-cancel-button"]'
      );
      cancelButton.click();
      await new Promise(resolve => content.setTimeout(resolve, 100));
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
  }

  await SpecialPowers.popPrefEnv();
});

// Test actual monitor creation with MonitorAgent
add_task(async function test_monitor_creation() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, TEST_REGION],
    ],
  });

  // Reset MonitorAgent state to ensure clean test environment
  await MonitorAgent._resetForTesting();

  // MonitorAgent will auto-initialize on first use
  const initialMonitors = await MonitorAgent.listMonitors();
  const initialCount = initialMonitors.length;

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    await SpecialPowers.spawn(
      tab.linkedBrowser,
      [initialCount],
      async count => {
        // Wait for page to load
        if (content.document.readyState !== "complete") {
          await ContentTaskUtils.waitForEvent(content, "load");
        }

        // Wait for custom element to be defined
        await content.customElements.whenDefined("ai-tasks");

        const aiTasks = content.document.querySelector("ai-tasks");
        const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;
        const addMonitorButton =
          aiTasks.shadowRoot.querySelector(".add-task-button");

        addMonitorButton.click();

        await ContentTaskUtils.waitForCondition(
          () => aiTasks.shadowRoot.querySelector("dialog[open]"),
          "Monitor dialog should open"
        );

        const dialog = aiTasks.shadowRoot.querySelector("dialog");
        const nameInput = dialog.querySelector("moz-input-text");
        const alertTextarea = dialog.querySelector("moz-textarea");
        const pageInput = dialog.querySelector("moz-input-url");
        const startButton = dialog.querySelector(
          'moz-button[data-l10n-id="ai-tasks-alert-create-button"]'
        );

        // Fill in the form using both DOM and component properties
        nameInput.value = "Product Monitor";
        nameInput.dispatchEvent(new content.Event("input", { bubbles: true }));
        aiTasksJS.monitorName = "Product Monitor";

        alertTextarea.value = "Test monitor for price changes";
        alertTextarea.dispatchEvent(
          new content.Event("input", { bubbles: true })
        );
        aiTasksJS.alertDescription = "Test monitor for price changes";

        pageInput.value = "https://example.com/product";
        pageInput.dispatchEvent(new content.Event("input", { bubbles: true }));
        aiTasksJS.pendingUrl = "https://example.com/product";

        // Press Enter to add the URL to pageUrls
        pageInput.dispatchEvent(
          new content.KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
          })
        );

        // Wait for URL pill to appear
        await ContentTaskUtils.waitForCondition(() => {
          const pills = aiTasks.shadowRoot.querySelectorAll(".page-pill");
          return pills && Boolean(pills.length);
        }, "URL pill should appear");

        await ContentTaskUtils.waitForCondition(
          () => !startButton.disabled,
          "Start button should be enabled"
        );

        startButton.click();

        await ContentTaskUtils.waitForCondition(
          () => !aiTasks.shadowRoot.querySelector("dialog[open]"),
          "Dialog should close after creation"
        );

        await ContentTaskUtils.waitForCondition(
          () => aiTasksJS.monitors && aiTasksJS.monitors.length > count,
          "Monitor list should update"
        );

        Assert.equal(
          aiTasksJS.monitors.length,
          count + 1,
          "One new monitor was created"
        );

        const newMonitor = aiTasksJS.monitors[aiTasksJS.monitors.length - 1];
        Assert.equal(
          newMonitor.monitorPrompt,
          "Test monitor for price changes",
          "Monitor has correct prompt"
        );
        Assert.ok(
          newMonitor.watchUrls.includes("https://example.com/product"),
          "Monitor has correct URL"
        );
        Assert.equal(
          newMonitor.schedule.type,
          "daily",
          "Monitor has correct schedule type"
        );
      }
    );

    const finalMonitors = await MonitorAgent.listMonitors();
    Assert.equal(
      finalMonitors.length,
      initialCount + 1,
      "Monitor was saved to database"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);

    // Reset MonitorAgent state after test to ensure clean state for next test
    await MonitorAgent._resetForTesting();

    await SpecialPowers.popPrefEnv();
  }
});

// Test that the Add Monitor button is hidden when the home region is not
// in the supported regions list.
add_task(async function test_add_button_hidden_when_region_unsupported() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, ""],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      await content.customElements.whenDefined("ai-tasks");

      const aiTasks = content.document.querySelector("ai-tasks");
      const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

      // The actor freezes _constants once it responds, while the defaults are a
      // plain copy. Wait for that so we assert on the resolved region value
      // rather than the default constant.
      await ContentTaskUtils.waitForCondition(
        () => Object.isFrozen(aiTasksJS._constants),
        "Constants should resolve from the actor"
      );

      Assert.ok(
        !aiTasksJS._constants.isMonitorRegionSupported,
        "Region support should resolve to false"
      );
      await aiTasksJS.updateComplete;

      Assert.ok(
        aiTasks.shadowRoot.querySelector(".unavailable-wrapper"),
        "Unavailable message is shown in an unsupported region"
      );
      Assert.ok(
        !aiTasks.shadowRoot.querySelector(".add-task-button"),
        "Add Monitor button is hidden in an unsupported region"
      );
      Assert.ok(
        !aiTasks.shadowRoot.querySelector("monitors-display"),
        "Monitors list is hidden in an unsupported region"
      );
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
  }

  await SpecialPowers.popPrefEnv();
});

// Test that the Add Monitor button is shown when the home region is supported.
add_task(async function test_add_button_shown_when_region_supported() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, TEST_REGION],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      await content.customElements.whenDefined("ai-tasks");

      const aiTasks = content.document.querySelector("ai-tasks");
      const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

      // The actor freezes _constants once it responds, while the defaults are a
      // plain copy. Wait for that so we assert on the resolved region value
      // rather than the default constant.
      await ContentTaskUtils.waitForCondition(
        () => Object.isFrozen(aiTasksJS._constants),
        "Constants should resolve from the actor"
      );

      Assert.ok(
        aiTasksJS._constants.isMonitorRegionSupported,
        "Region support should resolve to true"
      );
      await aiTasksJS.updateComplete;

      const addButton = aiTasks.shadowRoot.querySelector(".add-task-button");
      Assert.ok(addButton, "Add Monitor button exists");
      Assert.ok(
        !addButton.hasAttribute("disabled"),
        "Add Monitor button is enabled in a supported region"
      );
      Assert.ok(
        aiTasks.shadowRoot.querySelector("monitors-display"),
        "Monitors list is shown in a supported region"
      );
      Assert.ok(
        !aiTasks.shadowRoot.querySelector(".unavailable-wrapper"),
        "Unavailable message is hidden in a supported region"
      );
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
  }

  await SpecialPowers.popPrefEnv();
});

// Test that a secondary supported region (CA) is also treated as supported.
add_task(async function test_add_button_shown_for_secondary_region() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [SUPPORTED_REGIONS_PREF, "US,CA"],
    ],
  });

  const originalRegion = Region.home;
  Region._setHomeRegion("CA", false);

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:smartwindowtasks"
  );

  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }

      await content.customElements.whenDefined("ai-tasks");

      const aiTasks = content.document.querySelector("ai-tasks");
      const aiTasksJS = aiTasks.wrappedJSObject || aiTasks;

      await ContentTaskUtils.waitForCondition(
        () => Object.isFrozen(aiTasksJS._constants),
        "Constants should resolve from the actor"
      );

      Assert.ok(
        aiTasksJS._constants.isMonitorRegionSupported,
        "A home region of CA in the US,CA list resolves to supported"
      );
      await aiTasksJS.updateComplete;

      Assert.ok(
        aiTasks.shadowRoot.querySelector(".add-task-button"),
        "Add Monitor button is shown for the CA region"
      );
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    Region._setHomeRegion(originalRegion, false);
  }

  await SpecialPowers.popPrefEnv();
});
