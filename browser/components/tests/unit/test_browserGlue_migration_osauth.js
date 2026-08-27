/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const UI_VERSION = 157;
const NIGHTLY_ONLY_DATA_MIGRATION = 158;

const { LoginHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/LoginHelper.sys.mjs"
);
const { FormAutofillUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
);
const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

const CC_OLD_PREF = "extensions.formautofill.creditCards.reauth.optout";
const CC_NEW_PREF = FormAutofillUtils.AUTOFILL_CREDITCARDS_OS_AUTH_LOCKED_PREF;

const PASSWORDS_OLD_PREF = "signon.management.page.os-auth.optout";
const PASSWORDS_NEW_PREF = LoginHelper.OS_AUTH_FOR_PASSWORDS_BOOL_PREF;

function clearPrefs() {
  Services.prefs.clearUserPref("browser.migration.version");
  Services.prefs.clearUserPref(CC_OLD_PREF);
  Services.prefs.clearUserPref(CC_NEW_PREF);
  Services.prefs.clearUserPref(PASSWORDS_OLD_PREF);
  Services.prefs.clearUserPref(PASSWORDS_NEW_PREF);
  Services.prefs.clearUserPref("browser.startup.homepage_override.mstone");
}

add_task(async function setup() {
  registerCleanupFunction(clearPrefs);
});

add_task(async function test_pref_migration_old_pref_os_auth_disabled() {
  Services.prefs.setStringPref(CC_OLD_PREF, "off");
  Services.prefs.setStringPref(PASSWORDS_OLD_PREF, "off");

  ProfileDataUpgrader.upgrade(UI_VERSION - 1, UI_VERSION);

  Assert.ok(
    !FormAutofillUtils.getOSAuthEnabled(),
    "OS Auth should be disabled for credit cards since it was disabled before migration."
  );
  Assert.ok(
    !LoginHelper.getOSAuthEnabled(),
    "OS Auth should be disabled for passwords since it was disabled before migration."
  );
  clearPrefs();
});

add_task(async function test_pref_migration_old_pref_os_auth_enabled() {
  Services.prefs.setStringPref(CC_OLD_PREF, "");
  Services.prefs.setStringPref(PASSWORDS_OLD_PREF, "");

  ProfileDataUpgrader.upgrade(UI_VERSION - 1, UI_VERSION);

  Assert.ok(
    FormAutofillUtils.getOSAuthEnabled(),
    "OS Auth should be enabled for credit cards since it was enabled before migration."
  );
  Assert.ok(
    LoginHelper.getOSAuthEnabled(),
    "OS Auth should be enabled for passwords since it was enabled before migration."
  );
  clearPrefs();
});

add_task(async function test_pref_migration_real_pref_os_auth_disabled() {
  Services.prefs.setCharPref(
    "browser.startup.homepage_override.mstone",
    "127.0"
  );

  ProfileDataUpgrader.upgrade(
    NIGHTLY_ONLY_DATA_MIGRATION,
    NIGHTLY_ONLY_DATA_MIGRATION + 1
  );

  Assert.ok(
    !FormAutofillUtils.getOSAuthEnabled(),
    "OS Auth should be disabled for credit cards."
  );
  Assert.ok(
    !LoginHelper.getOSAuthEnabled(),
    "OS Auth should be disabled for passwords since it was disabled before migration."
  );
  clearPrefs();
});
