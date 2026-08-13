/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
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

async function closeFxaPanel() {
  let fxaView = PanelMultiView.getViewNode(document, "PanelUI-fxa");
  let hidden = BrowserTestUtils.waitForEvent(document, "popuphidden", true);
  fxaView.closest("panel").hidePopup();
  await hidden;
}

// Stubs the state (signed out, at most one profile) that surfaces the
// "Create a New Profile" CTA, then opens the FxA menu and navigates into the
// create profile subview.
function stubCreateProfileState(sandbox) {
  sandbox.stub(SelectableProfileService, "isEnabled").get(() => true);
  sandbox.stub(SelectableProfileService, "initialized").get(() => true);
  sandbox.stub(SelectableProfileService, "getAllProfiles").resolves([]);
}

async function openCreateProfileSubview() {
  await openFxaPanel();
  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let createButton = container.querySelector(
    "#PanelUI-fxa-menu-create-profile-button"
  );
  let subview = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile"
  );
  let subviewShown = BrowserTestUtils.waitForEvent(subview, "ViewShown");
  EventUtils.synthesizeMouseAtCenter(createButton, {});
  await subviewShown;
}

add_task(async function test_fxa_menu_create_profile_cta_shown() {
  const sandbox = sinon.createSandbox();
  stubCreateProfileState(sandbox);

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let createButton = container.querySelector(
    "#PanelUI-fxa-menu-create-profile-button"
  );
  Assert.ok(
    createButton,
    "Create a new profile CTA should show when signed out with at most one profile"
  );
  Assert.ok(
    createButton.classList.contains("subviewbutton-nav"),
    "The CTA button should have a chevron"
  );
  Assert.ok(
    !container.querySelector(".profile-item"),
    "No profile list items should be shown in the CTA state"
  );

  let subview = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile"
  );
  let subviewShown = BrowserTestUtils.waitForEvent(subview, "ViewShown");
  EventUtils.synthesizeMouseAtCenter(createButton, {});
  await subviewShown;

  for (const id of [
    "PanelUI-fxa-menu-create-profile-illustration",
    "PanelUI-fxa-menu-create-profile-heading",
    "PanelUI-fxa-menu-create-profile-description",
    "PanelUI-fxa-menu-create-profile-confirm-button",
    "PanelUI-fxa-menu-create-profile-copy-button",
    "PanelUI-fxa-menu-create-profile-manage-button",
  ]) {
    Assert.ok(
      BrowserTestUtils.isVisible(PanelMultiView.getViewNode(document, id)),
      `${id} is visible in the create profile subview`
    );
  }

  let manageButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile-manage-button"
  );
  Assert.ok(
    manageButton.classList.contains("panel-subview-footer-button"),
    "The manage profiles button should be a footer button"
  );

  await closeFxaPanel();
  sandbox.restore();
});

add_task(
  async function test_fxa_menu_no_create_profile_cta_with_multiple_profiles() {
    const sandbox = sinon.createSandbox();
    let mockProfile = id => ({
      id,
      name: `Profile ${id}`,
      theme: { themeBg: "#ffffff", themeFg: "#000000" },
      getAvatarURL: async () => "",
    });
    sandbox.stub(SelectableProfileService, "isEnabled").get(() => true);
    sandbox.stub(SelectableProfileService, "initialized").get(() => true);
    sandbox
      .stub(SelectableProfileService, "getAllProfiles")
      .resolves([mockProfile(1), mockProfile(2)]);

    await openFxaPanel();

    let container = PanelMultiView.getViewNode(
      document,
      "PanelUI-fxa-menu-profile-buttons"
    );
    Assert.ok(
      !container.querySelector("#PanelUI-fxa-menu-create-profile-button"),
      "Create a new profile CTA should not show with multiple profiles"
    );
    Assert.ok(
      container.querySelector(".profile-item"),
      "Profile list items should be shown with multiple profiles"
    );

    await closeFxaPanel();
    sandbox.restore();
  }
);

add_task(async function test_fxa_menu_create_profile_actions() {
  const sandbox = sinon.createSandbox();
  stubCreateProfileState(sandbox);
  let createNewProfileStub = sandbox.stub(gProfiles, "createNewProfile");
  let copyProfileStub = sandbox.stub(gProfiles, "copyProfile");
  let manageProfilesStub = sandbox.stub(gProfiles, "manageProfiles");

  for (let { id, stub, name } of [
    {
      id: "PanelUI-fxa-menu-create-profile-copy-button",
      stub: copyProfileStub,
      name: "copyProfile",
    },
    {
      id: "PanelUI-fxa-menu-create-profile-manage-button",
      stub: manageProfilesStub,
      name: "manageProfiles",
    },
    {
      id: "PanelUI-fxa-menu-create-profile-confirm-button",
      stub: createNewProfileStub,
      name: "createNewProfile",
    },
  ]) {
    await openCreateProfileSubview();

    let button = PanelMultiView.getViewNode(document, id);
    let hidden = BrowserTestUtils.waitForEvent(document, "popuphidden", true);
    if (button.localName === "moz-button") {
      button.click();
    } else {
      EventUtils.synthesizeMouseAtCenter(button, {});
    }
    await TestUtils.waitForCondition(
      () => stub.called,
      `Clicking ${id} should call ${name}`
    );
    await hidden;
  }

  sandbox.restore();
});

add_task(async function test_fxa_menu_create_profile_learn_more() {
  const sandbox = sinon.createSandbox();
  stubCreateProfileState(sandbox);
  let openLinkStub = sandbox.stub(URILoadingHelper, "openTrustedLinkIn");

  await openCreateProfileSubview();

  let separator = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile-footer-separator"
  );
  let learnMoreButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile-learn-more-button"
  );
  let copyButton = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile-copy-button"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(learnMoreButton),
    "The learn more button should be visible"
  );
  // The learn more button sits between the footer separator and the copy button.
  Assert.strictEqual(
    separator.compareDocumentPosition(learnMoreButton),
    4,
    "The learn more button should follow the footer separator"
  );
  Assert.strictEqual(
    learnMoreButton.compareDocumentPosition(copyButton),
    4,
    "The copy profile button should follow the learn more button"
  );

  let hidden = BrowserTestUtils.waitForEvent(document, "popuphidden", true);
  EventUtils.synthesizeMouseAtCenter(learnMoreButton, {});
  await TestUtils.waitForCondition(
    () => openLinkStub.called,
    "Clicking the learn more button should open a link"
  );
  await hidden;

  Assert.equal(
    openLinkStub.firstCall.args[1],
    "https://support.mozilla.org/kb/profile-management",
    "Should open the profiles support article"
  );
  Assert.equal(
    openLinkStub.firstCall.args[2],
    "tab",
    "Should open the article in a new tab"
  );

  sandbox.restore();
});

add_task(async function test_fxa_menu_shows_up_to_three_profiles() {
  await SelectableProfileService.init();
  await SelectableProfileService.createNewProfile(true, null, "tests");
  await SelectableProfileService.createNewProfile(true, null, "tests");

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let profileButtons = container.querySelectorAll(".profile-item");

  Assert.equal(
    profileButtons.length,
    3,
    "Should show exactly 3 profile buttons"
  );
  Assert.ok(
    !container.querySelector("#PanelUI-fxa-menu-all-profiles-button"),
    "All profiles button should not be shown with 3 or fewer profiles"
  );

  await closeFxaPanel();
});

add_task(
  async function test_fxa_menu_all_profiles_button_with_more_than_three() {
    await SelectableProfileService.init();
    await SelectableProfileService.createNewProfile(true, null, "tests");

    await openFxaPanel();

    let container = PanelMultiView.getViewNode(
      document,
      "PanelUI-fxa-menu-profile-buttons"
    );

    Assert.equal(
      container.querySelectorAll(".profile-item").length,
      3,
      "Should show only 3 profile buttons when there are more than 3 profiles"
    );

    let allProfilesButton = container.querySelector(
      "#PanelUI-fxa-menu-all-profiles-button"
    );
    Assert.ok(
      allProfilesButton,
      "All profiles button should appear when there are more than 3 profiles"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(allProfilesButton),
      "All profiles button should be visible"
    );

    await closeFxaPanel();
  }
);

add_task(async function test_fxa_menu_all_profiles_panel_lists_all_profiles() {
  await SelectableProfileService.init();
  let profiles = await SelectableProfileService.getAllProfiles();

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let allProfilesButton = container.querySelector(
    "#PanelUI-fxa-menu-all-profiles-button"
  );
  Assert.ok(allProfilesButton, "All profiles button should exist");

  let allProfilesPanel = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-all-profiles"
  );
  let panelShown = BrowserTestUtils.waitForEvent(allProfilesPanel, "ViewShown");
  EventUtils.synthesizeMouseAtCenter(allProfilesButton, {});
  await panelShown;

  let profilesList = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-all-profiles-list"
  );
  let listedItems = profilesList.querySelectorAll(".profile-item");

  Assert.equal(
    listedItems.length,
    profiles.length,
    "All profiles panel should list every profile"
  );

  let currentProfileId = SelectableProfileService.currentProfile?.id;
  for (let profile of profiles) {
    let item = profilesList.querySelector(`[profileid="${profile.id}"]`);
    Assert.ok(
      item,
      `Profile "${profile.name}" should appear in the all profiles panel`
    );
    // The current profile renders its name in a nested label element rather
    // than the "label" attribute, alongside the "current in use" sub-label.
    let itemLabel =
      profile.id === currentProfileId
        ? item
            .querySelector(
              ".profile-item-labels > label:not(.profile-item-current-label)"
            )
            ?.getAttribute("value")
        : item.getAttribute("label");
    Assert.equal(
      itemLabel,
      profile.name,
      `Profile "${profile.name}" label should match`
    );
  }

  await closeFxaPanel();
});

add_task(async function test_fxa_menu_active_profile_listed_first() {
  await SelectableProfileService.init();
  let currentProfile = SelectableProfileService.currentProfile;

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let profileButtons = Array.from(container.querySelectorAll(".profile-item"));

  Assert.ok(!!profileButtons.length, "Should have at least one profile button");
  Assert.equal(
    profileButtons[0].getAttribute("profileid"),
    currentProfile.id,
    "Active profile should be listed first"
  );

  await closeFxaPanel();
});

add_task(async function test_fxa_menu_current_profile_has_chevron() {
  await SelectableProfileService.init();
  let currentProfile = SelectableProfileService.currentProfile;

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let currentButton = container.querySelector(
    `.profile-item[profileid="${currentProfile.id}"]`
  );
  Assert.ok(currentButton, "Current profile button should exist");
  Assert.ok(
    currentButton.classList.contains("subviewbutton-nav"),
    "Current profile button should have the nav chevron"
  );

  let otherButtons = Array.from(
    container.querySelectorAll(".profile-item")
  ).filter(btn => btn !== currentButton);
  for (let btn of otherButtons) {
    Assert.ok(
      !btn.classList.contains("subviewbutton-nav"),
      `Non-current profile button ${btn.getAttribute("profileid")} should not have a nav chevron`
    );
  }

  await closeFxaPanel();
});

add_task(async function test_fxa_menu_current_profile_click_opens_subpanel() {
  await SelectableProfileService.init();
  let currentProfile = SelectableProfileService.currentProfile;

  SelectableProfileService.execProcess.resetHistory();

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let currentButton = container.querySelector(
    `.profile-item[profileid="${currentProfile.id}"]`
  );
  Assert.ok(
    currentButton,
    "The current profile button should exist in the FxA menu"
  );

  let profilesPanel = PanelMultiView.getViewNode(document, "PanelUI-profiles");
  let panelShown = BrowserTestUtils.waitForEvent(profilesPanel, "ViewShown");
  EventUtils.synthesizeMouseAtCenter(currentButton, {});
  await panelShown;

  let headerContent = PanelMultiView.getViewNode(
    document,
    "profiles-header-content"
  );
  Assert.equal(
    headerContent.textContent,
    currentProfile.name,
    "Profiles subpanel should display the current profile's name"
  );

  let manageProfilesButton = PanelMultiView.getViewNode(
    document,
    "profiles-manage-profiles-button"
  );
  await TestUtils.waitForCondition(
    () => profilesPanel.contains(manageProfilesButton),
    "Subview layout should complete"
  );

  Assert.equal(
    profilesPanel.querySelectorAll(".profiles-subview-item").length,
    0,
    "No profile list items should appear in the subview when opened from the FxA menu"
  );

  let copyProfileButton = PanelMultiView.getViewNode(
    document,
    "profiles-copy-profile-button"
  );
  let footerSeparator = PanelMultiView.getViewNode(
    document,
    "footer-separator"
  );
  Assert.ok(footerSeparator, "Footer separator should exist");
  Assert.ok(
    profilesPanel.contains(footerSeparator),
    "Footer separator should be in the subview"
  );
  Assert.strictEqual(
    copyProfileButton.compareDocumentPosition(footerSeparator),
    4,
    "Footer separator should follow the copy profile button"
  );
  Assert.strictEqual(
    footerSeparator.compareDocumentPosition(manageProfilesButton),
    4,
    "Manage profiles button should follow the footer separator"
  );

  Assert.ok(
    !SelectableProfileService.execProcess.called,
    "execProcess should not be called when clicking the current profile"
  );

  await closeFxaPanel();
});

add_task(async function test_fxa_menu_other_profile_click_launches_profile() {
  await SelectableProfileService.init();
  let profiles = await SelectableProfileService.getAllProfiles();
  let otherProfile = profiles.find(
    p => p.id !== SelectableProfileService.currentProfile.id
  );
  Assert.ok(otherProfile, "Should have at least one non-current profile");

  SelectableProfileService.execProcess.resetHistory();

  await openFxaPanel();

  let container = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-profile-buttons"
  );
  let profileButton = container.querySelector(
    `.profile-item[profileid="${otherProfile.id}"]`
  );
  Assert.ok(
    profileButton,
    "The non-current profile button should exist in the FxA menu"
  );

  EventUtils.synthesizeMouseAtCenter(profileButton, {});
  await TestUtils.waitForCondition(
    () => SelectableProfileService.execProcess.called,
    "execProcess should be called to launch the selected profile"
  );

  await closeFxaPanel();
});
