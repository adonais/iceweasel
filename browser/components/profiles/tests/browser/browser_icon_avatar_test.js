/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const setup = async () => {
  await initGroupDatabase();
  let profile = SelectableProfileService.currentProfile;
  Assert.ok(profile, "Should have a profile now");

  return profile;
};

// When the icon picker is opened with an avatar already selected, tabbing into
// the picker should focus the selected item
add_task(async function test_avatar_selector_icon_focus() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }
  const profile = await setup();

  // Select an avatar that isn't the first icon in the picker so we can tell
  // "focus the selected item" apart from "focus the first item".
  let curProfile = await SelectableProfileService.getProfile(profile.id);
  await curProfile.setAvatar("star");

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        let editProfileCard =
          content.document.querySelector("edit-profile-card").wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => editProfileCard.initialized,
          "Waiting for edit-profile-card to be initialized"
        );
        await editProfileCard.updateComplete;

        EventUtils.synthesizeMouseAtCenter(
          editProfileCard.avatarSelectorButton,
          {},
          content
        );

        const avatarSelector = editProfileCard.avatarSelector;

        await ContentTaskUtils.waitForCondition(
          () => ContentTaskUtils.isVisible(avatarSelector),
          "Waiting for avatar selector to become visible"
        );
        await avatarSelector.updateComplete;

        // Icon view is the default, so the moz-visual-picker is rendered.
        const avatarPicker = avatarSelector.avatarPicker;
        await avatarPicker.updateComplete;

        Assert.equal(
          avatarPicker.value,
          "star",
          "Picker value should match the profile's selected avatar"
        );

        const items = [...avatarSelector.avatars];
        const selectedItem = items.find(item => item.value === "star");
        Assert.ok(selectedItem, "Selected avatar item should exist");
        Assert.notEqual(
          items[0],
          selectedItem,
          "Selected avatar should not be the first item in the picker"
        );
        Assert.ok(
          selectedItem.checked,
          "Selected avatar item should be checked"
        );

        // Only the selected item should be tabbable.
        const selectedIndex = items.indexOf(selectedItem);
        Assert.equal(
          selectedItem.itemTabIndex,
          0,
          "Selected avatar item should be the tabbable item"
        );
        Assert.equal(
          items[0].itemTabIndex,
          -1,
          "First avatar item should not be tabbable"
        );

        Assert.equal(
          avatarPicker.focusableIndex,
          selectedIndex,
          "Tabbing into the picker should target the selected avatar item"
        );
      });
    }
  );
});
