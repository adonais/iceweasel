/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

add_setup(() => {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.fixup.alternate.enabled");
    Services.prefs.clearUserPref("browser.migration.version");
  });
});

add_task(async function browser_fixup_alternate_enabled() {
  Services.prefs.setBoolPref("browser.fixup.alternate.enabled", true);

  ProfileDataUpgrader.upgrade(139, 140);

  Assert.ok(
    !Services.prefs.getBoolPref("browser.fixup.alternate.enabled", false),
    "browser.fixup.alternate.enabled pref should be cleared"
  );
});
