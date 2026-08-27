/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const VISIBILITY_PREF = "browser.toolbars.bookmarks.visibility";

describe("Smart Window bookmarks toolbar", () => {
  let win;

  beforeEach(() => {
    Services.fog.testResetFOG();
  });

  afterEach(async () => {
    // Pop prefs first so a closeWindow failure can't leak them to later tests.
    await SpecialPowers.popPrefEnv();
    if (win) {
      await BrowserTestUtils.closeWindow(win);
      win = null;
    }
  });

  it("shows the toolbar on the new tab and hides it elsewhere", async () => {
    await SpecialPowers.pushPrefEnv({ set: [[VISIBILITY_PREF, "newtab"]] });

    win = await openAIWindow();
    const toolbar = win.document.getElementById("PersonalToolbar");

    await BrowserTestUtils.waitForMutationCondition(
      toolbar,
      { attributes: true, attributeFilter: ["collapsed"] },
      () => !toolbar.collapsed
    );
    Assert.ok(
      !toolbar.collapsed,
      "Toolbar is shown on the Smart Window new tab"
    );

    // Navigating away from the new tab hides the toolbar again.
    BrowserTestUtils.startLoadingURIString(
      win.gBrowser.selectedBrowser,
      "https://example.com/"
    );
    await BrowserTestUtils.browserLoaded(
      win.gBrowser.selectedBrowser,
      false,
      "https://example.com/"
    );
    await BrowserTestUtils.waitForMutationCondition(
      toolbar,
      { attributes: true, attributeFilter: ["collapsed"] },
      () => toolbar.collapsed
    );
    Assert.ok(toolbar.collapsed, "Toolbar is hidden off the new tab");
  });

  it("does not show the toolbar on the firstrun page", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        [VISIBILITY_PREF, "newtab"],
        ["browser.smartwindow.firstrun.hasCompleted", false],
      ],
    });

    win = await openAIWindow({ waitForTabURL: FIRSTRUN_URL });
    const toolbar = win.document.getElementById("PersonalToolbar");

    // Toolbar visibility is applied asynchronously, so give it time to (wrongly)
    // un-collapse before asserting it stays hidden on firstrun.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 1000));

    Assert.ok(
      toolbar.collapsed,
      "Bookmarks toolbar should not show on the Smart Window firstrun page"
    );
  });

  it("records 'opened' when a bookmark is opened from the new tab", async () => {
    await SpecialPowers.pushPrefEnv({ set: [[VISIBILITY_PREF, "newtab"]] });

    const bookmark = await PlacesUtils.bookmarks.insert({
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: "Test Toolbar Bookmark",
      url: "https://example.com/",
    });

    try {
      win = await openAIWindow();
      const toolbar = win.document.getElementById("PersonalToolbar");
      await BrowserTestUtils.waitForMutationCondition(
        toolbar,
        { attributes: true, attributeFilter: ["collapsed"] },
        () => !toolbar.collapsed
      );

      const button = await TestUtils.waitForCondition(
        () =>
          win.document.querySelector(
            `#PlacesToolbarItems toolbarbutton[label="Test Toolbar Bookmark"]`
          ),
        "Bookmark button should appear on the toolbar"
      );

      EventUtils.synthesizeMouseAtCenter(button, {}, win);

      await TestUtils.waitForCondition(
        () => (Glean.smartWindow.bookmarkbar.opened.testGetValue() ?? 0) >= 1,
        "smart_window.bookmarkbar 'opened' should be recorded"
      );
      Assert.greaterOrEqual(
        Glean.smartWindow.bookmarkbar.opened.testGetValue() ?? 0,
        1,
        "'opened' is recorded when opening a toolbar bookmark from the new tab"
      );
    } finally {
      await PlacesUtils.bookmarks.remove(bookmark);
    }
  });

  it("does not record 'opened' when the setting is not 'newtab'", async () => {
    await SpecialPowers.pushPrefEnv({ set: [[VISIBILITY_PREF, "always"]] });

    const bookmark = await PlacesUtils.bookmarks.insert({
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: "Test Toolbar Bookmark",
      url: "https://example.com/",
    });

    try {
      win = await openAIWindow();
      const toolbar = win.document.getElementById("PersonalToolbar");
      await BrowserTestUtils.waitForMutationCondition(
        toolbar,
        { attributes: true, attributeFilter: ["collapsed"] },
        () => !toolbar.collapsed
      );

      const button = await TestUtils.waitForCondition(
        () =>
          win.document.querySelector(
            `#PlacesToolbarItems toolbarbutton[label="Test Toolbar Bookmark"]`
          ),
        "Bookmark button should appear on the toolbar"
      );

      // Opening the bookmark navigates the tab; awaiting the load guarantees
      // onCommand has run before we assert nothing was recorded.
      const loaded = BrowserTestUtils.browserLoaded(
        win.gBrowser.selectedBrowser,
        false,
        "https://example.com/"
      );
      EventUtils.synthesizeMouseAtCenter(button, {}, win);
      await loaded;

      Assert.equal(
        Glean.smartWindow.bookmarkbar.opened.testGetValue() ?? 0,
        0,
        "'opened' is not recorded when the toolbar is in 'always' mode"
      );
    } finally {
      await PlacesUtils.bookmarks.remove(bookmark);
    }
  });
});
