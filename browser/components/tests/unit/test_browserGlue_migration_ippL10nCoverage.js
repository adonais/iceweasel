/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

const PREF = "browser.ipProtection.hasSeenFeature";

add_setup(() => {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(PREF);
    Services.prefs.clearUserPref("browser.migration.version");
  });
});

add_task(async function existing_profile_is_grandfathered() {
  Services.prefs.clearUserPref(PREF);

  // The pref defaults to `true` on Nightly, where the upgrade cannot pin a user
  // value: the pref is not sticky, so setting it to its default value is a
  // no-op. The default keeps the feature exposed there anyway.
  const defaultValue = Services.prefs.getDefaultBranch("").getBoolPref(PREF);

  ProfileDataUpgrader.upgrade(179, 180);

  Assert.equal(
    Services.prefs.prefHasUserValue(PREF),
    !defaultValue,
    "The upgrade should pin a user value wherever the default is `false`"
  );
  Assert.ok(
    Services.prefs.getBoolPref(PREF, false),
    "Existing profiles should keep seeing the feature"
  );
});

add_task(async function user_value_is_preserved() {
  // Only a user value of `false` tells an untouched pref from an overwritten
  // one, and it needs a `true` default to exist at all: the pref is not sticky,
  // so setting it to its default value clears the user value.
  const defaultBranch = Services.prefs.getDefaultBranch("");
  const origDefault = defaultBranch.getBoolPref(PREF);
  defaultBranch.setBoolPref(PREF, true);
  Services.prefs.setBoolPref(PREF, false);

  ProfileDataUpgrader.upgrade(179, 180);

  Assert.ok(
    Services.prefs.prefHasUserValue(PREF),
    "The upgrade should not clear an existing user value"
  );
  Assert.equal(
    Services.prefs.getBoolPref(PREF),
    false,
    "An existing user value should not be overwritten"
  );

  Services.prefs.clearUserPref(PREF);
  defaultBranch.setBoolPref(PREF, origDefault);
});
