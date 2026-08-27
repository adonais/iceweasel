/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const UI_VERSION = 120;

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { PlacesUIUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/places/PlacesUIUtils.sys.mjs"
);
const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

add_task(async function has_not_used_ctrl_tab_and_its_off() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.migration.version");
  });

  Services.xulStore.setValue(
    AppConstants.BROWSER_CHROME_URL,
    "place:test",
    "open",
    "true"
  );

  // Simulate a migration.
  ProfileDataUpgrader.upgrade(UI_VERSION, UI_VERSION + 1);

  Assert.equal(
    Services.xulStore.getValue(
      AppConstants.BROWSER_CHROME_URL,
      PlacesUIUtils.obfuscateUrlForXulStore("place:test"),
      "open"
    ),
    "true"
  );

  Assert.greater(
    Services.prefs.getIntPref("browser.migration.version"),
    UI_VERSION,
    "Check migration version has been bumped up"
  );
});
