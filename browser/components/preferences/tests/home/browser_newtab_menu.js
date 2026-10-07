/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function newtabPreloaded() {
  // pushPrefEnv so the harness restores the pref even if an assertion below
  // fails part way through, leaving the rest of the manifest unaffected.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.newtabpage.enabled", true]],
  });

  let { win, tab } = await openHomePreferences();
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  let control = await settingControlRenders("homepageNewTabs", win);
  let select = control.controlEl;

  is(select.inputEl.value, "home", "New tabs start on Firefox Home.");
  ok(NewTabPagePreloading.enabled, "Default Home allows preloading.");

  await changeMozSelectValue(select, "blank");
  ok(!NewTabPagePreloading.enabled, "Non-Home prevents preloading.");

  await changeMozSelectValue(select, "home");
  ok(NewTabPagePreloading.enabled, "Default Home allows preloading again.");
});
