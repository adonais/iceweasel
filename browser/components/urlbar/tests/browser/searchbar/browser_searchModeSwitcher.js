/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function setup() {
  // Wait for the search service to make sure icons are available immediately.
  await Services.search.init();
});

// keyword.enabled=false should have no effect on icon and label.
add_task(async function test_keyword_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["keyword.enabled", false]],
  });
  let win = await BrowserTestUtils.openNewBrowserWindow();

  // Getting the icon is async, so wait until the icon is set.
  await BrowserTestUtils.waitForCondition(
    async () =>
      SearchbarTestUtils.getSearchModeSwitcherIcon(win) ==
      (await Services.search.defaultEngine.getIconURL())
  );

  Assert.ok(
    true,
    "The search mode switcher should have the default icon " +
      "despite keyword.enabled being false"
  );

  Assert.equal(
    document
      .querySelector("#searchbar-new .searchmode-switcher")
      .getAttribute("data-l10n-id"),
    "urlbar-searchmode-button2",
    "Searchbar has regular l10n id"
  );

  Assert.equal(
    win.document
      .querySelector("#urlbar .searchmode-switcher")
      .getAttribute("data-l10n-id"),
    "urlbar-searchmode-no-keyword",
    "Urlbar has l10n id for keyword disabled"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});
