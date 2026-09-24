/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  getThemesList: "moz-src:///browser/themes/ThemesList.sys.mjs",
});

const PREF_SYSTEM_USES_DARK = "ui.systemUsesDarkTheme";
const PREF_NATIVE_THEME = "browser.theme.native-theme";
const PREF_ACTIVE_THEME_ID = "extensions.activeThemeID";

/**
 * JSWindowActor parent for theme-picker component. Handles theme state queries
 * and updates via AddonManager and prefs.
 */
export class ThemePickerParent extends JSWindowActorParent {
  themesManagers = new Map();

  async getThemesManager(installSource) {
    let managerPromise = this.themesManagers.get(installSource);
    if (!managerPromise) {
      managerPromise = lazy.getThemesList({ installSource }).catch(error => {
        this.themesManagers.delete(installSource);
        throw error;
      });
      this.themesManagers.set(installSource, managerPromise);
    }

    return managerPromise;
  }

  async receiveMessage(message) {
    switch (message.name) {
      case "ThemePicker:GetInitialState":
        return this.getInitialState(message.data);

      case "ThemePicker:UpdateTheme":
        return this.updateTheme(message.data);

      case "ThemePicker:UpdateAppearance":
        return this.updateAppearance(message.data);

      case "ThemePicker:UpdateNativeTheme":
        return this.updateNativeTheme(message.data);

      case "ThemePicker:GetActiveTheme":
        return this.getActiveThemeId();

      case "ThemePicker:GetAppearance":
        return this.getAppearance();

      case "ThemePicker:GetNativeTheme":
        return this.getNativeTheme();
    }

    return null;
  }

  async getInitialState({ installSource, showInCompactLayout }) {
    const themesManager = await this.getThemesManager(installSource);
    const themes = themesManager.getThemesInfo({ showInCompactLayout });
    const { activeThemeId } = this.getActiveThemeId();
    const { nativeTheme } = this.getNativeTheme();
    const appearance = this.getAppearanceFromPref();
    const showNativeThemeOption = AppConstants.platform === "linux";
    const deviceAppearance = Services.appinfo
      .contentThemeDerivedColorSchemeIsDark
      ? "dark"
      : "light";

    return {
      themes,
      activeThemeId,
      nativeTheme,
      appearance,
      showNativeThemeOption,
      deviceAppearance,
    };
  }

  async updateTheme({ themeId, installsource, layout }) {
    const themesManager = await this.getThemesManager(installsource);
    await themesManager.updateThemeState(themeId, true, { layout });
    return this.getActiveThemeId();
  }

  async updateAppearance({ appearance, installsource, layout }) {
    if (appearance === "device") {
      Services.prefs.clearUserPref(PREF_SYSTEM_USES_DARK);
    } else {
      Services.prefs.setIntPref(
        PREF_SYSTEM_USES_DARK,
        appearance === "light" ? 0 : 1
      );
    }

    const result = this.getAppearance();
    Glean.themePicker.change.record({
      source: installsource,
      layout,
      property: "appearance",
      appearance: result.appearance,
    });

    return result;
  }

  async updateNativeTheme({ nativeTheme, installsource, layout }) {
    Services.prefs.setBoolPref(PREF_NATIVE_THEME, nativeTheme);

    const result = this.getNativeTheme();
    Glean.themePicker.change.record({
      source: installsource,
      layout,
      property: "nativeTheme",
      native_theme: result.nativeTheme,
    });

    return result;
  }

  getActiveThemeId() {
    return {
      activeThemeId: Services.prefs.getStringPref(
        PREF_ACTIVE_THEME_ID,
        "default-theme@mozilla.org"
      ),
    };
  }

  getAppearance() {
    return { appearance: this.getAppearanceFromPref() };
  }

  getAppearanceFromPref() {
    if (!Services.prefs.prefHasUserValue(PREF_SYSTEM_USES_DARK)) {
      return "device";
    }

    const systemUsesDark = Services.prefs.getIntPref(PREF_SYSTEM_USES_DARK, -1);
    if (systemUsesDark === 0) {
      return "light";
    } else if (systemUsesDark === 1) {
      return "dark";
    }

    return "device";
  }

  getNativeTheme() {
    return {
      nativeTheme: Services.prefs.getBoolPref(PREF_NATIVE_THEME, false),
    };
  }
}
