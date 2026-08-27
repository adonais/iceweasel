/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Verifies the native-theme-colors-checkbox component behavior on the
// default theme's addon-card in about:addons. The component only renders
// on Linux, and so on non-Linux platform this test files only verifies
// that the component is not rendered as expected.

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

AddonTestUtils.initMochitest(this);

const PREF_NATIVE_THEME = "browser.theme.native-theme";
const PREF_NOVA_ENABLED = "browser.nova.enabled";
const DEFAULT_THEME_ID = "default-theme@mozilla.org";
const OTHER_THEME_ID = "other-theme@mozilla.org";

const IS_OS_LINUX = AppConstants.platform === "linux";

function getNativeThemeCheckbox(win) {
  return getAddonCard(win, DEFAULT_THEME_ID).querySelector(
    "native-theme-colors-checkbox"
  );
}

function getMozCheckbox(checkbox) {
  return checkbox.shadowRoot.querySelector("moz-checkbox");
}

function installOtherTheme() {
  const xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      name: "other theme",
      version: "1.0",
      theme: {},
      browser_specific_settings: { gecko: { id: OTHER_THEME_ID } },
    },
  });
  return AddonManager.installTemporaryAddon(xpi);
}

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref(PREF_NATIVE_THEME);
  const otherTheme = await AddonManager.getAddonByID(OTHER_THEME_ID);
  await otherTheme?.uninstall();
  const defaultAddon = await AddonManager.getAddonByID(DEFAULT_THEME_ID);
  if (!defaultAddon.isActive) {
    await defaultAddon.enable();
  }
});

add_task(async function test_checkbox_hidden_when_nova_disabled() {
  if (!IS_OS_LINUX) {
    info("SKIPPED. This test is only meant to run on Linux");
    return;
  }

  await SpecialPowers.pushPrefEnv({ set: [[PREF_NOVA_ENABLED, false]] });

  const win = await loadInitialView("theme");
  const checkbox = getNativeThemeCheckbox(win);
  Assert.ok(
    !BrowserTestUtils.isVisible(checkbox),
    "native-theme-colors-checkbox should be hidden when nova is disabled"
  );

  await closeView(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_checkbox_hidden_when_os_is_not_linux() {
  if (IS_OS_LINUX) {
    info("SKIPPED. This test is only meant to run on non-Linux platforms");
    return;
  }

  await SpecialPowers.pushPrefEnv({ set: [[PREF_NOVA_ENABLED, true]] });

  const win = await loadInitialView("theme");
  const checkbox = getNativeThemeCheckbox(win);
  Assert.ok(
    checkbox,
    "native-theme-colors-checkbox element is present on the default theme card"
  );
  Assert.ok(
    !BrowserTestUtils.isVisible(checkbox),
    "native-theme-colors-checkbox should be hidden when the OS is not Linux"
  );

  await closeView(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_checkbox_not_hidden_on_linux() {
  if (!IS_OS_LINUX) {
    info("SKIPPED. This test is only meant to run on Linux");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NOVA_ENABLED, true],
      // Set a non-default starting value (it defaults to true on Linux/GTK).
      [PREF_NATIVE_THEME, false],
    ],
  });

  const defaultAddon = await AddonManager.getAddonByID(DEFAULT_THEME_ID);
  Assert.ok(defaultAddon.isActive, "default theme is active at test start");

  const win = await loadInitialView("theme");
  const checkbox = getNativeThemeCheckbox(win);
  Assert.ok(
    checkbox,
    "native-theme-colors-checkbox element is present on the default theme card"
  );

  await checkbox.updateComplete;
  Assert.ok(
    getMozCheckbox(checkbox),
    "checkbox content is rendered in the default theme card when the theme is enabled"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(checkbox),
    "native-theme-colors-checkbox should be visible when nova is enabled"
  );

  const otherTheme = await installOtherTheme();
  const defaultDisabled = AddonTestUtils.promiseAddonEvent(
    "onDisabled",
    addon => addon.id === DEFAULT_THEME_ID
  );
  await otherTheme.enable();
  await defaultDisabled;
  await checkbox.updateComplete;

  Assert.ok(
    !BrowserTestUtils.isVisible(
      getAddonCard(win, otherTheme.id).querySelector(
        "native-theme-colors-checkbox"
      )
    ),
    "native-theme-colors-checkbox should not be visible on the non-default theme cards"
  );

  Assert.ok(
    getMozCheckbox(checkbox),
    "checkbox content is rendered in the default theme card when the theme is disabled"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(checkbox),
    "native-theme-colors-checkbox should still be visible"
  );

  const defaultEnabled = AddonTestUtils.promiseAddonEvent(
    "onEnabled",
    addon => addon.id === DEFAULT_THEME_ID
  );
  await defaultAddon.enable();
  await defaultEnabled;
  await checkbox.updateComplete;
  Assert.ok(
    getMozCheckbox(checkbox),
    "checkbox content is still rendered as expected when the default theme is reactivated"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(checkbox),
    "native-theme-colors-checkbox should still be visible"
  );

  // Explicitly verify that on a theme addon-card moved without `hidden` attribute
  // being changed, the native-theme-colors-checkbox webcomponent is still internally
  // observing the pref and updating the checkbox accordingly.
  Assert.ok(
    !checkbox.checked,
    "checkbox.checked should still be false, matching the initial pref value"
  );
  // Mock the pref being set externally (e.g. from a different about:addons tab).
  Services.prefs.setBoolPref(PREF_NATIVE_THEME, true);
  await checkbox.updateComplete;
  Assert.ok(
    checkbox.checked,
    "checkbox.checked reacted to pref change after the card being reordered in the list"
  );
  Assert.ok(
    getMozCheckbox(checkbox).checked,
    "moz-checkbox should reflect the pref change too"
  );

  await otherTheme.uninstall();
  await closeView(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_checkbox_pref_changes() {
  if (!IS_OS_LINUX) {
    info("SKIPPED. This test is only meant to run on Linux");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NOVA_ENABLED, true],
      [PREF_NATIVE_THEME, false],
    ],
  });

  const win = await loadInitialView("theme");
  const checkbox = getNativeThemeCheckbox(win);
  await checkbox.updateComplete;

  Assert.ok(
    !checkbox.checked,
    "checkbox.checked is false when the pref is false"
  );
  Assert.ok(
    !getMozCheckbox(checkbox).checked,
    "moz-checkbox is unchecked when the pref is false"
  );

  await SpecialPowers.pushPrefEnv({ set: [[PREF_NATIVE_THEME, true]] });
  await checkbox.updateComplete;
  Assert.ok(
    checkbox.checked,
    "checkbox.checked updates to true when the pref changes to true"
  );
  await SpecialPowers.popPrefEnv();
  await checkbox.updateComplete;
  Assert.ok(
    !checkbox.checked,
    "checkbox.checked reverts to false once the pref set is popped"
  );

  const mozCheckbox = getMozCheckbox(checkbox);
  await mozCheckbox.updateComplete;
  const input = mozCheckbox.shadowRoot.querySelector("#input");

  input.click();
  Assert.ok(
    Services.prefs.getBoolPref(PREF_NATIVE_THEME),
    "clicking the checkbox sets the pref to true"
  );

  input.click();
  Assert.ok(
    !Services.prefs.getBoolPref(PREF_NATIVE_THEME),
    "clicking the checkbox again sets the pref back to false"
  );

  await closeView(win);
  await SpecialPowers.popPrefEnv();
});
