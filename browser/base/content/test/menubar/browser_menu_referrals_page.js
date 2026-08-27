/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

registerCleanupFunction(() => {
  Services.prefs.unlockPref("browser.referrals.code");
  Services.prefs.clearUserPref("browser.referrals.code");
});

add_task(async function test_applicationMenu_referralsPage() {
  // Referrals item should exist when the pref is true
  Services.prefs.setBoolPref("browser.referrals.enabled", true);
  let menuitem = document.getElementById("menu_referralsPage");
  ok(!!menuitem, "menu_referralsPage exists");

  menuitem.doCommand();

  await TestUtils.waitForCondition(
    () =>
      gBrowser.currentURI.displaySpec === "about:referrals" ||
      gBrowser.currentURI.displaySpec.startsWith(
        "https://www.firefox.com/invite"
      ),
    "Waiting for the referrals tab to be opened"
  );

  await gBrowser.removeTab(gBrowser.selectedTab);
  Services.prefs.clearUserPref("browser.referrals.enabled");
});
