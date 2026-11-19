/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const NEW_PROFILE_NAME = "This is a new profile name";

const setup = async () => {
  await initGroupDatabase();
  let profile = SelectableProfileService.currentProfile;
  Assert.ok(profile, "Should have a profile now");

  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
  Services.telemetry.clearEvents();
  return profile;
};

add_task(async function test_edit_profile_delete() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    // `mochitest-browser` suite `add_task` does not yet support
    // `properties.skip_if`.
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }
  await setup();
  is(
    null,
    Glean.profilesExisting.deleted.testGetValue(),
    "We have not recorded any Glean data yet"
  );
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      let deletePageLoaded = BrowserTestUtils.browserLoaded(
        browser,
        false,
        "about:deleteprofile"
      );

      await SpecialPowers.spawn(browser, [], async () => {
        let editProfileCard =
          content.document.querySelector("edit-profile-card").wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => editProfileCard.initialized,
          "Waiting for edit-profile-card to be initialized"
        );

        await editProfileCard.updateComplete;

        let nameInput = editProfileCard.nameInput;
        nameInput.value = "";
        nameInput.dispatchEvent(new content.Event("input"));

        let deleteButton = editProfileCard.deleteButton;
        deleteButton.scrollIntoView();
        EventUtils.synthesizeMouseAtCenter(deleteButton, {}, content);
      });

      await deletePageLoaded;

      await assertGlean("profiles", "existing", "deleted");
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_edit_profile_name() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    // `mochitest-browser` suite `add_task` does not yet support
    // `properties.skip_if`.
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }
  let profile = await setup();
  is(
    null,
    Glean.profilesExisting.name.testGetValue(),
    "We have not recorded any Glean data yet"
  );
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(
        browser,
        [NEW_PROFILE_NAME],
        async newProfileName => {
          let editProfileCard =
            content.document.querySelector("edit-profile-card").wrappedJSObject;

          await ContentTaskUtils.waitForCondition(
            () => editProfileCard.initialized,
            "Waiting for edit-profile-card to be initialized"
          );

          await editProfileCard.getUpdateComplete();

          let nameInput = editProfileCard.nameInput;
          nameInput.value = newProfileName;
          nameInput.dispatchEvent(new content.Event("input"));

          await ContentTaskUtils.waitForCondition(() => {
            let savedMessage =
              editProfileCard.shadowRoot.querySelector("#saved-message");
            return ContentTaskUtils.isVisible(savedMessage);
          });
        }
      );

      let curProfile = await SelectableProfileService.getProfile(profile.id);

      Assert.equal(
        curProfile.name,
        NEW_PROFILE_NAME,
        "Profile name was updated in database"
      );

      Assert.equal(
        SelectableProfileService.currentProfile.name,
        NEW_PROFILE_NAME,
        "Current profile name was updated"
      );

      await assertGlean("profiles", "existing", "name");
    }
  );
});

add_task(async function test_edit_profile_avatar() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    // `mochitest-browser` suite `add_task` does not yet support
    // `properties.skip_if`.
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }
  let profile = await setup();

  // Before we load the edit page, set the profile's avatar to something other
  // than the 0th item.
  await profile.setAvatar("flower");
  let expectedAvatar = "lightbulb";

  is(
    null,
    Glean.profilesExisting.avatar.testGetValue(),
    "We have not recorded any Glean data yet"
  );

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(browser, [expectedAvatar], async expected => {
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
          () => ContentTaskUtils.isVisible(avatarSelector.dialog),
          "Waiting for avatar selector to become visible"
        );

        EventUtils.synthesizeMouseAtCenter(
          avatarSelector.iconTabButton,
          {},
          content
        );
        await avatarSelector.updateComplete;

        let avatars = avatarSelector.avatars;
        let newAvatar = Array.from(avatars).find(
          avatar => avatar.value === expected
        );
        Assert.ok(
          !newAvatar.checked,
          "The new avatar should not initially be selected"
        );
        EventUtils.synthesizeMouseAtCenter(newAvatar, {}, content);

        await ContentTaskUtils.waitForCondition(
          () => newAvatar.checked,
          "Waiting for new avatar to be selected"
        );

        // Sometimes the async message takes a bit longer to arrive.
        await new Promise(resolve => content.setTimeout(resolve, 100));
      });

      let curProfile = await SelectableProfileService.getProfile(profile.id);

      Assert.equal(
        curProfile.avatar,
        expectedAvatar,
        "Profile avatar was updated in database"
      );

      Assert.equal(
        SelectableProfileService.currentProfile.avatar,
        expectedAvatar,
        "Current profile avatar was updated"
      );

      await assertGlean("profiles", "existing", "avatar", expectedAvatar);
    }
  );
});

add_task(async function test_edit_profile_explore_more_themes() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    // `mochitest-browser` suite `add_task` does not yet support
    // `properties.skip_if`.
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }
  await setup();
  is(
    null,
    Glean.profilesExisting.learnMore.testGetValue(),
    "We have not recorded any Glean data yet"
  );

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

        // To simplify the test, deactivate the link before clicking.
        editProfileCard.moreThemesLink.href = "#";
        editProfileCard.moreThemesLink.target = "";
        editProfileCard.moreThemesLink.scrollIntoView();
        EventUtils.synthesizeMouseAtCenter(
          editProfileCard.moreThemesLink,
          {},
          content
        );

        // Wait a turn for the event to propagate.
        await new Promise(resolve => content.setTimeout(resolve, 0));
      });

      await assertGlean("profiles", "existing", "learn_more");
    }
  );
});

add_task(async function test_edit_profile_displayed_closed_telemetry() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    // `mochitest-browser` suite `add_task` does not yet support
    // `properties.skip_if`.
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }
  await setup();
  is(
    null,
    Glean.profilesExisting.displayed.testGetValue(),
    "We have not recorded any Glean data yet"
  );
  is(
    null,
    Glean.profilesExisting.closed.testGetValue(),
    "We have not recorded any Glean data yet"
  );

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      // Once the page has loaded, the displayed event should be available.
      await assertGlean("profiles", "existing", "displayed");

      Services.fog.testResetFOG();
      Services.telemetry.clearEvents();

      await SpecialPowers.spawn(browser, [], async () => {
        let editProfileCard =
          content.document.querySelector("edit-profile-card").wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => editProfileCard.initialized,
          "Waiting for edit-profile-card to be initialized"
        );

        await editProfileCard.updateComplete;

        // Click the done editing button to trigger closed event.
        editProfileCard.doneButton.scrollIntoView();
        EventUtils.synthesizeMouseAtCenter(
          editProfileCard.doneButton,
          {},
          content
        );
      });

      await assertGlean("profiles", "existing", "closed");
    }
  );
});

add_task(async function test_avatar_picker_arrow_key_support() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    // `mochitest-browser` suite `add_task` does not yet support
    // `properties.skip_if`.
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await initGroupDatabase();
  let profile = SelectableProfileService.currentProfile;
  Assert.ok(profile, "Should have a profile now");

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const EventUtils = ContentTaskUtils.getEventUtils(content);

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
          () => ContentTaskUtils.isVisible(avatarSelector.dialog),
          "Waiting for avatar selector to become visible"
        );

        EventUtils.synthesizeMouseAtCenter(
          avatarSelector.iconTabButton,
          {},
          content
        );
        await avatarSelector.updateComplete;

        let avatars = avatarSelector.avatars;

        // Select and focus the first avatar to get started.
        EventUtils.synthesizeMouseAtCenter(avatars[0], {}, content);
        avatars[0].focus();
        await ContentTaskUtils.waitForCondition(
          () => avatars[0].checked,
          "Waiting for avatar to be selected"
        );
        let selectedAvatar = avatarSelector.shadowRoot.querySelector(
          "#avatars > moz-visual-picker-item[checked]"
        );
        Assert.equal(
          avatars[0].value,
          selectedAvatar.value,
          avatars[0].value + " avatar was selected"
        );
        Assert.equal(
          avatarSelector.shadowRoot.activeElement.value,
          selectedAvatar.value,
          "The selected avatar has focus"
        );

        // Simulate a down arrow key and the focus should move, making the
        // next element focused, but not selected.
        let nextAvatar = selectedAvatar.nextElementSibling;
        EventUtils.synthesizeKey("ArrowDown", {}, content);
        Assert.equal(
          avatarSelector.shadowRoot.activeElement.value,
          nextAvatar.value,
          "The next avatar has focus"
        );
        Assert.ok(!nextAvatar.checked, "The next avatar is not selected");

        // Now, use the up arrow key to move focus back.
        EventUtils.synthesizeKey("ArrowUp", {}, content);
        Assert.equal(
          avatarSelector.shadowRoot.activeElement.value,
          selectedAvatar.value,
          "The selected avatar has focus"
        );

        // Same thing, this time using the right and left arrows:

        EventUtils.synthesizeKey("ArrowRight", {}, content);
        Assert.equal(
          avatarSelector.shadowRoot.activeElement.value,
          nextAvatar.value,
          "The next avatar has focus"
        );
        Assert.ok(!nextAvatar.checked, "The next avatar is not selected");

        EventUtils.synthesizeKey("ArrowLeft", {}, content);
        Assert.equal(
          avatarSelector.shadowRoot.activeElement.value,
          selectedAvatar.value,
          "The selected avatar has focus"
        );
      });
    }
  );
});

add_task(async function test_edit_link_keyboard_accessibility() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const EventUtils = ContentTaskUtils.getEventUtils(content);

        let editProfileCard =
          content.document.querySelector("edit-profile-card").wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => editProfileCard.initialized,
          "Waiting for edit-profile-card to be initialized"
        );
        await editProfileCard.updateComplete;

        let editButton = editProfileCard.avatarSelectorButton;

        Assert.ok(editButton, "Edit button should exist");

        editButton.focus();
        Assert.equal(
          editProfileCard.shadowRoot.activeElement,
          editButton,
          "Edit button should be focusable"
        );

        let avatarSelector = editProfileCard.avatarSelector;
        Assert.ok(
          ContentTaskUtils.isHidden(avatarSelector.dialog),
          "Avatar selector should start hidden"
        );

        EventUtils.synthesizeKey("KEY_Enter", {}, content);
        Assert.ok(
          ContentTaskUtils.isVisible(avatarSelector.dialog),
          "Avatar selector should be visible after Enter key"
        );

        EventUtils.synthesizeKey("KEY_Escape", {}, content);
        Assert.ok(
          ContentTaskUtils.isHidden(avatarSelector.dialog),
          "Avatar selector should be hidden again"
        );
        Assert.equal(
          editProfileCard.shadowRoot.activeElement,
          editButton,
          "Focus should return to the edit button"
        );

        EventUtils.synthesizeKey(" ", {}, content);
        Assert.ok(
          ContentTaskUtils.isVisible(avatarSelector.dialog),
          "Avatar selector should be visible after Space key"
        );
      });
    }
  );
});

add_task(async function test_avatar_selector_closes_on_click_outside() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const EventUtils = ContentTaskUtils.getEventUtils(content);

        let editProfileCard =
          content.document.querySelector("edit-profile-card").wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => editProfileCard.initialized,
          "Waiting for edit-profile-card to be initialized"
        );
        await editProfileCard.updateComplete;

        let avatarSelector = editProfileCard.avatarSelector;

        EventUtils.synthesizeMouseAtCenter(
          editProfileCard.avatarSelectorButton,
          {},
          content
        );
        Assert.ok(
          ContentTaskUtils.isVisible(avatarSelector.dialog),
          "Avatar selector should be visible"
        );

        EventUtils.synthesizeMouse(
          content.document.documentElement,
          2,
          2,
          {},
          content
        );
        Assert.ok(
          ContentTaskUtils.isHidden(avatarSelector.dialog),
          "Avatar selector should be hidden after clicking outside of it"
        );
      });
    }
  );
});

add_task(async function test_avatar_selector_contains_focus() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:editprofile",
    },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const EventUtils = ContentTaskUtils.getEventUtils(content);

        let editProfileCard =
          content.document.querySelector("edit-profile-card").wrappedJSObject;

        await ContentTaskUtils.waitForCondition(
          () => editProfileCard.initialized,
          "Waiting for edit-profile-card to be initialized"
        );
        await editProfileCard.updateComplete;

        let avatarSelector = editProfileCard.avatarSelector;

        const getDeepActiveElement = () => {
          let element = content.document.activeElement;
          while (element?.shadowRoot?.activeElement) {
            element = element.shadowRoot.activeElement;
          }
          return element;
        };

        const isInDialog = element => {
          while (element) {
            if (avatarSelector.dialog.contains(element)) {
              return true;
            }
            element = element.getRootNode().host;
          }
          return false;
        };

        EventUtils.synthesizeMouseAtCenter(
          editProfileCard.avatarSelectorButton,
          {},
          content
        );
        Assert.ok(
          ContentTaskUtils.isVisible(avatarSelector.dialog),
          "Avatar selector should be visible"
        );
        let initialFocus = getDeepActiveElement();
        Assert.ok(
          isInDialog(initialFocus),
          "Focus should move into the avatar selector when it opens"
        );

        // Tab until focus leaves the page or wraps back to where it started.
        // Focus must never land on the page behind the dialog.
        let focused;
        do {
          EventUtils.synthesizeKey("KEY_Tab", {}, content);
          focused = content.document.hasFocus() ? getDeepActiveElement() : null;
          if (focused) {
            Assert.ok(
              isInDialog(focused),
              "Focus should stay inside the avatar selector"
            );
          }
        } while (focused && focused !== initialFocus);

        editProfileCard.nameInput.focus();
        Assert.notEqual(
          editProfileCard.shadowRoot.activeElement,
          editProfileCard.nameInput,
          "Content behind the avatar selector should not be focusable"
        );
      });
    }
  );
});
