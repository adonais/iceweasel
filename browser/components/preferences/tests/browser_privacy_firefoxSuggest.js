/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This tests the Privacy pane's Firefox Suggest UI.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  QuickSuggest: "resource:///modules/QuickSuggest.sys.mjs",
});

const CONTAINER_ID = "firefoxSuggestPrivacyContainer";
const DATA_COLLECTION_TOGGLE_ID = "firefoxSuggestDataCollectionPrivacyToggle";

// This test can take a while due to the many permutations some of these tasks
// run through, so request a longer timeout.
requestLongerTimeout(10);

// The following tasks check the initial visibility of the Firefox Suggest UI
// and the visibility after installing a Nimbus experiment.

add_task(async function history_suggestDisabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["history"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
    nimbusVariables: {
      quickSuggestEnabled: false,
    },
  });
});

add_task(async function history_suggestEnabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["history"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
    nimbusVariables: {
      quickSuggestEnabled: true,
    },
    newExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
  });
});

add_task(async function history_suggestEnabled_hideSettingsUIDisabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["history"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
    nimbusVariables: {
      quickSuggestEnabled: true,
      quickSuggestHideSettingsUI: false,
    },
    newExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
  });
});

add_task(async function history_suggestEnabled_hideSettingsUIEnabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["history"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
    nimbusVariables: {
      quickSuggestEnabled: true,
      quickSuggestHideSettingsUI: true,
    },
  });
});

add_task(async function offlineOnline_suggestDisabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["offline", "online"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
    nimbusVariables: {
      quickSuggestEnabled: false,
    },
    newExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
  });
});

add_task(async function offlineOnline_suggestEnabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["offline", "online"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
    nimbusVariables: {
      quickSuggestEnabled: true,
    },
  });
});

add_task(async function offlineOnline_hideSettingsUIDisabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["offline", "online"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
    nimbusVariables: {
      quickSuggestHideSettingsUI: false,
    },
  });
});

add_task(async function offlineOnline_hideSettingsUIEnabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["offline", "online"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
    nimbusVariables: {
      quickSuggestHideSettingsUI: true,
    },
    newExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
  });
});

add_task(async function offlineOnline_suggestEnabled_hideSettingsUIDisabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["offline", "online"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
    nimbusVariables: {
      quickSuggestEnabled: true,
      quickSuggestHideSettingsUI: false,
    },
  });
});

add_task(async function offlineOnline_suggestEnabled_hideSettingsUIEnabled() {
  await doSuggestVisibilityTest({
    pane: "privacy",
    initialScenarios: ["offline", "online"],
    initialExpected: {
      [CONTAINER_ID]: { isVisible: true },
    },
    nimbusVariables: {
      quickSuggestEnabled: true,
      quickSuggestHideSettingsUI: true,
    },
    newExpected: {
      [CONTAINER_ID]: { isVisible: false },
    },
  });
});

// Clicks each of the checkboxes and toggles and makes sure the prefs and info box are updated.
add_task(async function clickCheckboxesOrToggle() {
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });

  let doc = gBrowser.selectedBrowser.contentDocument;
  let dataCollectionSection = doc.getElementById(CONTAINER_ID);
  dataCollectionSection.scrollIntoView();

  async function clickElement(id, eventName) {
    let element = doc.getElementById(id);
    let changed = BrowserTestUtils.waitForEvent(element, eventName);

    if (eventName == "toggle") {
      element = element.buttonEl;
    }

    EventUtils.synthesizeMouseAtCenter(
      element,
      {},
      gBrowser.selectedBrowser.contentWindow
    );
    await changed;
  }

  // Set initial state.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.quicksuggest.dataCollection.enabled", true]],
  });
  assertPrefUIState({
    [DATA_COLLECTION_TOGGLE_ID]: true,
  });

  // data collection toggle
  await clickElement(DATA_COLLECTION_TOGGLE_ID, "toggle");
  Assert.ok(
    !Services.prefs.getBoolPref(
      "browser.urlbar.quicksuggest.dataCollection.enabled"
    ),
    "quicksuggest.dataCollection.enabled is false after clicking data collection toggle"
  );
  assertPrefUIState({
    [DATA_COLLECTION_TOGGLE_ID]: false,
  });

  gBrowser.removeCurrentTab();
  await SpecialPowers.popPrefEnv();
});

// Clicks the learn-more links and checks the help page is opened in a new tab.
add_task(async function clickLearnMore() {
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });

  let doc = gBrowser.selectedBrowser.contentDocument;
  let dataCollectionSection = doc.getElementById(CONTAINER_ID);
  dataCollectionSection.scrollIntoView();

  // Set initial state so that the info box and learn more link are shown.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.quicksuggest.dataCollection.enabled", true]],
  });

  let toggle = dataCollectionSection.querySelector("moz-toggle");
  let learnMoreLink = toggle.shadowRoot.querySelector(
    "a[is='moz-support-link']"
  );

  ok(learnMoreLink, "Learn-more link is present");
  Assert.ok(
    BrowserTestUtils.isVisible(learnMoreLink),
    "Learn-more link is visible"
  );

  let prefsTab = gBrowser.selectedTab;
  let tabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    QuickSuggest.HELP_URL
  );
  info("Clicking learn-more link");
  await EventUtils.synthesizeMouseAtCenter(
    learnMoreLink,
    {},
    gBrowser.selectedBrowser.contentWindow
  );
  info("Waiting for help page to load in a new tab");
  await tabPromise;
  gBrowser.removeCurrentTab();
  gBrowser.selectedTab = prefsTab;

  gBrowser.removeCurrentTab();
  await SpecialPowers.popPrefEnv();
});

/**
 * Verifies the state of pref related to checkboxes or toggles.
 *
 * @param {object} stateByElementID
 *   Maps checkbox or toggle element IDs to booleans. Each boolean
 *   is the expected state of the corresponding ID.
 */
function assertPrefUIState(stateByElementID) {
  let doc = gBrowser.selectedBrowser.contentDocument;
  let container = doc.getElementById(CONTAINER_ID);
  let attr;
  Assert.ok(BrowserTestUtils.isVisible(container), "The container is visible");
  for (let [id, state] of Object.entries(stateByElementID)) {
    let element = doc.getElementById(id);
    if (element.tagName === "checkbox") {
      attr = "checked";
    } else if (element.tagName === "html:moz-toggle") {
      attr = "pressed";
    }
    Assert.equal(element[attr], state, "Expected state for ID: " + id);
  }
}
