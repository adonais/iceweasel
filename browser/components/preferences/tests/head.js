/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * @import { SettingControl } from "chrome://browser/content/preferences/widgets/setting-control.mjs"
 * @import { Setting } from "chrome://global/content/preferences/Setting.mjs"
 */

const { EnterprisePolicyTesting, PoliciesPrefTracker } =
  ChromeUtils.importESModule(
    "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
  );

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);
const { PermissionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PermissionTestUtils.sys.mjs"
);
const { PromptTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromptTestUtils.sys.mjs"
);

ChromeUtils.defineLazyGetter(this, "QuickSuggestTestUtils", () => {
  const { QuickSuggestTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/QuickSuggestTestUtils.sys.mjs"
  );
  module.init(this);
  return module;
});

ChromeUtils.defineESModuleGetters(this, {
  ExperimentAPI: "resource://nimbus/ExperimentAPI.sys.mjs",
  QuickSuggest: "moz-src:///browser/components/urlbar/QuickSuggest.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

NimbusTestUtils.init(this);

const kDefaultWait = 2000;

// Synthesized events are not available with native menus
const nativeSelectEnabled = () =>
  AppConstants.platform == "macosx" &&
  Services.prefs.getBoolPref("widget.macos.native-anchored-menus", false) &&
  Services.prefs.getBoolPref("widget.macos.allow-native-select", false);

const SRD_PREF_VALUE = Services.prefs.getBoolPref(
  "browser.settings-redesign.enabled"
);

function is_element_visible(aElement, aMsg) {
  isnot(aElement, null, "Element should not be null, when checking visibility");
  ok(!BrowserTestUtils.isHidden(aElement), aMsg);
}

function is_element_hidden(aElement, aMsg) {
  isnot(aElement, null, "Element should not be null, when checking visibility");
  ok(BrowserTestUtils.isHidden(aElement), aMsg);
}

function open_preferences(aCallback) {
  gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, "about:preferences");
  let newTabBrowser = gBrowser.getBrowserForTab(gBrowser.selectedTab);
  newTabBrowser.addEventListener(
    "Initialized",
    function () {
      aCallback(gBrowser.contentWindow);
    },
    { capture: true, once: true }
  );
}

function openAndLoadSubDialog(
  aURL,
  aFeatures = null,
  aParams = null,
  aClosingCallback = null
) {
  let promise = promiseLoadSubDialog(aURL);
  content.gSubDialog.open(
    aURL,
    { features: aFeatures, closingCallback: aClosingCallback },
    aParams
  );
  return promise;
}

function promiseLoadSubDialog(aURL) {
  return new Promise(resolve => {
    content.gSubDialog._dialogStack.addEventListener(
      "dialogopen",
      function dialogopen(aEvent) {
        if (
          aEvent.detail.dialog._frame.contentWindow.location == "about:blank"
        ) {
          return;
        }
        content.gSubDialog._dialogStack.removeEventListener(
          "dialogopen",
          dialogopen
        );

        is(
          aEvent.detail.dialog._frame.contentWindow.location.toString(),
          aURL,
          "Check the proper URL is loaded"
        );

        // Check visibility
        is_element_visible(aEvent.detail.dialog._overlay, "Overlay is visible");

        // Check that stylesheets were injected
        let expectedStyleSheetURLs =
          aEvent.detail.dialog._injectedStyleSheets.slice(0);
        for (let styleSheet of aEvent.detail.dialog._frame.contentDocument
          .styleSheets) {
          let i = expectedStyleSheetURLs.indexOf(styleSheet.href);
          if (i >= 0) {
            info("found " + styleSheet.href);
            expectedStyleSheetURLs.splice(i, 1);
          }
        }
        is(
          expectedStyleSheetURLs.length,
          0,
          "All expectedStyleSheetURLs should have been found"
        );

        // Wait for the next event tick to make sure the remaining part of the
        // testcase runs after the dialog gets ready for input.
        executeSoon(() => resolve(aEvent.detail.dialog._frame.contentWindow));
      }
    );
  });
}

async function openPreferencesViaOpenPreferencesAPI(aPane, aOptions) {
  let finalPaneEvent = Services.prefs.getBoolPref("identity.fxaccounts.enabled")
    ? "sync-pane-loaded"
    : "privacy-pane-loaded";
  let finalPrefPaneLoaded = TestUtils.topicObserved(finalPaneEvent, () => true);
  gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    allowInheritPrincipal: true,
  });
  openPreferences(aPane, aOptions);
  let newTabBrowser = gBrowser.selectedBrowser;

  if (!newTabBrowser.contentWindow) {
    await BrowserTestUtils.waitForEvent(newTabBrowser, "Initialized", true);
    if (newTabBrowser.contentDocument.readyState != "complete") {
      await BrowserTestUtils.waitForEvent(newTabBrowser.contentWindow, "load");
    }
    await finalPrefPaneLoaded;
  }

  let win = gBrowser.contentWindow;
  let selectedPane = win.history.state;
  if (!aOptions || !aOptions.leaveOpen) {
    gBrowser.removeCurrentTab();
  }
  return { selectedPane };
}

async function runSearchInput(input) {
  let searchInput = gBrowser.contentDocument.getElementById("searchInput");
  searchInput.focus();
  let searchCompletedPromise = BrowserTestUtils.waitForEvent(
    gBrowser.contentWindow,
    "PreferencesSearchCompleted",
    evt => evt.detail == input
  );
  EventUtils.sendString(input);
  await searchCompletedPromise;
}

async function evaluateSearchResults(
  keyword,
  searchResults,
  includeExperiments = false
) {
  searchResults = Array.isArray(searchResults)
    ? searchResults
    : [searchResults];
  searchResults.push("header-searchResults");

  await runSearchInput(keyword);

  let mainPrefTag = gBrowser.contentDocument.getElementById("mainPrefPane");
  for (let i = 0; i < mainPrefTag.childElementCount; i++) {
    let child = mainPrefTag.children[i];
    if (!includeExperiments && child.id?.startsWith("pane-experimental")) {
      continue;
    }
    if (child.localName == "setting-group") {
      if (searchResults.includes(child.groupId)) {
        is_element_visible(
          child,
          `${child.groupId} should be in search results`
        );
      } else {
        is_element_hidden(
          child,
          `${child.groupId} should not be in search results`
        );
      }
    } else if (searchResults.includes(child.id)) {
      is_element_visible(child, `${child.id} should be in search results`);
    } else if (child.id) {
      is_element_hidden(child, `${child.id} should not be in search results`);
    }
  }
}

function waitForMutation(target, opts, cb) {
  return new Promise(resolve => {
    let observer = new MutationObserver(() => {
      if (!cb || cb(target)) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(target, opts);
  });
}

/**
 * Creates observer that waits for and then compares all perm-changes with the observances in order.
 *
 * @param {Array} observances permission changes to observe (order is important)
 * @returns {Promise} Promise object that resolves once all permission changes have been observed
 */
function createObserveAllPromise(observances) {
  // Create new promise that resolves once all items
  // in observances array have been observed.
  return new Promise(resolve => {
    let permObserver = {
      observe(aSubject, aTopic, aData) {
        if (aTopic != "perm-changed") {
          return;
        }

        if (!observances.length) {
          // See bug 1063410
          return;
        }

        let permission = aSubject.QueryInterface(Ci.nsIPermission);
        let expected = observances.shift();

        info(
          `observed perm-changed for ${permission.principal.origin} (remaining ${observances.length})`
        );

        is(aData, expected.data, "type of message should be the same");
        for (let prop of ["type", "capability", "expireType"]) {
          if (expected[prop]) {
            is(
              permission[prop],
              expected[prop],
              `property: "${prop}" should be equal (${permission.principal.origin})`
            );
          }
        }

        if (expected.origin) {
          is(
            permission.principal.origin,
            expected.origin,
            `property: "origin" should be equal (${permission.principal.origin})`
          );
        }

        if (!observances.length) {
          Services.obs.removeObserver(permObserver, "perm-changed");
          executeSoon(resolve);
        }
      },
    };
    Services.obs.addObserver(permObserver, "perm-changed");
  });
}

/**
 * Waits for preference to be set and asserts the value.
 *
 * @param {string} pref - Preference key.
 * @param {*} expectedValue - Expected value of the preference.
 * @param {string} message - Assertion message.
 */
async function waitForAndAssertPrefState(pref, expectedValue, message) {
  await TestUtils.waitForPrefChange(pref, value => {
    if (value != expectedValue) {
      return false;
    }
    is(value, expectedValue, message);
    return true;
  });
}

/**
 * Select the given history mode via dropdown in the privacy pane.
 *
 * @param {Window} win - The preferences window which contains the
 * dropdown.
 * @param {string} value - The history mode to select.
 */
async function selectHistoryMode(win, value) {
  let historyMode = win.document.getElementById("historyMode").inputEl;

  // Find the index of the option with the given value. Do this before the first
  // click so we can bail out early if the option does not exist.
  let optionIndexStr = Array.from(historyMode.children)
    .findIndex(option => option.value == value)
    ?.toString();
  if (optionIndexStr == null) {
    throw new Error(
      "Could not find history mode option item for value: " + value
    );
  }

  // Scroll into view for click to succeed.
  historyMode.scrollIntoView();

  let popupShownPromise = BrowserTestUtils.waitForSelectPopupShown(window);

  await EventUtils.synthesizeMouseAtCenter(
    historyMode,
    {},
    historyMode.ownerGlobal
  );

  let popup = await popupShownPromise;
  let popupItems = Array.from(popup.children);

  let targetItem = popupItems.find(item => item.value == optionIndexStr);

  if (!targetItem) {
    throw new Error(
      "Could not find history mode popup item for value: " + value
    );
  }

  let popupHiddenPromise = BrowserTestUtils.waitForPopupEvent(popup, "hidden");

  if (nativeSelectEnabled()) {
    popup.activateItem(targetItem);
  } else {
    EventUtils.synthesizeMouseAtCenter(targetItem, {}, targetItem.ownerGlobal);
  }

  await popupHiddenPromise;
}

/**
 * Select the given history mode in the redesigned privacy pane.
 *
 * @param {Window} win - The preferences window which contains the
 * dropdown.
 * @param {string} value - The history mode to select.
 */
async function selectRedesignedHistoryMode(win, value) {
  let historyMode = win.document.querySelector(
    "setting-group[groupid='history2'] #historyMode"
  );
  let updated = waitForSettingControlChange(historyMode);

  let optionItems = Array.from(historyMode.children);
  let targetItem = optionItems.find(option => option.value == value);
  if (!targetItem) {
    throw new Error(
      "Could not find history mode popup item for value: " + value
    );
  }

  if (historyMode.value == value) {
    return;
  }

  targetItem.click();
  await updated;
}

async function updateCheckBoxElement(checkbox, value) {
  ok(checkbox, "the " + checkbox.id + " checkbox should exist");
  is_element_visible(
    checkbox,
    "the " + checkbox.id + " checkbox should be visible"
  );

  // No need to click if we're already in the desired state.
  if (checkbox.checked === value) {
    return;
  }

  // Scroll into view for click to succeed.
  checkbox.scrollIntoView();

  // Toggle the state.
  await EventUtils.synthesizeMouseAtCenter(checkbox, {}, checkbox.ownerGlobal);
}

async function updateCheckBox(win, id, value) {
  let checkbox = win.document.getElementById(id);
  ok(checkbox, "the " + id + " checkbox should exist");
  is_element_visible(checkbox, "the " + id + " checkbox should be visible");

  // No need to click if we're already in the desired state.
  if (checkbox.checked === value) {
    return;
  }

  // Scroll into view for click to succeed.
  checkbox.scrollIntoView();

  // Toggle the state.
  await EventUtils.synthesizeMouseAtCenter(checkbox, {}, checkbox.ownerGlobal);
}

/**
 * @param {Setting} setting The setting to wait on.
 * @param {() => any} [triggerFn]
 * An optional function to call that will trigger the change.
 */
function waitForSettingChange(setting, triggerFn) {
  let changePromise = new Promise(resolve => {
    setting.on("change", function handler() {
      setting.off("change", handler);
      resolve();
    });
  });
  if (triggerFn) {
    triggerFn();
  }
  return changePromise;
}

async function waitForSettingControlChange(control) {
  await waitForSettingChange(control.setting);
  await new Promise(resolve => requestAnimationFrame(resolve));
}

/**
 * Wait for the current setting pane to change.
 *
 * @param {string} paneId
 * @param {Window} [win] The window to check, defaults to current window.
 */
async function waitForPaneChange(
  paneId,
  win = gBrowser.selectedBrowser.contentWindow
) {
  let event = await BrowserTestUtils.waitForEvent(win.document, "paneshown");
  let expectId = paneId.startsWith("pane")
    ? paneId
    : `pane${paneId[0].toUpperCase()}${paneId.substring(1)}`;
  is(event.detail.category, expectId, "Loaded the correct pane");
}

/**
 * Get a reference to the setting-control for a specific setting ID.
 *
 * @param {string} settingId The setting ID
 * @param {Window} [win] The window to check, defaults to current window.
 * @returns {SettingControl}
 */
function getSettingControl(
  settingId,
  win = gBrowser.selectedBrowser.contentWindow
) {
  return win.document.getElementById(`setting-control-${settingId}`);
}

function synthesizeClick(el) {
  let target = el.buttonEl ?? el.inputEl ?? el;
  target.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(target, {}, target.ownerGlobal);
}

async function changeMozSelectValue(selectEl, value) {
  let control = selectEl.control;
  let changePromise = waitForSettingControlChange(control);
  selectEl.value = value;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  await changePromise;
}

// Ensure each test leaves the sidebar in its initial state when it completes
const initialSidebarState = { ...SidebarController.getUIState(), command: "" };
registerCleanupFunction(async function () {
  const { ObjectUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/ObjectUtils.sys.mjs"
  );
  if (
    !ObjectUtils.deepEqual(SidebarController.getUIState(), initialSidebarState)
  ) {
    info("Restoring to initial sidebar state");
    await SidebarController.updateUIState(initialSidebarState);
  }
});
/**
 * Waits for a boolean preference to change to the expected value.
 *
 * @param {string} prefName - The preference name.
 * @param {boolean} expectedValue - The expected boolean value.
 * @returns {Promise} Promise that resolves when the pref reaches the expected value.
 */
async function waitForPrefChange(prefName, expectedValue) {
  return TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref(prefName) === expectedValue,
    `Waiting for ${prefName} to be ${expectedValue}`
  );
}
