/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { CustomizableUITestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/CustomizableUITestUtils.sys.mjs"
);

add_setup(async () => {
  await initGroupDatabase();
  Assert.ok(
    SelectableProfileService.currentProfile,
    "Should have a profile now"
  );

  CustomizableUI.addWidgetToArea(
    "fxa-toolbar-menu-button",
    CustomizableUI.AREA_TABSTRIP
  );

  sinon.stub(SelectableProfileService, "execProcess");

  registerCleanupFunction(() => {
    sinon.restore();
    CustomizableUI.addWidgetToArea(
      "fxa-toolbar-menu-button",
      CustomizableUI.AREA_NAVBAR
    );
  });
});

// The All Profiles view only appears with more than three profiles.
const ALL_PROFILES_VIEW_MINIMUM = 4;

async function waitForProfileCountToSettle() {
  let expected = await SelectableProfileService.getProfileCount();
  await TestUtils.waitForCondition(
    () => SelectableProfileService.getCachedProfileCount() === expected,
    "The cached profile count should catch up"
  );
  return expected;
}

async function ensureEnoughProfilesForAllView() {
  let existing = await SelectableProfileService.getProfileCount();
  for (let i = existing; i < ALL_PROFILES_VIEW_MINIMUM; i++) {
    await SelectableProfileService.createNewProfile(true, null, "tests");
  }
  await waitForProfileCountToSettle();
}

async function openFxaPanel() {
  let fxaButton = document.getElementById("fxa-toolbar-menu-button");
  fxaButton.click();
  let fxaView = PanelMultiView.getViewNode(document, "PanelUI-fxa");
  await BrowserTestUtils.waitForEvent(fxaView, "ViewShown");
  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  await TestUtils.waitForCondition(
    () => !container.hidden,
    "Profile buttons container should become visible after panel population"
  );
}

async function closeFxaPanelIfOpen() {
  let panel = PanelMultiView.getViewNode(document, "PanelUI-fxa")?.closest(
    "panel"
  );
  if (panel && panel.state !== "closed") {
    let fxaView = PanelMultiView.getViewNode(document, "PanelUI-fxa");
    let hidden = BrowserTestUtils.waitForEvent(document, "popuphidden", true);
    fxaView.closest("panel").hidePopup();
    await hidden;
  }
}

async function closeAppMenuIfOpen() {
  if (PanelUI.panel.state !== "closed") {
    let hidden = BrowserTestUtils.waitForEvent(PanelUI.panel, "popuphidden");
    PanelUI.hide();
    await hidden;
  }
}

function stubCreateProfileState(sandbox) {
  sandbox.stub(SelectableProfileService, "isEnabled").get(() => true);
  sandbox.stub(SelectableProfileService, "initialized").get(() => true);
  sandbox.stub(SelectableProfileService, "getAllProfiles").resolves([]);
}

async function openCreateProfileSubview() {
  await openFxaPanel();
  let createButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  ).querySelector("#PanelUI-fxa-menu-create-profile-button");
  let subview = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile"
  );
  let subviewShown = BrowserTestUtils.waitForEvent(subview, "ViewShown");
  EventUtils.synthesizeMouseAtCenter(createButton, {});
  await subviewShown;
}

// Submenu events carry profile_count; events fired from the avatar menu
// only carry the extras shared by the fxa_avatar_menu category.
const COUNT_EVENT_TYPES = new Set([
  "copyPrimaryProfile",
  "createNewProfileCtaButton",
  "createNewProfileCtaLabel",
  "editPrimaryProfile",
  "launchSecondaryProfileAllProfiles",
  "manageAllProfiles",
  "manageProfiles",
  "viewAllProfiles",
  "whatAreProfiles",
]);

/**
 * Waits for a single event to be recorded on the given fxaAvatarMenu metric
 * and asserts the extra keys shared by every profiles event are present.
 *
 * @param {string} name - camelCase Glean metric name
 * @param {number} [profileCount] - expected profile_count, if known
 * @returns {Promise<object>} the recorded event's extra keys
 */
async function assertRecorded(name, profileCount) {
  await TestUtils.waitForCondition(
    () => !!Glean.fxaAvatarMenu[name].testGetValue()?.length,
    `fxa_avatar_menu.${name} should be recorded`
  );
  let events = Glean.fxaAvatarMenu[name].testGetValue();
  Assert.equal(
    events.length,
    1,
    `Exactly one ${name} event should be recorded`
  );

  let extra = events[0].extra;
  Assert.ok("fxa_status" in extra, `${name} should record fxa_status`);
  Assert.ok("fxa_avatar" in extra, `${name} should record fxa_avatar`);

  if (COUNT_EVENT_TYPES.has(name)) {
    Assert.ok("profile_count" in extra, `${name} should record profile_count`);
    if (profileCount !== undefined) {
      Assert.equal(
        Number(extra.profile_count),
        profileCount,
        `${name} should record a profile_count of ${profileCount}`
      );
    }
  } else {
    Assert.ok(
      !("profile_count" in extra),
      `${name} should not record profile_count`
    );
  }
  return extra;
}

add_task(async function test_create_profile_submenu_telemetry() {
  const sandbox = sinon.createSandbox();
  stubCreateProfileState(sandbox);
  Services.fog.testResetFOG();

  await openCreateProfileSubview();
  await assertRecorded("createNewProfileSubmenu");

  await closeFxaPanelIfOpen();
  sandbox.restore();
});

add_task(async function test_create_profile_subview_action_telemetry() {
  for (let { id, metric } of [
    {
      id: "PanelUI-fxa-menu-create-profile-confirm-button",
      metric: "createNewProfileCtaButton",
    },
    {
      id: "PanelUI-fxa-menu-create-profile-learn-more-button",
      metric: "whatAreProfiles",
    },
    {
      id: "PanelUI-fxa-menu-create-profile-copy-button",
      metric: "copyPrimaryProfile",
    },
    {
      id: "PanelUI-fxa-menu-create-profile-manage-button",
      metric: "manageProfiles",
    },
  ]) {
    const sandbox = sinon.createSandbox();
    stubCreateProfileState(sandbox);
    sandbox.stub(SelectableProfileService, "getCachedProfileCount").returns(3);
    sandbox.stub(gProfiles, "createNewProfile");
    sandbox.stub(gProfiles, "copyProfile");
    sandbox.stub(gProfiles, "manageProfiles");
    sandbox.stub(URILoadingHelper, "openTrustedLinkIn");
    Services.fog.testResetFOG();

    await openCreateProfileSubview();

    let button = PanelMultiView.getViewNode(document, id);
    let hidden = BrowserTestUtils.waitForEvent(document, "popuphidden", true);
    if (button.localName === "moz-button") {
      button.click();
    } else {
      EventUtils.synthesizeMouseAtCenter(button, {});
    }
    await assertRecorded(metric, 3);
    await hidden;

    sandbox.restore();
  }
});

add_task(async function test_uninitialized_profile_count_is_zero() {
  const sandbox = sinon.createSandbox();
  try {
    stubCreateProfileState(sandbox);
    sandbox
      .stub(SelectableProfileService, "getCachedProfileCount")
      .returns(null);
    sandbox.stub(URILoadingHelper, "openTrustedLinkIn");
    Services.fog.testResetFOG();

    await openCreateProfileSubview();

    PanelMultiView.getViewNode(
      document,
      "PanelUI-fxa-menu-create-profile-learn-more-button"
    ).doCommand();

    await assertRecorded("whatAreProfiles", 0);
  } finally {
    sandbox.restore();
    await closeFxaPanelIfOpen();
  }
});

add_task(async function test_manage_primary_profile_telemetry() {
  await SelectableProfileService.init();
  await SelectableProfileService.createNewProfile(true, null, "tests");
  let currentProfile = SelectableProfileService.currentProfile;
  let profileCount = await waitForProfileCountToSettle();

  Services.fog.testResetFOG();
  await openFxaPanel();

  let currentButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  ).querySelector(`.profile-item[profileid="${currentProfile.id}"]`);
  let profilesPanel = PanelMultiView.getViewNode(document, "PanelUI-profiles");
  let panelShown = BrowserTestUtils.waitForEvent(profilesPanel, "ViewShown");
  currentButton.click();
  await panelShown;

  await assertRecorded("managePrimaryProfile", profileCount);

  await closeFxaPanelIfOpen();
});

add_task(async function test_profile_subview_action_telemetry() {
  await SelectableProfileService.init();
  let currentProfile = SelectableProfileService.currentProfile;

  for (let { id, metric } of [
    { id: "profiles-edit-this-profile-button", metric: "editPrimaryProfile" },
    {
      id: "profiles-create-profile-button",
      metric: "createNewProfileCtaLabel",
    },
    { id: "profiles-copy-profile-button", metric: "copyPrimaryProfile" },
    { id: "profiles-manage-profiles-button", metric: "manageProfiles" },
  ]) {
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(gProfiles, "createNewProfile");
      sandbox.stub(gProfiles, "copyProfile");
      sandbox.stub(gProfiles, "manageProfiles");
      sandbox.stub(URILoadingHelper, "openTrustedLinkIn");
      Services.fog.testResetFOG();

      let profileCount = await waitForProfileCountToSettle();

      await openFxaPanel();

      let currentButton = PanelMultiView.getViewNode(
        document,
        "PanelUI-fxa-menu-profile-buttons"
      ).querySelector(`.profile-item[profileid="${currentProfile.id}"]`);
      let profilesPanel = PanelMultiView.getViewNode(
        document,
        "PanelUI-profiles"
      );
      let panelShown = BrowserTestUtils.waitForEvent(
        profilesPanel,
        "ViewShown"
      );
      EventUtils.synthesizeMouseAtCenter(currentButton, {});
      await panelShown;

      await TestUtils.waitForCondition(() => {
        let node = PanelMultiView.getViewNode(document, id);
        return (
          node &&
          profilesPanel.contains(node) &&
          BrowserTestUtils.isVisible(node)
        );
      }, `${id} should be visible in the profiles subview`);

      // The manage profiles button is appended last, so once it is in place
      // the subview layout is complete.
      await TestUtils.waitForCondition(() => {
        let last = PanelMultiView.getViewNode(
          document,
          "profiles-manage-profiles-button"
        );
        return last && profilesPanel.contains(last);
      }, "The profiles subview layout should be complete");

      PanelMultiView.getViewNode(document, id).doCommand();

      await assertRecorded(metric, profileCount);
    } finally {
      sandbox.restore();
      await closeFxaPanelIfOpen();
    }
  }
});

add_task(async function test_launch_secondary_profile_telemetry() {
  await SelectableProfileService.init();
  let profiles = await SelectableProfileService.getAllProfiles();
  let otherProfile = profiles.find(
    p => p.id !== SelectableProfileService.currentProfile.id
  );
  Assert.ok(otherProfile, "Should have at least one non-selected profile");
  let profileCount = await waitForProfileCountToSettle();

  Services.fog.testResetFOG();
  await openFxaPanel();

  let profileButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  ).querySelector(`.profile-item[profileid="${otherProfile.id}"]`);
  profileButton.click();

  await assertRecorded("launchSecondaryProfile", profileCount);
  Assert.ok(
    !Glean.fxaAvatarMenu.launchSecondaryProfileAllProfiles.testGetValue(),
    "The all profiles variant should not be recorded from the avatar menu list"
  );

  await closeFxaPanelIfOpen();
});

add_task(async function test_all_profiles_panel_telemetry() {
  await SelectableProfileService.init();
  await ensureEnoughProfilesForAllView();

  const sandbox = sinon.createSandbox();
  sandbox.stub(gProfiles, "manageProfiles");
  Services.fog.testResetFOG();

  await openFxaPanel();

  let allProfilesButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  ).querySelector("#PanelUI-fxa-menu-all-profiles-button");
  Assert.ok(allProfilesButton, "All profiles button should exist");

  let allProfilesPanel = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-all-profiles"
  );
  let panelShown = BrowserTestUtils.waitForEvent(allProfilesPanel, "ViewShown");
  allProfilesButton.doCommand();
  await panelShown;

  let extra = await assertRecorded("viewAllProfiles");
  Assert.greater(
    Number(extra.profile_count),
    3,
    "viewAllProfiles should record the profile count that surfaced the panel"
  );

  PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-all-profiles-manage-button"
  ).doCommand();
  await assertRecorded("manageAllProfiles");

  sandbox.restore();
  await closeFxaPanelIfOpen();
});

add_task(async function test_launch_secondary_profile_all_profiles_telemetry() {
  await SelectableProfileService.init();
  let profiles = await SelectableProfileService.getAllProfiles();
  let otherProfile = profiles.find(
    p => p.id !== SelectableProfileService.currentProfile.id
  );
  let profileCount = await waitForProfileCountToSettle();
  Assert.greater(profileCount, 3, "Should have more than three profiles");

  Services.fog.testResetFOG();
  await openFxaPanel();

  let allProfilesButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  ).querySelector("#PanelUI-fxa-menu-all-profiles-button");
  let allProfilesPanel = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-all-profiles"
  );
  let panelShown = BrowserTestUtils.waitForEvent(allProfilesPanel, "ViewShown");
  allProfilesButton.click();
  await panelShown;

  let listItem = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-all-profiles-list"
  ).querySelector(`.profile-item[profileid="${otherProfile.id}"]`);
  Assert.ok(listItem, "The other profile should be listed");
  listItem.click();

  await assertRecorded("launchSecondaryProfileAllProfiles");
  Assert.ok(
    !Glean.fxaAvatarMenu.launchSecondaryProfile.testGetValue(),
    "The avatar menu variant should not be recorded from the all profiles list"
  );

  await closeFxaPanelIfOpen();
});

add_task(async function test_all_profiles_create_button_telemetry() {
  await SelectableProfileService.init();
  await ensureEnoughProfilesForAllView();

  const sandbox = sinon.createSandbox();
  try {
    sandbox.stub(gProfiles, "createNewProfile");
    Services.fog.testResetFOG();

    await openFxaPanel();

    let allProfilesPanel = PanelMultiView.getViewNode(
      document,
      "PanelUI-fxa-menu-all-profiles"
    );
    let panelShown = BrowserTestUtils.waitForEvent(
      allProfilesPanel,
      "ViewShown"
    );
    PanelMultiView.getViewNode(document, "PanelUI-fxa-menu-profile-buttons")
      .querySelector("#PanelUI-fxa-menu-all-profiles-button")
      .doCommand();
    await panelShown;

    PanelMultiView.getViewNode(
      document,
      "PanelUI-fxa-menu-all-profiles-create-button"
    ).doCommand();

    // This footer row is a label in a subview list, not the primary CTA
    // button in the create profile subview.
    let extra = await assertRecorded("createNewProfileCtaLabel");
    Assert.greater(
      Number(extra.profile_count),
      3,
      "The all profiles footer is only reachable with more than three profiles"
    );
    Assert.ok(
      !Glean.fxaAvatarMenu.createNewProfileCtaButton.testGetValue(),
      "The all profiles footer should not record the CTA button event"
    );
  } finally {
    sandbox.restore();
    await closeFxaPanelIfOpen();
  }
});

/**
 * Tests that clicks from the app menu for fxa_avatar_menu only events are not recorded.
 */
add_task(
  async function test_no_app_menu_recording_for_avatar_menu_only_events() {
    const sandbox = sinon.createSandbox();
    try {
      stubCreateProfileState(sandbox);
      sandbox.stub(gProfiles, "createNewProfile");
      sandbox.stub(gProfiles, "copyProfile");
      sandbox.stub(gProfiles, "manageProfiles");
      sandbox.stub(URILoadingHelper, "openTrustedLinkIn");
      Services.fog.testResetFOG();

      let cuiTestUtils = new CustomizableUITestUtils(window);
      await cuiTestUtils.openMainMenu();

      // Try selecting the Create Profile button under the app menu.
      let createButton = PanelMultiView.getViewNode(
        document,
        "appMenu-create-profile-button"
      );
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isVisible(createButton),
        "The app menu create profile button should become visible"
      );
      let subview = PanelMultiView.getViewNode(
        document,
        "PanelUI-fxa-menu-create-profile"
      );
      let subviewShown = BrowserTestUtils.waitForEvent(subview, "ViewShown");
      createButton.doCommand();
      await subviewShown;

      // Try running profile subview actions and verifying metrics.
      for (let id of [
        "PanelUI-fxa-menu-create-profile-learn-more-button",
        "PanelUI-fxa-menu-create-profile-copy-button",
        "PanelUI-fxa-menu-create-profile-manage-button",
      ]) {
        PanelMultiView.getViewNode(document, id).doCommand();
      }

      for (let metric of [
        "createNewProfileSubmenu",
        "whatAreProfiles",
        "copyPrimaryProfile",
        "manageProfiles",
      ]) {
        Assert.ok(
          !Glean.fxaAvatarMenu[metric].testGetValue(),
          `fxa_avatar_menu.${metric} should not record from the app menu`
        );
        Assert.equal(
          Glean.fxaAppMenu[metric],
          undefined,
          `fxa_app_menu.${metric} should not be defined`
        );
      }
    } finally {
      sandbox.restore();
      await closeAppMenuIfOpen();
    }
  }
);
