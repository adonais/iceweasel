/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ClientID: "resource://gre/modules/ClientID.sys.mjs",
  TelemetryUtils: "resource://gre/modules/TelemetryUtils.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

// Note: copied from preferences head.js. We can remove this when we migrate
// this test into that component.
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
    await BrowserTestUtils.waitForEvent(newTabBrowser.contentWindow, "load");
    await finalPrefPaneLoaded;
  }

  let win = gBrowser.contentWindow;
  let selectedPane = win.history.state;
  if (!aOptions || !aOptions.leaveOpen) {
    gBrowser.removeCurrentTab();
  }
  return { selectedPane };
}

// Note: copied from preferences head.js. We can remove this when we migrate
// this test into that component.
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
        ok(
          BrowserTestUtils.isVisible(aEvent.detail.dialog._overlay),
          "Overlay is visible"
        );

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

// Note: copied from preferences head.js. We can remove this when we migrate
// this test into that component.
async function waitForPaneChange(paneId) {
  let doc = gBrowser.selectedBrowser.contentDocument;
  let event = await BrowserTestUtils.waitForEvent(doc, "paneshown");
  let expectId = paneId.startsWith("pane")
    ? paneId
    : `pane${paneId[0].toUpperCase()}${paneId.substring(1)}`;
  is(event.detail.category, expectId, "Loaded the correct pane");
}

add_task(async function testHiddenWhenDisabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.profiles.enabled", false]],
  });

  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;

  let profilesCategory = doc.getElementById("profilesGroup");
  ok(profilesCategory, "The category exists");
  ok(!BrowserTestUtils.isVisible(profilesCategory), "The category is hidden");

  await SpecialPowers.popPrefEnv();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function testEnabled() {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let win = doc.ownerGlobal;

  // Verify the profiles section is shown when enabled.
  let profilesCategory = doc.getElementById("profilesGroup");
  ok(SelectableProfileService.isEnabled, "Profiles should be enabled");
  ok(profilesCategory, "The category exists");
  ok(BrowserTestUtils.isVisible(profilesCategory), "The category is visible");

  // Verify the Learn More link exists and points to the right place.
  let profilesSettingGroup = doc.querySelector(
    "setting-group[groupid='profiles']"
  ).firstElementChild;
  let learnMore = profilesSettingGroup.shadowRoot.querySelector(
    "a[is='moz-support-link']"
  );
  Assert.equal(
    "http://127.0.0.1:8888/support-dummy/profile-management",
    learnMore.href,
    "Learn More link should have expected URL"
  );

  // Verify that clicking the button opens the expected subpane.
  let profilesSubPane = doc.querySelector(
    "setting-pane[data-category='paneProfiles']"
  );
  ok(
    !BrowserTestUtils.isVisible(profilesSubPane),
    "Profiles subpane should be hidden"
  );
  let paneLoaded = waitForPaneChange("profiles");
  let subPaneButton = profilesSettingGroup.querySelector("#profilesSettings");
  subPaneButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(subPaneButton, {}, win);
  await paneLoaded;
  ok(
    BrowserTestUtils.isVisible(profilesSubPane),
    "Profiles subpane should be visible"
  );
  await profilesSubPane.updateComplete;

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function subpaneContentsWithOneProfile() {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let win = doc.ownerGlobal;

  let paneLoaded = waitForPaneChange("profiles");
  win.gotoPref("paneProfiles");
  await paneLoaded;

  let profilesSubPane = doc.querySelector(
    "setting-pane[data-category='paneProfiles']"
  );
  await profilesSubPane.updateComplete;

  Assert.equal(
    "preferences-profiles-group-header",
    profilesSubPane
      .querySelector("moz-page-header")
      .getAttribute("data-l10n-id"),
    "Subpane should have expected heading l10nId"
  );

  let manageProfilesButton = profilesSubPane.querySelector("#manageProfiles");
  ok(
    BrowserTestUtils.isVisible(manageProfilesButton),
    "Manage profiles button should be visible"
  );

  let copyProfilesSection = profilesSubPane.querySelector("#copyProfileHeader");
  ok(
    !BrowserTestUtils.isVisible(copyProfilesSection),
    "Until we create a second profile, the copy section should be hidden"
  );

  // Verify the manage profiles button opens the correct subdialog.
  manageProfilesButton.scrollIntoView();
  let promiseSubDialogLoaded = promiseLoadSubDialog("about:profilemanager");
  EventUtils.synthesizeMouseAtCenter(manageProfilesButton, {}, win);
  await promiseSubDialogLoaded;

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function copyProfile() {
  // Add an additional profile, then load the subpane, and the copy section should be visible.
  await initGroupDatabase();
  await SelectableProfileService.createNewProfile(false);

  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let win = doc.ownerGlobal;

  let paneLoaded = waitForPaneChange("profiles");
  win.gotoPref("paneProfiles");
  await paneLoaded;
  let profilesSubPane = doc.querySelector(
    "setting-pane[data-category='paneProfiles']"
  );
  await profilesSubPane.updateComplete;

  let manageProfilesButton = profilesSubPane.querySelector("#manageProfiles");
  ok(
    BrowserTestUtils.isVisible(manageProfilesButton),
    "Manage profiles button should be visible"
  );

  let copyProfilesSection = profilesSubPane.querySelector("#copyProfileHeader");
  ok(
    BrowserTestUtils.isVisible(copyProfilesSection),
    "Copy profile section should be visible"
  );

  let profilesCopyButton = copyProfilesSection.querySelector("#copyProfile");
  let profilesSelect = copyProfilesSection.querySelector("#copyProfileSelect");
  ok(
    profilesCopyButton.disabled,
    "Initially the copy button should be disabled"
  );
  ok(!profilesSelect.value, "Initially the select value should be unset");
  Assert.equal(
    profilesSelect.options.length,
    3,
    "Both profiles and the placeholder should be in the options list"
  );
  Assert.equal(
    profilesSelect.options[1].label,
    "Original profile",
    "The first profile should be listed"
  );
  Assert.equal(
    profilesSelect.options[2].label,
    "Profile 1",
    "The second profile should be listed"
  );

  profilesSelect.value = "1";
  profilesSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
  await profilesCopyButton.updateComplete;
  ok(
    !profilesCopyButton.disabled,
    "When a profile is selected, the copy button should be enabled"
  );

  let copyCalled = false;
  let mockGetProfile = lazy.sinon
    .stub(SelectableProfileService, "getProfile")
    .resolves({
      copyProfile: () => (copyCalled = true),
    });
  profilesCopyButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(profilesCopyButton, {}, win);
  await profilesSelect.updateComplete;
  ok(copyCalled, "The profile copy method should have been called");
  ok(
    !profilesSelect.value,
    "After copy, select value should be reset to empty value"
  );

  mockGetProfile.restore();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

// Tests for the small addition to the privacy section
add_task(async function testPrivacyInfoEnabled() {
  ok(SelectableProfileService.isEnabled, "service should be enabled");
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let profilesNote = doc.getElementById("preferences-privacy-profiles");

  ok(BrowserTestUtils.isVisible(profilesNote), "The profiles note is visible");

  // Verify that clicking the button shows the manage screen in a subdialog.
  let promiseSubDialogLoaded = promiseLoadSubDialog("about:profilemanager");
  let profilesButton = doc.getElementById("dataCollectionViewProfiles");
  profilesButton.click();
  await promiseSubDialogLoaded;

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function testPrivacyInfoHiddenWhenDisabled() {
  // Adjust the mocks so that `SelectableProfileService.isEnabled` is false.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.profiles.enabled", false],
      ["browser.profiles.created", false],
      ["toolkit.profiles.storeID", ""],
    ],
  });
  gProfileService.currentProfile.storeID = null;
  await ProfilesDatastoreService.uninit();
  await ProfilesDatastoreService.init();
  await SelectableProfileService.uninit();
  await SelectableProfileService.init();

  ok(!SelectableProfileService.isEnabled, "service should not be enabled");

  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let profilesNote = gBrowser.contentDocument.getElementById(
    "preferences-privacy-profiles"
  );

  ok(!BrowserTestUtils.isVisible(profilesNote), "The profiles note is hidden");

  await SpecialPowers.popPrefEnv();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

// If the user disables data collection, then re-enables data collection in
// another profile in the profile group, verify that the new profile group ID
// is correctly set to the value passed in from the database.
add_task(async function testReactivateProfileGroupID() {
  if (!AppConstants.MOZ_TELEMETRY_REPORTING) {
    ok(true, "Skipping test because telemetry reporting is disabled");
    return;
  }

  await initGroupDatabase();

  await SpecialPowers.pushPrefEnv({
    set: [["datareporting.healthreport.uploadEnabled", true]],
  });

  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let checkbox = gBrowser.contentDocument.getElementById(
    "submitHealthReportBox"
  );
  ok(
    checkbox.checked,
    "initially the data reporting checkbox should be checked"
  );

  let checkboxUpdated = BrowserTestUtils.waitForMutationCondition(
    checkbox,
    { attributeFilter: ["checked"] },
    () => !checkbox.checked
  );

  checkbox.click();
  await checkboxUpdated;

  Assert.ok(
    !checkbox.checked,
    "checkbox should not be checked after waiting for update"
  );
  Assert.equal(
    Services.prefs.getBoolPref("datareporting.healthreport.uploadEnabled"),
    false,
    "upload should be disabled after unchecking checkbox"
  );

  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getStringPref("toolkit.telemetry.cachedProfileGroupID") ===
      lazy.TelemetryUtils.knownProfileGroupID,
    "after disabling data collection, the profile group ID pref should have the canary value"
  );

  let groupID = await lazy.ClientID.getProfileGroupID();
  Assert.equal(
    groupID,
    lazy.TelemetryUtils.knownProfileGroupID,
    "after disabling data collection, the ClientID profile group ID should have the canary value"
  );

  // Simulate an update request from another instance that re-enables data
  // reporting and sends over a new profile group ID.
  let NEW_GROUP_ID = "12345678-b0ba-cafe-face-decafbad0123";
  SelectableProfileService._getAllDBPrefs =
    SelectableProfileService.getAllDBPrefs;
  SelectableProfileService.getAllDBPrefs = () => [
    {
      name: "datareporting.healthreport.uploadEnabled",
      value: true,
      type: "boolean",
    },
    {
      name: "toolkit.telemetry.cachedProfileGroupID",
      value: NEW_GROUP_ID,
      type: "string",
    },
  ];
  await SelectableProfileService.loadSharedPrefsFromDatabase();

  groupID = await lazy.ClientID.getProfileGroupID();
  Assert.equal(
    groupID,
    NEW_GROUP_ID,
    "after re-enabling data collection, the ClientID profile group ID should have the remote value"
  );
  Assert.equal(
    Services.prefs.getStringPref("toolkit.telemetry.cachedProfileGroupID"),
    NEW_GROUP_ID,
    "after re-enabling data collection, the profile group ID pref should have the remote value"
  );
  SelectableProfileService.getAllDBPrefs =
    SelectableProfileService._getAllDBPrefs;
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
