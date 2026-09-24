/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function setup() {
  await initGroupDatabase();
  let profile = SelectableProfileService.currentProfile;
  Assert.ok(profile, "Should have a profile now");
  return profile;
}

async function resetGlean() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
  Services.telemetry.clearEvents();
}

async function waitForThemePicker(browser, cardTagName) {
  await SpecialPowers.spawn(browser, [cardTagName], async tagName => {
    let card = content.document.querySelector(tagName).wrappedJSObject;

    await ContentTaskUtils.waitForCondition(
      () => card.initialized,
      `Waiting for ${tagName} to be initialized`
    );

    await card.updateComplete;

    let themePicker = card.shadowRoot.querySelector("theme-picker");
    await ContentTaskUtils.waitForCondition(
      () => themePicker?.themes?.length > 0,
      "theme-picker should be populated"
    );

    await themePicker.updateComplete;
  });
}

function assertShownEvent(event) {
  Assert.equal(event.extra.source, "profiles", "Source should be profiles");
  Assert.equal(event.extra.layout, "full", "Layout should be full");
}

add_task(async function test_editprofile_records_shown_once() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();
  await resetGlean();
  is(
    null,
    Glean.themePicker.shown.testGetValue(),
    "No shown event should be recorded before opening about:editprofile"
  );

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:blank",
    },
    async browser => {
      Assert.equal(
        gBrowser.selectedBrowser,
        browser,
        "The tab should be visible before the profile page loads"
      );
      const loaded = BrowserTestUtils.browserLoaded(
        browser,
        false,
        "about:editprofile"
      );
      BrowserTestUtils.startLoadingURIString(browser, "about:editprofile");
      await loaded;

      await waitForThemePicker(browser, "edit-profile-card");
      await Services.fog.testFlushAllChildren();

      const events = Glean.themePicker.shown.testGetValue();
      Assert.equal(events?.length, 1, "A shown event should be recorded once");
      assertShownEvent(events[0]);
    }
  );
});

add_task(async function test_newprofile_records_shown_once() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();
  await resetGlean();
  is(
    null,
    Glean.themePicker.shown.testGetValue(),
    "No shown event should be recorded before opening about:newprofile"
  );

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:newprofile",
    },
    async browser => {
      await waitForThemePicker(browser, "new-profile-card");

      await SpecialPowers.spawn(browser, [], async () => {
        let card =
          content.document.querySelector("new-profile-card").wrappedJSObject;
        // Avoid the empty-name beforeunload path when the tab closes.
        card.nameInput.value = "test";
      });
      await Services.fog.testFlushAllChildren();

      const events = Glean.themePicker.shown.testGetValue();
      Assert.equal(events?.length, 1, "A shown event should be recorded once");
      assertShownEvent(events[0]);
    }
  );
});

add_task(async function test_shown_deferred_until_tab_visible() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();
  await resetGlean();
  is(
    null,
    Glean.themePicker.shown.testGetValue(),
    "No shown event should be recorded before opening about:editprofile"
  );

  const selectedTab = gBrowser.selectedTab;
  const tab = BrowserTestUtils.addTab(gBrowser, "about:editprofile", {
    skipAnimation: true,
  });
  const browser = gBrowser.getBrowserForTab(tab);

  try {
    await BrowserTestUtils.browserLoaded(browser);
    Assert.equal(
      gBrowser.selectedTab,
      selectedTab,
      "The tab should stay hidden"
    );
    await waitForThemePicker(browser, "edit-profile-card");
    await Services.fog.testFlushAllChildren();
    is(
      null,
      Glean.themePicker.shown.testGetValue(),
      "No shown event should be recorded while the tab is hidden"
    );

    gBrowser.selectedTab = tab;
    await TestUtils.waitForCondition(async () => {
      await Services.fog.testFlushAllChildren();
      return !!Glean.themePicker.shown.testGetValue();
    }, "Waiting for the shown event after the tab became visible");

    const events = Glean.themePicker.shown.testGetValue();
    Assert.equal(events?.length, 1, "A shown event should be recorded once");
    assertShownEvent(events[0]);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_shown_rechecks_visibility_after_picker_wait() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();
  await resetGlean();

  const selectedTab = gBrowser.selectedTab;
  const tab = BrowserTestUtils.addTab(gBrowser, "about:editprofile", {
    skipAnimation: true,
  });
  const browser = gBrowser.getBrowserForTab(tab);

  try {
    await BrowserTestUtils.browserLoaded(browser);
    await waitForThemePicker(browser, "edit-profile-card");
    await Services.fog.testFlushAllChildren();
    is(
      null,
      Glean.themePicker.shown.testGetValue(),
      "No shown event should be recorded while the tab is hidden"
    );

    await SpecialPowers.spawn(browser, [], async () => {
      const card =
        content.document.querySelector("edit-profile-card").wrappedJSObject;
      const themePicker = card.themesPicker;
      let resolveUpdateComplete;
      const updateComplete = new content.Promise(resolve => {
        resolveUpdateComplete = resolve;
      });
      let resolveUpdateCompleteRequested;
      const updateCompleteRequested = new content.Promise(resolve => {
        resolveUpdateCompleteRequested = resolve;
      });

      themePicker.getUpdateComplete = () => {
        resolveUpdateCompleteRequested();
        return updateComplete;
      };

      const maybeRecordThemePickerShown =
        card.maybeRecordThemePickerShown.bind(card);
      card.maybeRecordThemePickerShown = function () {
        const result = maybeRecordThemePickerShown();
        this._testRecordingPromise ??= result;
        return result;
      };

      themePicker._testUpdateCompleteRequested = updateCompleteRequested;
      themePicker._testResolveUpdateComplete = resolveUpdateComplete;
    });

    gBrowser.selectedTab = tab;
    await SpecialPowers.spawn(browser, [], async () => {
      const card =
        content.document.querySelector("edit-profile-card").wrappedJSObject;
      await card.themesPicker._testUpdateCompleteRequested;
    });

    await Services.fog.testFlushAllChildren();
    is(
      null,
      Glean.themePicker.shown.testGetValue(),
      "No shown event should be recorded while the picker update is pending"
    );

    gBrowser.selectedTab = selectedTab;
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.hidden,
        "Waiting for the profile tab to be hidden"
      );

      const card =
        content.document.querySelector("edit-profile-card").wrappedJSObject;
      card.themesPicker._testResolveUpdateComplete(true);
      await card._testRecordingPromise;
    });

    await Services.fog.testFlushAllChildren();
    is(
      null,
      Glean.themePicker.shown.testGetValue(),
      "No shown event should be recorded after hiding during the picker wait"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_shown_recorded_per_document() {
  if (!AppConstants.MOZ_SELECTABLE_PROFILES) {
    ok(true, "Skipping because !AppConstants.MOZ_SELECTABLE_PROFILES");
    return;
  }

  await setup();
  await resetGlean();
  is(
    null,
    Glean.themePicker.shown.testGetValue(),
    "No shown event should be recorded before opening about:editprofile"
  );

  for (let count = 0; count < 2; count++) {
    await BrowserTestUtils.withNewTab(
      {
        gBrowser,
        url: "about:editprofile",
      },
      async browser => {
        await waitForThemePicker(browser, "edit-profile-card");
      }
    );
  }

  await Services.fog.testFlushAllChildren();
  const events = Glean.themePicker.shown.testGetValue();
  Assert.equal(events?.length, 2, "Each document should record a shown event");
  for (const event of events) {
    assertShownEvent(event);
  }
});
