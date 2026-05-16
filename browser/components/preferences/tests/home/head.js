/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/preferences/tests/head.js",
  this
);

async function openHomePreferences() {
  await openPreferencesViaOpenPreferencesAPI("home", { leaveOpen: true });
  let doc = gBrowser.contentDocument;
  await BrowserTestUtils.waitForCondition(
    () => doc.querySelector('setting-group[groupid="home"]'),
    "Wait for the Firefox Home setting group to render"
  );

  // Wait for the setting-group web component to finish rendering
  let homeGroup = doc.querySelector('setting-group[groupid="home"]');
  if (homeGroup.updateComplete) {
    await homeGroup.updateComplete;
  }

  return {
    win: gBrowser.contentWindow,
    doc,
    tab: gBrowser.selectedTab,
  };
}

/**
 * Opens the custom homepage subpage directly and waits for it to fully render.
 *
 * @returns {Promise<object>} Object containing win, doc, and tab references.
 */

async function openCustomHomepageSubpage() {
  await openPreferencesViaOpenPreferencesAPI("customHomepage", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;

  await BrowserTestUtils.waitForCondition(
    () => doc.querySelector("#setting-control-customHomepageAddUrlInput"),
    "Wait for custom homepage subpage to fully render"
  );

  return { win: gBrowser.contentWindow, doc, tab: gBrowser.selectedTab };
}

/**
 * Waits for a setting control to render and complete any async updates.
 *
 * @param {string} settingId - The setting identifier.
 * @param {Window} [win] - Optional window, defaults to current browser window.
 * @returns {Promise<Element>} The rendered setting control element.
 */

async function settingControlRenders(settingId, win) {
  await BrowserTestUtils.waitForCondition(
    () => getSettingControl(settingId, win),
    `Wait for ${settingId} control to render`
  );
  let control = getSettingControl(settingId, win);
  if (control?.updateComplete) {
    await control.updateComplete;
  }
  return control;
}

/**
 * Waits for a boolean preference to change to the expected value.
 *
 * @param {string} prefName - The preference name.
 * @param {boolean} expectedValue - The expected boolean value.
 * @returns {Promise} Promise that resolves when the pref reaches the expected value.
 */

async function waitForCheckboxState(checkbox, expectedValue) {
  return TestUtils.waitForCondition(
    () => checkbox.checked === expectedValue,
    `Waiting for checkbox checked to be ${expectedValue}`
  );
}

/**
 * Opens a preferences pane, passes the document to the test function,
 * and ensures the tab is cleaned up afterwards
 *
 * @param {string} pane - The preferences pane to open
 * @param {Function} testFn - Async function receiving the pane's document
 */

async function waitForToggleState(toggle, expectedValue) {
  return TestUtils.waitForCondition(
    () => toggle.pressed === expectedValue,
    `Waiting for toggle pressed to be ${expectedValue}`
  );
}

/**
 * Waits for a checkbox element's checked state to change to the expected value.
 *
 * @param {Element} checkbox - The checkbox element.
 * @param {boolean} expectedValue - The expected checked state.
 * @returns {Promise} Promise that resolves when the checkbox reaches the expected state.
 */
