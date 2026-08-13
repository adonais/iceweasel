/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that you can control body limit preference via options panel

const TEST_URI = "data:text/html,test body limit";

add_task(async function () {
  const tab = await addTab(TEST_URI);

  const toolbox = await gDevTools.showToolboxForTab(tab, { toolId: "options" });

  const panel = toolbox.getCurrentPanel();
  const editButton = panel.panelDoc.querySelector(
    ".netmonitor-body-limit-button"
  );
  const input = panel.panelDoc.querySelector("#netmonitor-body-limit");
  const editSection = panel.panelDoc.querySelector(
    "#netmonitor-body-limit-edit"
  );
  const resetButton = panel.panelDoc.querySelector(
    ".netmonitor-body-limit-restore-default"
  );

  async function testBodyLimit(value, expectedValue, commit = "Return") {
    info(
      `Test setting body limit to ${value} and expecting it to be set to ${expectedValue}`
    );

    const previousValue = Services.prefs.getIntPref(
      "devtools.netmonitor.bodyLimit"
    );
    info("Click on edit button to show the input");
    await promiseButtonShown(editButton);
    editButton.click();

    info("Wait for the edit section to be visible");
    await waitFor(() => editSection.classList.contains("active"));
    ok(
      editButton.classList.contains("hidden"),
      "The edit button should be hidden"
    );

    info("Reset the input value");
    input.value = "";
    input.focus();

    const onConfigurationApplied = toolbox.once("new-configuration-applied");
    EventUtils.sendString(String(value), panel.panelWin);
    if (commit == "Return" || commit == "Escape") {
      EventUtils.sendKey(commit, panel.panelWin);
    } else if (commit == "set-button") {
      panel.panelDoc.querySelector(".netmonitor-body-limit-set").click();
    }

    info("Wait for the edit section to be hidden");
    await waitFor(() => !editSection.classList.contains("active"));

    if (expectedValue != previousValue) {
      info("Wait for the toolbox to apply the new configuration");
      await onConfigurationApplied;
    }

    is(
      Services.prefs.getIntPref("devtools.netmonitor.bodyLimit"),
      expectedValue,
      "The body limit pref changed"
    );
    ok(!editButton.classList.contains("hidden"), "Edit button should be shown");
    ok(
      !resetButton.classList.contains("hidden"),
      "Revert button should be shown"
    );
    await wait(0);
  }

  const defaultValue = Services.prefs.getIntPref(
    "devtools.netmonitor.bodyLimit"
  );

  await testBodyLimit("1024", 1024);
  await testBodyLimit("1025", 1024, "Escape");
  await testBodyLimit("-1", 1024);
  await testBodyLimit("foo", 1024);
  await testBodyLimit("0", 0);
  await testBodyLimit("10000000000", 2147483647);

  info(
    "Reset to the default body limit value before switching to another test"
  );
  const onConfigurationApplied = toolbox.once("new-configuration-applied");
  resetButton.click();
  await onConfigurationApplied;
  is(
    Services.prefs.getIntPref("devtools.netmonitor.bodyLimit"),
    defaultValue,
    "The body limit pref changed"
  );
});

function promiseButtonShown(button) {
  const dwu = window.windowUtils;
  return TestUtils.waitForCondition(() => {
    const bounds = dwu.getBoundsWithoutFlushing(button);
    return bounds.width > 0 && bounds.height > 0;
  }, `Waiting for button to have non-0 size`);
}
