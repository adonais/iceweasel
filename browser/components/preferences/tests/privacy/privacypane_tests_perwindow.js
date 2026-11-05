// This file gets imported into the same scope as head.js.
/* import-globals-from head.js */

async function runTestOnPrivacyPrefPane(testFunc) {
  info("runTestOnPrivacyPrefPane entered");
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences",
    true,
    true
  );
  let browser = tab.linkedBrowser;
  info("loaded about:preferences");
  await browser.contentWindow.gotoPref("panePrivacy");
  info("viewing privacy pane, executing testFunc");
  await testFunc(browser.contentWindow);
  BrowserTestUtils.removeTab(tab);
}

function controlChanged(element) {
  element.doCommand();
}

async function test_dependent_elements_redesigned(win) {
  let historymode = win.document.getElementById("historyMode");
  ok(historymode, "history mode options should exist");

  let customButton = win.document.getElementById("customHistoryButton");
  ok(customButton, "advanced settings button should exist");

  // Wait for the button to be properly initialized with parentDisabled state
  await BrowserTestUtils.waitForMutationCondition(
    customButton,
    { attributes: true, subtree: true },
    () => customButton.parentDisabled
  );

  // button should only change in custom mode
  ok(customButton.parentDisabled, "button is disabled in remember mode");

  // setting the mode to custom shouldn't change anything
  await selectHistoryMode(win, "custom");
  ok(!customButton.parentDisabled, "button is enabled in custom mode");

  await selectHistoryMode(win, "remember");
  ok(customButton.parentDisabled, "button is disabled in remember mode");
}

function test_historymode_retention(mode, expect) {
  return async function test_historymode_retention_fn(win) {
    let historymode = win.document.getElementById("historyMode");
    ok(historymode, "history mode menulist should exist");

    if (
      (historymode.value == "remember" && mode == "dontremember") ||
      (historymode.value == "dontremember" && mode == "remember") ||
      (historymode.value == "custom" && mode == "dontremember")
    ) {
      return;
    }

    if (expect !== undefined) {
      is(
        historymode.value,
        expect,
        "history mode is expected to remain " + expect
      );
    }

    await selectHistoryMode(win, mode);
  };
}

function test_custom_retention(controlToChange, expect) {
  return async function test_custom_retention_fn(win) {
    let historymode = win.document.getElementById("historyMode");
    ok(historymode, "history mode options should exist");

    if (expect !== undefined) {
      is(
        historymode.value,
        expect,
        "history mode is expected to remain " + expect
      );
    }

    await selectHistoryMode(win, "custom");

    // Navigate to the custom subpane
    let paneChange = waitForPaneChange("history");
    let customButton = win.document.getElementById("customHistoryButton");
    customButton.click();
    await paneChange;

    controlToChange = win.document.querySelector(
      `setting-group[groupid='historyAdvanced'] #${controlToChange}`
    );
    ok(controlToChange, "the control to change should exist");
    await updateCheckBoxElement(controlToChange, !controlToChange.checked);
  };
}

const gPrefCache = new Map();

function cache_preferences(win) {
  let prefs = win.Preferences.getAll();
  for (let pref of prefs) {
    gPrefCache.set(pref.id, pref.value);
  }
}

function reset_preferences(win) {
  let prefs = win.Preferences.getAll();
  // Avoid assigning undefined, which means clearing a "user"/test pref value
  for (let pref of prefs) {
    if (gPrefCache.has(pref.id)) {
      pref.value = gPrefCache.get(pref.id);
    }
  }
}

function run_test_subset(subset) {
  info("subset: " + Array.from(subset, x => x.name).join(",") + "\n");
  let tests = [cache_preferences, ...subset, reset_preferences];
  for (let test of tests) {
    add_task(runTestOnPrivacyPrefPane.bind(undefined, test));
  }
}
