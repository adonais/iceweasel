/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// A bar that isn't the address bar has no one-off buttons, so the switcher
// carries search mode entry alongside the @ keywords. Disabling scotch bonnet
// doesn't take it away.

"use strict";

const POST_URL =
  "https://example.com/browser/browser/components/urlbar/tests/browser-newtab/print_postdata.sjs";

const SEARCH_CONFIG = [
  { identifier: "engine1" },
  { identifier: "engine2" },
  { identifier: "engine3" },
  {
    identifier: "post",
    base: {
      urls: {
        search: {
          base: POST_URL,
          method: "POST",
          searchTermParamName: "q",
        },
      },
    },
  },
];

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig(SEARCH_CONFIG);
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.scotchBonnet.enableOverride", false]],
  });
});

/**
 * Opens the switcher on a newtab page and clicks one of its engines.
 *
 * @param {MozBrowser} browser
 * @param {string} engineId
 * @param {object} modifiers
 *   As `EventUtils.synthesizeMouseAtCenter` takes them.
 * @param {string} value
 *   What to type into the bar first. An empty bar sends the switcher to the
 *   engine's home page rather than to a result page.
 */
function clickSwitcherEngine(browser, engineId, modifiers, value) {
  return NewtabSearchbarTestUtils.spawn(
    browser,
    [engineId, modifiers, value],
    async (id, mouseModifiers, searchString) => {
      let utils = NewtabSearchbarContentTestUtils;
      await utils.search(content, { value: searchString });
      let popup = await utils.openSearchModeSwitcher(content);
      EventUtils.synthesizeMouseAtCenter(
        popup.querySelector(`panel-item[data-engine-id=${id}]`),
        mouseModifiers,
        content
      );
    }
  );
}

add_task(async function switcherEntersSearchMode() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(tab.linkedBrowser, [], async () => {
    let utils = NewtabSearchbarContentTestUtils;
    await utils.activateSearchModeSwitcherItem(
      content,
      "panel-item[data-engine-id=engine2]"
    );
    await utils.assertSearchMode(content, {
      engineName: "engine2",
      entry: "searchbutton",
      source: 3,
      isGeneralPurposeEngine: true,
    });

    utils
      .getUrlbar(content)
      .querySelector(".searchmode-switcher-close")
      .click();
    await utils.assertSearchMode(content, null);
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function shiftClickSearchesInTheSameTab() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let loaded = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    POST_URL
  );

  await clickSwitcherEngine(
    tab.linkedBrowser,
    "post",
    { shiftKey: true },
    "a b c"
  );
  await loaded;

  Assert.equal(gBrowser.selectedTab, tab, "the search stayed in the same tab");
  Assert.equal(
    await SpecialPowers.spawn(
      tab.linkedBrowser,
      [],
      () => content.document.body.textContent
    ),
    "q=a+b+c",
    "the engine was posted the search terms"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function accelClickSearchesInANewTab() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let opened = BrowserTestUtils.waitForNewTab(gBrowser, POST_URL, true);

  await clickSwitcherEngine(
    tab.linkedBrowser,
    "post",
    { accelKey: true },
    "a b c"
  );
  let newTab = await opened;

  Assert.ok(!newTab.selected, "the search opened in a background tab");
  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    "about:newtab",
    "the newtab tab stayed where it was"
  );
  Assert.equal(
    await SpecialPowers.spawn(
      newTab.linkedBrowser,
      [],
      () => content.document.body.textContent
    ),
    "q=a+b+c",
    "the engine was posted the search terms"
  );

  BrowserTestUtils.removeTab(newTab);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function tabReachesTheSwitcher() {
  // Outside the toolbar, this pref is what puts the button in the tab order
  // while the input has focus.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.searchModeSwitcher.skipTabStop", true]],
  });

  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(tab.linkedBrowser, [], async () => {
    let utils = NewtabSearchbarContentTestUtils;
    let bar = utils.getUrlbar(content);
    bar.focus();

    // Tab cycles the results while the view is open, so the switcher is only a
    // tab stop for a bar that has yet to query.
    EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, content);
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.activeElement.classList.contains(
          "searchmode-switcher"
        ),
      "waiting for the switcher to take focus"
    );

    let popup = await utils.openSearchModeSwitcher(content, () =>
      EventUtils.synthesizeKey("KEY_Enter", {}, content)
    );

    let closed = utils.searchModeSwitcherPopupClosed(content);
    popup.hide();
    await closed;
  });

  BrowserTestUtils.removeTab(tab);
});
