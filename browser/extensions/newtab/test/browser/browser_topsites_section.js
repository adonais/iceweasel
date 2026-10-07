"use strict";

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);

SearchTestUtils.init(this);

add_setup(async function () {
  // Set up the configuration so that Baidu is available as a search engine, so
  // the search shortcut works.
  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      identifier: "google",
      base: {
        name: "Google",
        aliases: ["google"],
        urls: {
          search: {
            base: "https://www.google.com/search",
            searchTermParamName: "q",
          },
        },
      },
    },
    {
      identifier: "baidu",
      base: {
        name: "百度",
        aliases: ["百度", "baidu"],
        urls: {
          search: {
            base: "https://www.baidu.com/baidu",
            searchTermParamName: "wd",
          },
        },
      },
    },
  ]);
});

// Check TopSites edit modal and overlay show up.
test_newtab({
  before: setTestTopSites,
  // it should be able to click the topsites add button to reveal the add top site modal and overlay.
  test: async function topsites_edit(testTopSite) {
    const tile = await content.waitForTopSite(testTopSite);

    tile.querySelector(".context-menu-button").click();

    const editBtn = await content.waitForPanelItem(
      tile,
      "newtab-menu-edit-topsites"
    );
    editBtn.click();

    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".topsite-form"),
      "Should find a visible topsite form"
    );

    let found = content.document.querySelector(".topsite-form");
    ok(found && !found.hidden, "Should find a visible topsite form");

    found = content.document.querySelector(".modalOverlayOuter");
    ok(found && !found.hidden, "Should find a visible overlay");
  },
});

// Test pin/unpin context menu options.
test_newtab({
  before: async args => {
    clearPinnedTopSites();
    return setDefaultTopSites(args);
  },
  // it should pin the website when we click the first option of the topsite context menu.
  test: async function topsites_pin_unpin(defaultTopSites) {
    let topsiteEl = await content.waitForTopSite(defaultTopSites[0]);
    topsiteEl.querySelector(".context-menu-button").click();

    const pinTopsiteBtn = await content.waitForPanelItem(
      topsiteEl,
      "newtab-menu-pin"
    );
    pinTopsiteBtn.click();

    // Need to wait for pin action.
    await ContentTaskUtils.waitForCondition(
      () => topsiteEl.querySelector(".icon-pin-small"),
      "No pinned icon found"
    );

    let pinnedIcon = topsiteEl.querySelectorAll(".icon-pin-small").length;
    is(pinnedIcon, 1, "should find 1 pinned topsite");

    // Unpin the topsite.
    topsiteEl = await content.waitForTopSite(defaultTopSites[0]);
    topsiteEl.querySelector(".context-menu-button").click();

    const unpinTopsiteBtn = await content.waitForPanelItem(
      topsiteEl,
      "newtab-menu-unpin"
    );
    unpinTopsiteBtn.click();

    // Need to wait for unpin action.
    await ContentTaskUtils.waitForCondition(
      () => !topsiteEl.querySelector(".icon-pin-small"),
      "Topsite should be unpinned"
    );
  },
});

// Regression (Bug 2051742): the tile's hover chrome is gated on :focus-visible
// rather than any :focus-within, so a pointer click that leaves focus on the
// "..." button does not leave the tile stuck showing it after the menu closes
// and the pointer moves away.
test_newtab({
  before: async args => {
    // :focus/:focus-within only activate when the window holds system focus.
    gBrowser.selectedBrowser.focus();
    await setDefaultTopSites(args);
  },
  test: async function topsites_menu_no_stuck_hover_after_mouse() {
    const tile = await content.waitForAnyTopSite();
    const menuButton = tile.querySelector(".context-menu-button");
    const panelList = tile.querySelector("panel-list");

    // panel-list's events are untrusted, so the listener has to opt into them.
    const panelEvent = (target, name) =>
      ContentTaskUtils.waitForEvent(target, name, false, null, true);

    let shown = panelEvent(panelList, "shown");
    await EventUtils.synthesizeMouseAtCenter(menuButton, {}, content.window);
    await shown;

    // Close with another mouse click on the button. The menu opens on mousedown
    // precisely so this closes it rather than reopening it.
    let hidden = panelEvent(panelList, "hidden");
    await EventUtils.synthesizeMouseAtCenter(menuButton, {}, content.window);
    await hidden;

    // Move the pointer off the tile without clicking.
    const logo = content.document.querySelector(".logo-and-wordmark");
    EventUtils.synthesizeMouse(
      logo,
      5,
      5,
      { type: "mousemove" },
      content.window
    );
    await ContentTaskUtils.waitForCondition(
      () => !tile.matches(":hover"),
      "Pointer moved off the tile"
    );

    // With the pointer gone the tile must return to rest, whether or not the
    // click left focus behind (platforms differ on that).
    is(
      content.getComputedStyle(menuButton).opacity,
      "0",
      "the menu button is hidden once the pointer leaves (not stuck visible via retained focus)"
    );
  },
});

// Regression (Bug 2051742): the same stuck-hover bug, reached the way it was
// originally reported, by pinning through the menu rather than by clicking the
// "..." button a second time. Choosing a menu item re-renders the tile and
// disposes of focus differently, so it needs covering separately. Real mouse
// events throughout: the bug depended on where a genuine click leaves focus,
// which a synthetic .click() does not reproduce.
test_newtab({
  before: async args => {
    clearPinnedTopSites();
    gBrowser.selectedBrowser.focus();
    await setDefaultTopSites(args);
  },
  test: async function topsites_menu_no_stuck_hover_after_pin_via_menu() {
    const tile = await content.waitForAnyTopSite();
    const menuButton = () => tile.querySelector(".context-menu-button");
    const panelList = () => tile.querySelector("panel-list");

    // panel-list's events are untrusted, so the listener has to opt into them.
    const panelEvent = (target, name) =>
      ContentTaskUtils.waitForEvent(target, name, false, null, true);

    let shown = panelEvent(panelList(), "shown");
    await EventUtils.synthesizeMouseAtCenter(menuButton(), {}, content.window);
    await shown;

    // Pin/Unpin is the first item in the menu.
    let hidden = panelEvent(panelList(), "hidden");
    await EventUtils.synthesizeMouseAtCenter(
      panelList().querySelector("panel-item"),
      {},
      content.window
    );
    await hidden;
    await ContentTaskUtils.waitForCondition(
      () => tile.querySelector(".icon-pin-small"),
      "The topsite is pinned"
    );

    // Move the pointer off the tile.
    const logo = content.document.querySelector(".logo-and-wordmark");
    EventUtils.synthesizeMouse(
      logo,
      5,
      5,
      { type: "mousemove" },
      content.window
    );
    await ContentTaskUtils.waitForCondition(
      () => !tile.matches(":hover"),
      "Pointer moved off the tile"
    );

    ok(!tile.classList.contains("active"), "the tile is no longer active");
    is(
      content.getComputedStyle(menuButton()).opacity,
      "0",
      "the tile is not stuck showing its menu button after pinning via the menu"
    );

    // Unpin again so later tests start from the default state.
    shown = panelEvent(panelList(), "shown");
    await EventUtils.synthesizeMouseAtCenter(menuButton(), {}, content.window);
    await shown;
    await EventUtils.synthesizeMouseAtCenter(
      panelList().querySelector("panel-item"),
      {},
      content.window
    );
    await ContentTaskUtils.waitForCondition(
      () => !tile.querySelector(".icon-pin-small"),
      "The topsite is unpinned again"
    );
  },
});

// Regression (Bug 2051742): the counterpart to the test above. Tabbing off the
// tile link onto its "..." menu button must keep the button revealed, so a
// keyboard user can see where focus is.
test_newtab({
  before: async args => {
    // :focus-visible only activates when the window holds system focus.
    gBrowser.selectedBrowser.focus();
    await setDefaultTopSites(args);
  },
  test: async function topsites_menu_visible_on_keyboard_focus() {
    const tile = await content.waitForAnyTopSite();
    const link = tile.querySelector("a.top-site-button");
    const menuButton = tile.querySelector(".context-menu-button");

    // Tab into the shortcuts row: the row shares one roving tab stop, so the
    // first tile's link is the tab stop and its menu button follows it.
    link.focus();
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement === link,
      "The tile link is focused"
    );

    EventUtils.synthesizeKey("KEY_Tab", {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement === menuButton,
      "Tab moves focus from the tile link to its menu button"
    );

    await ContentTaskUtils.waitForCondition(
      () => content.getComputedStyle(menuButton).opacity === "1",
      "the menu button is visible while it holds keyboard focus"
    );
    ok(
      menuButton.matches(":focus-visible"),
      "the menu button matches :focus-visible, which is what reveals it"
    );

    // Tabbing away returns the tile to rest.
    EventUtils.synthesizeKey("KEY_Tab", {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => content.getComputedStyle(menuButton).opacity === "0",
      "the menu button is hidden again after focus moves on"
    );
  },
});

// The menu must open from the keyboard too, and panel-list needs the key event
// so it focuses the first item and returns focus to the trigger on close.
test_newtab({
  before: async args => {
    gBrowser.selectedBrowser.focus();
    await setDefaultTopSites(args);
  },
  test: async function topsites_menu_opens_from_keyboard() {
    const tile = await content.waitForAnyTopSite();
    const menuButton = tile.querySelector(".context-menu-button");
    const panelList = tile.querySelector("panel-list");

    // panel-list's events are untrusted, so the listener has to opt into them.
    const panelEvent = (target, name) =>
      ContentTaskUtils.waitForEvent(target, name, false, null, true);

    menuButton.focus();
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement === menuButton,
      "The menu button is focused"
    );

    let shown = panelEvent(panelList, "shown");
    EventUtils.synthesizeKey("KEY_Enter", {}, content.window);
    await shown;
    ok(panelList.hasAttribute("open"), "Enter opens the menu");
    is(
      menuButton.getAttribute("aria-expanded"),
      "true",
      "aria-expanded tracks the open menu"
    );
    // panel-list only does this when it can tell the menu was opened by
    // keyboard, which depends on being handed the key event.
    ok(
      panelList.contains(content.document.activeElement),
      "Opening with the keyboard moves focus into the menu"
    );

    let hidden = panelEvent(panelList, "hidden");
    EventUtils.synthesizeKey("KEY_Escape", {}, content.window);
    await hidden;
    ok(!panelList.hasAttribute("open"), "Escape closes the menu");
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement === menuButton,
      "Wait for focus to return to the trigger"
    );
    is(
      content.document.activeElement,
      menuButton,
      "Escape returns focus to the menu button"
    );
  },
});

// Check Topsites add
test_newtab({
  before: setTestTopSites,
  // it should be able to click the topsites edit button to reveal the edit topsites modal and overlay.
  test: async function topsites_add(testTopSite) {
    let nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      content.window.HTMLInputElement.prototype,
      "value"
    ).set;
    let event = new content.Event("input", { bubbles: true });

    const tile = await content.waitForTopSite(testTopSite);

    tile.querySelector(".context-menu-button").click();

    const topsitesAddBtn = await content.waitForPanelItem(
      tile,
      "newtab-menu-edit-topsites"
    );

    topsitesAddBtn.click();

    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".modalOverlayOuter"),
      "No overlay found"
    );

    let found = content.document.querySelector(".modalOverlayOuter");
    ok(found && !found.hidden, "Should find a visible overlay");

    // Write field title
    let fieldTitle = content.document.querySelector(".field input");
    ok(fieldTitle && !fieldTitle.hidden, "Should find field title input");

    nativeInputValueSetter.call(fieldTitle, "Bugzilla");
    fieldTitle.dispatchEvent(event);
    is(fieldTitle.value, "Bugzilla", "The field title should match");

    // Write field url
    let fieldURL = content.document.querySelector(".field.url input");
    ok(fieldURL && !fieldURL.hidden, "Should find field url input");

    nativeInputValueSetter.call(fieldURL, "https://bugzilla.mozilla.org");
    fieldURL.dispatchEvent(event);
    is(
      fieldURL.value,
      "https://bugzilla.mozilla.org",
      "The field url should match"
    );

    // Click the "Add" button
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("topsites-form-save-button"),
      "No add button found"
    );
    let addBtn = content.document.getElementById("topsites-form-save-button");
    addBtn.click();

    // Wait for Topsite to be populated
    const addedTile = await content.waitForTopSite(
      "https://bugzilla.mozilla.org"
    );

    // Remove topsite after test is complete
    addedTile.querySelector(".context-menu-button").click();

    const dismissBtn = await content.waitForPanelItem(
      addedTile,
      "newtab-menu-dismiss"
    );
    dismissBtn.click();

    // Wait for Topsite to be removed
    await ContentTaskUtils.waitForCondition(
      () =>
        !content.document.querySelector(
          "[href='https://bugzilla.mozilla.org']"
        ),
      "Topsite not removed"
    );
    // This was set when the topsite was removed, we need to reset it.
    SpecialPowers.clearUserPref("browser.newtabpage.blocked");
  },
});

test_newtab({
  before: setDefaultTopSites,
  test: async function test_search_topsite_keyword() {
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".search-shortcut .title.pinned"),
      "Wait for pinned search topsites"
    );

    const searchTopSites = content.document.querySelectorAll(".title.pinned");
    Assert.greaterOrEqual(
      searchTopSites.length,
      1,
      "There should be at least 1 search topsites"
    );

    searchTopSites[0].click();

    return searchTopSites[0].innerText.trim();
  },
  async after(searchTopSiteTag) {
    ok(
      gURLBar.focused,
      "We clicked a search topsite the focus should be in location bar"
    );

    let engine = await SearchService.getEngineByAlias(searchTopSiteTag);

    // We don't use UrlbarTestUtils.assertSearchMode here since the newtab
    // testing scope doesn't integrate well with UrlbarTestUtils.
    Assert.deepEqual(
      gURLBar.searchMode,
      {
        engineName: engine.name,
        entry: "topsites_newtab",
        isPreview: false,
        isGeneralPurposeEngine: true,
        source: UrlbarShared.RESULT_SOURCE.SEARCH,
      },
      "The Urlbar is in search mode."
    );
    ok(
      gURLBar.hasAttribute("searchmode"),
      "The Urlbar has the searchmode attribute."
    );
  },
});

// test_newtab is not used here as this test requires two steps into the
// content process with chrome process activity in-between.
add_task(async function test_search_topsite_remove_engine() {
  // Open about:newtab without using the default load listener
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab",
    false
  );

  // Specially wait for potentially preloaded browsers
  let browser = tab.linkedBrowser;
  await waitForPreloaded(browser);

  // Add shared helpers to the content process
  SpecialPowers.spawn(browser, [], addContentHelpers);

  // Wait for React to render something
  await TestUtils.waitForCondition(
    () =>
      SpecialPowers.spawn(
        browser,
        [],
        () => content.document.getElementById("root")?.children.length
      ),
    "Should render activity stream content"
  );

  await setDefaultTopSites();

  let [topSiteAlias, numTopSites] = await SpecialPowers.spawn(
    browser,
    [],
    async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector(".search-shortcut .title.pinned"),
        "Wait for pinned search topsites"
      );

      const searchTopSites = content.document.querySelectorAll(".title.pinned");
      Assert.greaterOrEqual(
        searchTopSites.length,
        1,
        "There should be at least one topsite"
      );
      return [searchTopSites[0].innerText.trim(), searchTopSites.length];
    }
  );

  await SearchService.removeEngine(
    await SearchService.getEngineByAlias(topSiteAlias)
  );

  registerCleanupFunction(() => {
    SearchService.restoreDefaultEngines();
  });

  await SpecialPowers.spawn(
    browser,
    [numTopSites],
    async originalNumTopSites => {
      await ContentTaskUtils.waitForCondition(
        () => !content.document.querySelector(".search-shortcut .title.pinned"),
        "Wait for pinned search topsites"
      );

      const searchTopSites = content.document.querySelectorAll(".title.pinned");
      is(
        searchTopSites.length,
        originalNumTopSites - 1,
        "There should be one less search topsites"
      );
    }
  );

  BrowserTestUtils.removeTab(tab);
});
