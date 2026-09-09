"use strict";

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

// Check TopSites edit modal and overlay show up.
test_newtab({
  before: setTestTopSites,
  // it should be able to click the topsites add button to reveal the add top site modal and overlay.
  test: async function topsites_edit() {
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".top-sites .context-menu-button"),
      "Should find a visible topsite context menu button [topsites_edit]"
    );

    // Open the section context menu.
    content.document.querySelector(".top-sites .context-menu-button").click();

    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".top-sites panel-list panel-item"),
      "Should find a visible topsite context menu [topsites_edit]"
    );

    // The "Edit" option is the 2nd item in the context menu.
    const topsitesAddBtn = content.document
      .querySelectorAll(".top-sites panel-list panel-item")
      .item(1);
    topsitesAddBtn.click();

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
  before: setDefaultTopSites,
  // it should pin the website when we click the first option of the topsite context menu.
  test: async function topsites_pin_unpin() {
    const siteSelector = ".top-site-outer:not(.search-shortcut, .placeholder)";
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(siteSelector),
      "Topsite tippytop icon not found"
    );
    // There are only topsites on the page, the selector with find the first topsite menu button.
    let topsiteEl = content.document.querySelector(siteSelector);
    let topsiteContextBtn = topsiteEl.querySelector(".context-menu-button");
    topsiteContextBtn.click();

    await ContentTaskUtils.waitForCondition(
      () => topsiteEl.querySelector("panel-list"),
      "No context menu found"
    );

    let contextMenu = topsiteEl.querySelector("panel-list");
    ok(contextMenu, "Should find a topsite context menu");

    // Pin/Unpin is the first item in the context menu.
    const pinUnpinTopsiteBtn = contextMenu.querySelector("panel-item");
    // Pin the topsite.
    pinUnpinTopsiteBtn.click();

    // Need to wait for pin action.
    await ContentTaskUtils.waitForCondition(
      () => topsiteEl.querySelector(".icon-pin-small"),
      "No pinned icon found"
    );

    let pinnedIcon = topsiteEl.querySelectorAll(".icon-pin-small").length;
    is(pinnedIcon, 1, "should find 1 pinned topsite");

    // Unpin the topsite.
    topsiteContextBtn = topsiteEl.querySelector(".context-menu-button");
    ok(topsiteContextBtn, "Should find a context menu button");
    topsiteContextBtn.click();

    await ContentTaskUtils.waitForCondition(
      () => topsiteEl.querySelector("panel-item"),
      "Should find context menu item button for unpin"
    );
    topsiteEl.querySelector("panel-item").click();

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
    const siteSelector = ".top-site-outer:not(.search-shortcut, .placeholder)";
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(siteSelector),
      "Wait for a topsite tile"
    );
    const tile = content.document.querySelector(siteSelector);
    const menuButton = tile.querySelector(".context-menu-button");
    const panelList = tile.querySelector("panel-list");

    await EventUtils.synthesizeMouseAtCenter(menuButton, {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => panelList.hasAttribute("open"),
      "Menu opens on mouse click"
    );

    // Close with another mouse click on the button. The menu opens on mousedown
    // precisely so this closes it rather than reopening it.
    await EventUtils.synthesizeMouseAtCenter(menuButton, {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => !panelList.hasAttribute("open"),
      "Menu closes on second click"
    );

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
    gBrowser.selectedBrowser.focus();
    await setDefaultTopSites(args);
  },
  test: async function topsites_menu_no_stuck_hover_after_pin_via_menu() {
    const siteSelector = ".top-site-outer:not(.search-shortcut, .placeholder)";
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(siteSelector),
      "Wait for a topsite tile"
    );
    const tile = content.document.querySelector(siteSelector);
    const menuButton = () => tile.querySelector(".context-menu-button");
    const panelList = () => tile.querySelector("panel-list");

    await EventUtils.synthesizeMouseAtCenter(menuButton(), {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => panelList().hasAttribute("open"),
      "Menu opens on mouse click"
    );

    // Pin/Unpin is the first item in the menu.
    await EventUtils.synthesizeMouseAtCenter(
      panelList().querySelector("panel-item"),
      {},
      content.window
    );
    await ContentTaskUtils.waitForCondition(
      () => tile.querySelector(".icon-pin-small"),
      "The topsite is pinned"
    );
    await ContentTaskUtils.waitForCondition(
      () => !panelList().hasAttribute("open"),
      "Choosing a menu item closes the menu"
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
    await EventUtils.synthesizeMouseAtCenter(menuButton(), {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => panelList().hasAttribute("open"),
      "Menu reopens for unpin"
    );
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
    const siteSelector = ".top-site-outer:not(.search-shortcut, .placeholder)";
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(siteSelector),
      "Wait for a topsite tile"
    );
    const tile = content.document.querySelector(siteSelector);
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
    const siteSelector = ".top-site-outer:not(.search-shortcut, .placeholder)";
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(siteSelector),
      "Wait for a topsite tile"
    );
    const tile = content.document.querySelector(siteSelector);
    const menuButton = tile.querySelector(".context-menu-button");
    const panelList = tile.querySelector("panel-list");

    menuButton.focus();
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement === menuButton,
      "The menu button is focused"
    );

    EventUtils.synthesizeKey("KEY_Enter", {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => panelList.hasAttribute("open"),
      "Wait for the menu to open"
    );
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

    EventUtils.synthesizeKey("KEY_Escape", {}, content.window);
    await ContentTaskUtils.waitForCondition(
      () => !panelList.hasAttribute("open"),
      "Wait for the menu to close"
    );
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
  test: async function topsites_add() {
    let nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      content.window.HTMLInputElement.prototype,
      "value"
    ).set;
    let event = new content.Event("input", { bubbles: true });

    // Wait for context menu button to load
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".top-sites .context-menu-button"),
      "Should find a visible topsite context menu button [topsites_add]"
    );

    content.document.querySelector(".top-sites .context-menu-button").click();

    // Wait for context menu to load
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".top-sites panel-list panel-item"),
      "Should find a visible topsite context menu [topsites_add]"
    );

    // Find topsites edit button (the "Edit" option is the 2nd item in the
    // context menu).
    const topsitesAddBtn = content.document
      .querySelectorAll(".top-sites panel-list panel-item")
      .item(1);

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
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector("[href='https://bugzilla.mozilla.org']"),
      "No Topsite found"
    );

    // Remove topsite after test is complete
    let topsiteContextBtn = content.document.querySelector(
      ".top-sites-list li:nth-child(1) .context-menu-button"
    );
    topsiteContextBtn.click();
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".top-sites-list panel-list"),
      "No context menu found"
    );

    // "Dismiss" is the 6th (non-separator) item in the context menu (AddTopSite
    // was added upstream in Bug 2035622).
    const dismissBtn = content.document
      .querySelectorAll(".top-sites panel-list panel-item")
      .item(5);
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
        isGeneralPurposeEngine: false,
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
