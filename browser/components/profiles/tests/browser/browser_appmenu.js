/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_setup(async () => {
  await initGroupDatabase();
  let profile = SelectableProfileService.currentProfile;
  Assert.ok(profile, "Should have a profile now");

  // Mock the executable process so we don't launch a new process
  sinon.stub(SelectableProfileService, "execProcess");

  registerCleanupFunction(() => {
    sinon.restore();
  });
});

// Opens the subview, clicking either of the two app menu profiles buttons
// to open the subview.
async function promiseSubViewOpened() {
  let promiseViewShown = BrowserTestUtils.waitForEvent(
    PanelUI.panel,
    "ViewShown"
  );
  PanelUI.show();
  await promiseViewShown;

  let panel = PanelMultiView.getViewNode(document, "PanelUI-profiles");
  let button = document.getElementById("appMenu-profiles-button");
  // The profiles button is shown and configured asynchronously when the app
  // menu opens, so wait for it to become visible before clicking.
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(button),
    "The profiles app menu button should become visible"
  );
  EventUtils.synthesizeMouseAtCenter(button, {});
  return TestUtils.waitForCondition(() => BrowserTestUtils.isVisible(panel));
}

function getElements() {
  const editButton = PanelMultiView.getViewNode(
    document,
    "profiles-edit-this-profile-button"
  );
  const newProfileButton = PanelMultiView.getViewNode(
    document,
    "profiles-create-profile-button"
  );
  const copyProfileButton = PanelMultiView.getViewNode(
    document,
    "profiles-copy-profile-button"
  );
  const manageProfilesButton = PanelMultiView.getViewNode(
    document,
    "profiles-manage-profiles-button"
  );
  const subview = PanelMultiView.getViewNode(document, "PanelUI-profiles");
  const subviewBody = subview.querySelector(".panel-subview-body");

  return {
    editButton,
    newProfileButton,
    copyProfileButton,
    manageProfilesButton,
    subviewBody,
  };
}

add_task(async function test_appmenu_layout_no_profiles() {
  await SelectableProfileService.init();
  await promiseSubViewOpened();

  const subview = PanelMultiView.getViewNode(document, "PanelUI-profiles");

  await TestUtils.waitForCondition(
    () =>
      PanelMultiView.getViewNode(document, "profiles-edit-this-profile-button"),
    "The subview buttons should be created"
  );

  let {
    editButton,
    newProfileButton,
    copyProfileButton,
    manageProfilesButton,
    subviewBody,
  } = getElements();

  const profilesListStartSeparator = PanelMultiView.getViewNode(
    document,
    "profiles-subview-list-start-separator"
  );
  const footerSeparator = PanelMultiView.getViewNode(
    document,
    "footer-separator"
  );

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isVisible(newProfileButton));
  Assert.ok(BrowserTestUtils.isVisible(copyProfileButton));
  Assert.ok(BrowserTestUtils.isVisible(manageProfilesButton));
  Assert.strictEqual(
    subview.querySelectorAll(".profiles-subview-item").length,
    0,
    "No profile list items should appear for a single profile"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(editButton),
    4,
    "The edit button should follow the subview body"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(newProfileButton),
    4,
    "The new profile button should follow the subview body"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(copyProfileButton),
    4,
    "The copy profile button should follow the subview body"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(manageProfilesButton),
    4,
    "The manage profiles button should follow the subview body"
  );

  const profilesList = PanelMultiView.getViewNode(
    document,
    "profiles-subview-list"
  );

  Assert.ok(
    profilesListStartSeparator,
    "A separator before the profile list should exist"
  );
  Assert.strictEqual(
    copyProfileButton.compareDocumentPosition(profilesListStartSeparator),
    4,
    "The start separator should follow the copy profile button"
  );
  Assert.strictEqual(
    profilesListStartSeparator.compareDocumentPosition(manageProfilesButton),
    4,
    "The manage profiles button should follow the start separator"
  );
  Assert.ok(
    profilesList.hidden,
    "The empty profile list should be hidden for a single profile"
  );
  Assert.ok(
    footerSeparator.hidden,
    "The footer separator should be hidden when the profile list is empty"
  );

  await PanelUI.hide();
});

add_task(async function test_appmenu_layout_two_profiles() {
  await SelectableProfileService.init();

  await SelectableProfileService.createNewProfile(true, null, "tests");

  await promiseSubViewOpened();

  const subview = PanelMultiView.getViewNode(document, "PanelUI-profiles");

  await TestUtils.waitForCondition(
    () => !!subview.querySelectorAll(".profiles-subview-item").length,
    "Profile list items should appear in the subview"
  );

  let {
    editButton,
    newProfileButton,
    copyProfileButton,
    manageProfilesButton,
    subviewBody,
  } = getElements();

  const profileListItems = [
    ...subview.querySelectorAll(".profiles-subview-item"),
  ];
  const profilesListStartSeparator = PanelMultiView.getViewNode(
    document,
    "profiles-subview-list-start-separator"
  );
  const footerSeparator = PanelMultiView.getViewNode(
    document,
    "footer-separator"
  );

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isVisible(newProfileButton));
  Assert.ok(BrowserTestUtils.isVisible(copyProfileButton));
  Assert.ok(BrowserTestUtils.isVisible(manageProfilesButton));
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(editButton),
    4,
    "The edit button should follow the subview body"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(newProfileButton),
    4,
    "The new profile button should follow the subview body"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(copyProfileButton),
    4,
    "The copy profile button should follow the subview body"
  );
  Assert.strictEqual(
    subviewBody.compareDocumentPosition(manageProfilesButton),
    4,
    "The manage profiles button should follow the subview body"
  );

  Assert.ok(
    profilesListStartSeparator,
    "A separator before the profile list should exist"
  );
  Assert.strictEqual(
    copyProfileButton.compareDocumentPosition(profilesListStartSeparator),
    4,
    "The start separator should follow the copy profile button"
  );
  Assert.strictEqual(
    profilesListStartSeparator.compareDocumentPosition(profileListItems[0]),
    4,
    "Profile list items should follow the start separator"
  );
  Assert.ok(footerSeparator, "A separator after the profile list should exist");
  Assert.strictEqual(
    profileListItems[profileListItems.length - 1].compareDocumentPosition(
      footerSeparator
    ),
    4,
    "The footer separator should follow the last profile list item"
  );
  Assert.strictEqual(
    footerSeparator.compareDocumentPosition(manageProfilesButton),
    4,
    "The manage profiles button should follow the footer separator"
  );
  Assert.strictEqual(
    manageProfilesButton.compareDocumentPosition(newProfileButton),
    4,
    "The new profile button should follow the manage profiles button"
  );

  await PanelUI.hide();
});

add_task(async function test_appmenu_create_profile_button_no_profiles() {
  const sandbox = sinon.createSandbox();
  // No profiles: the service reports as not initialized, so getAllProfiles
  // isn't consulted and the profiles list is empty.
  sandbox.stub(SelectableProfileService, "isEnabled").get(() => true);
  sandbox.stub(SelectableProfileService, "initialized").get(() => false);

  let promiseViewShown = BrowserTestUtils.waitForEvent(
    PanelUI.panel,
    "ViewShown"
  );
  PanelUI.show();
  await promiseViewShown;

  let createButton = document.getElementById("appMenu-create-profile-button");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(createButton),
    "The create profile button should be visible when there are no profiles"
  );

  Assert.ok(
    document.getElementById("appMenu-profiles-button").hidden,
    "The profiles button should be hidden"
  );

  let createProfilePanel = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-create-profile"
  );
  let subviewShown = BrowserTestUtils.waitForEvent(
    createProfilePanel,
    "ViewShown"
  );
  EventUtils.synthesizeMouseAtCenter(createButton, {});
  await subviewShown;

  Assert.ok(
    BrowserTestUtils.isVisible(createProfilePanel),
    "Clicking the create profile button should open the create profile panel"
  );

  await PanelUI.hide();
  sandbox.restore();
});
