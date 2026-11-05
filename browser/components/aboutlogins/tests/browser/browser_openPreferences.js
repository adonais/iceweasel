/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(async function () {
  Services.fog.testResetFOG();

  await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });
});

add_task(async function test_open_preferences() {
  // We want to make sure we visit about:preferences#privacy-logins , as that is
  // what causes us to scroll to and highlight the "logins" section. However,
  // about:preferences will redirect the URL, so the eventual load event will happen
  // on about:preferences#passwordsAutofill . The `wantLoad` parameter we pass to
  // `waitForNewTab` needs to take this into account:
  let seenFirstURL = false;
  let promiseNewTab = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => {
      if (url == "about:preferences#privacy-logins") {
        seenFirstURL = true;
        return true;
      } else if (url == "about:preferences#passwordsAutofill") {
        Assert.ok(
          seenFirstURL,
          "Must have seen an onLocationChange notification for the privacy-logins hash"
        );
        return true;
      }
      return false;
    },
    true
  );

  let browser = gBrowser.selectedBrowser;
  await BrowserTestUtils.synthesizeMouseAtCenter("menu-button", {}, browser);
  await SpecialPowers.spawn(browser, [], async () => {
    return ContentTaskUtils.waitForCondition(() => {
      let menuButton = Cu.waiveXrays(
        content.document.querySelector("menu-button")
      );
      return !menuButton.shadowRoot.querySelector(".menu").hidden;
    }, "waiting for menu to open");
  });

  function getPrefsItem() {
    let menuButton = window.document.querySelector("menu-button");
    return menuButton.shadowRoot.querySelector(".menuitem-preferences");
  }
  await BrowserTestUtils.synthesizeMouseAtCenter(getPrefsItem, {}, browser);

  info("waiting for new tab to get opened");
  let newTab = await promiseNewTab;
  Assert.ok(true, "New tab opened to about:preferences");

  BrowserTestUtils.removeTab(newTab);

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.mgmtMenuItemUsedPreferences.testGetValue().length,
    1,
    "One preferences event"
  );
});
