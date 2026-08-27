/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getL10nIdForThemeProp, getL10nThemeString } =
  ChromeUtils.importESModule(
    "resource://gre/modules/addons/ThemesBundledLocalization.sys.mjs"
  );

const PREF_NOVA_ENABLED = "browser.nova.enabled";
const DEFAULT_THEME_ID = "default-theme@mozilla.org";

add_task(async function test_ensure_builtin_themes_are_localized() {
  let addons = await AddonManager.getAllAddons();
  let standardBuiltInThemes = addons.filter(
    addon => addon.isBuiltin && addon.type === "theme"
  );
  ok(!!standardBuiltInThemes.length, "Standard built-in themes should exist");

  const l10n = new Localization(
    ["browser/appExtensionFields.ftl", "branding/brand.ftl"],
    true
  );

  const getExpectedL10nString = (themeId, prop) => {
    const id = getL10nIdForThemeProp(themeId, prop);
    const [message] = l10n.formatMessagesSync([{ id }]);
    ok(message, `Found a localized message for fluent id ${id}`);
    return message.value;
  };

  function testLocalizedThemeWrapperProperty(theme) {
    const expectedName = getExpectedL10nString(theme.id, "name");
    const expectedDescription = getExpectedL10nString(theme.id, "description");

    Assert.equal(
      getL10nThemeString(theme.id, "name"),
      expectedName,
      `Got the expected bundled localized name for ${theme.id}`
    );
    Assert.equal(
      getL10nThemeString(theme.id, "description"),
      expectedDescription,
      `Got the expected bundled localized description for ${theme.id}`
    );

    Assert.equal(
      theme.name,
      expectedName,
      `Got the expected AddonWrapper localized name for ${theme.id}`
    );
    Assert.equal(
      theme.description,
      expectedDescription,
      `Got the expected AddonWrapper localized description for ${theme.id}`
    );
  }

  for (let novaEnabled of [true, false]) {
    info(`Run with Nova ${novaEnabled ? "enabled" : "disabled"}`);
    await SpecialPowers.pushPrefEnv({
      set: [[PREF_NOVA_ENABLED, novaEnabled]],
    });
    for (let standardTheme of standardBuiltInThemes) {
      testLocalizedThemeWrapperProperty(standardTheme);
    }
    await SpecialPowers.popPrefEnv();
  }
});

// Verifies every curated AMO-hosted theme names' fluent localizations are
// bundled in the build as expected (description are not expected to be
// bundled because they are currently only needed when the curated
// AMO-hosted themes are installed, and so the AMO-provided localized
// description is expected to be used instead).
add_task(async function test_ensure_curated_theme_ids_are_localized() {
  if (AppConstants.MOZ_APP_NAME === "thunderbird") {
    todo(
      false,
      "Skip on curated AMO-hosted localized themes on Thunderbird builds"
    );
    return;
  }

  const { getThemesList } = ChromeUtils.importESModule(
    "moz-src:///browser/themes/ThemesList.sys.mjs"
  );
  const themesListManager = await getThemesList({
    installSource: "about:addons",
  });
  const THEME_IDS = themesListManager
    .getThemesInfo()
    .map(themeInfo => themeInfo.id)
    .filter(themeId => themeId !== DEFAULT_THEME_ID);

  const l10n = new Localization(["browser/appExtensionFields.ftl"], true);

  for (let themeId of THEME_IDS) {
    let fluentId = getL10nIdForThemeProp(themeId, "name");
    ok(fluentId, `Got a fluent id for theme ${themeId} localized name`);
    const [message] = l10n.formatMessagesSync([{ id: fluentId }]);
    ok(
      message,
      `l10n id "${fluentId}" for curated theme ${themeId} localized name should exist`
    );
  }
});
