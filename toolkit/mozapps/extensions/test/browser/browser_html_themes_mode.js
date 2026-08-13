/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Verifies the aboutaddons-themes-mode component behaviour in about:addons.

const PREF_NOVA_ENABLED = "browser.nova.enabled";
const PREF_SYSTEM_USES_DARK = "ui.systemUsesDarkTheme";

const getThemesMode = doc => doc.querySelector("aboutaddons-themes-mode");

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(PREF_SYSTEM_USES_DARK);
});

add_task(async function test_themes_mode_hidden_when_nova_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_NOVA_ENABLED, false]] });
  const win = await loadInitialView("theme");
  Assert.ok(
    !BrowserTestUtils.isVisible(getThemesMode(win.document)),
    "themes-mode should be hidden when nova is disabled"
  );
  await closeView(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_themes_mode_visibility() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_NOVA_ENABLED, true]] });

  for (const [type, expectedVisible] of [
    ["extension", false],
    ["locale", false],
    ["plugin", false],
    ["mlmodel", false],
    ["dictionary", false],
    ["sitepermission", false],
    ["theme", true],
  ]) {
    const win = await loadInitialView(type);
    Assert.equal(
      BrowserTestUtils.isVisible(getThemesMode(win.document)),
      expectedVisible,
      `themes-mode should be ${expectedVisible ? "visible" : "hidden"} on ${type} list view`
    );
    await closeView(win);
  }

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_themes_mode_initial_value() {
  Services.prefs.clearUserPref(PREF_SYSTEM_USES_DARK);

  for (const [darkPrefValue, expectedValue] of [
    [null, "device"],
    [0, "light"],
    [1, "dark"],
  ]) {
    const set = [[PREF_NOVA_ENABLED, true]];
    if (darkPrefValue !== null) {
      set.push([PREF_SYSTEM_USES_DARK, darkPrefValue]);
    }
    await SpecialPowers.pushPrefEnv({ set });
    const win = await loadInitialView("theme");
    const themesMode = getThemesMode(win.document);
    await themesMode.updateComplete;
    Assert.equal(
      themesMode.value,
      expectedValue,
      `Initial value should be '${expectedValue}'`
    );
    await closeView(win);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_themes_mode_pref_binding() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NOVA_ENABLED, true],
      [PREF_SYSTEM_USES_DARK, 0 /* light */],
    ],
  });
  const win = await loadInitialView("theme");
  const themesMode = getThemesMode(win.document);
  await themesMode.updateComplete;

  Assert.equal(
    themesMode.value,
    "light",
    "Initial themes mode value should be 'light' on pref set to 0"
  );

  await SpecialPowers.pushPrefEnv({
    set: [[PREF_SYSTEM_USES_DARK, 2 /* device */]],
  });
  await themesMode.updateComplete;
  Assert.equal(
    themesMode.value,
    "device",
    "Value should update to 'device' after pref set to 2"
  );

  await SpecialPowers.pushPrefEnv({
    set: [[PREF_SYSTEM_USES_DARK, 1 /* dark */]],
  });
  await themesMode.updateComplete;
  Assert.equal(
    themesMode.value,
    "dark",
    "Value should update to 'dark' after pref set to 1"
  );

  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();

  const getButton = value =>
    themesMode.shadowRoot
      .querySelector("moz-segmented-control")
      .querySelector(`[value="${value}"]`);

  getButton("light").click();
  Assert.equal(
    Services.prefs.getIntPref(PREF_SYSTEM_USES_DARK, -1),
    0,
    "Clicking 'light' should set pref to 0"
  );

  getButton("dark").click();
  Assert.equal(
    Services.prefs.getIntPref(PREF_SYSTEM_USES_DARK, -1),
    1,
    "Clicking 'dark' should set pref to 1"
  );

  getButton("device").click();
  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_SYSTEM_USES_DARK),
    "Clicking 'device' should clear the pref user value"
  );

  await closeView(win);
  await SpecialPowers.popPrefEnv();
});
