/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_SYSTEM_USES_DARK = "ui.systemUsesDarkTheme";
const PREF_NATIVE_THEME = "browser.theme.native-theme";
const PREF_ACTIVE_THEME_ID = "extensions.activeThemeID";
const PREFS = [PREF_SYSTEM_USES_DARK, PREF_NATIVE_THEME, PREF_ACTIVE_THEME_ID];

/**
 * JSWindowActor child for theme-picker component. Handles communication between
 * unprivileged content (ThemePickerRemoteController) and the privileged parent
 * process via custom events and sendQuery.
 */
export class ThemePickerChild extends JSWindowActorChild {
  actorCreated() {
    Services.obs.addObserver(this.lookAndFeelChanged, "look-and-feel-changed");
    for (const pref of PREFS) {
      Services.prefs.addObserver(pref, this.prefChanged);
    }
  }

  didDestroy() {
    Services.obs.removeObserver(
      this.lookAndFeelChanged,
      "look-and-feel-changed"
    );
    for (const pref of PREFS) {
      Services.prefs.removeObserver(pref, this.prefChanged);
    }
  }

  lookAndFeelChanged = () => {
    const deviceAppearance = Services.appinfo
      .contentThemeDerivedColorSchemeIsDark
      ? "dark"
      : "light";
    const detail = Cu.cloneInto({ deviceAppearance }, this.contentWindow);
    this.contentWindow.dispatchEvent(
      new this.contentWindow.CustomEvent("ThemePickerDeviceAppearanceUpdated", {
        detail,
      })
    );
  };

  prefChanged = async (_, __, data) => {
    switch (data) {
      case PREF_ACTIVE_THEME_ID: {
        const result = await this.sendQuery("ThemePicker:GetActiveTheme");
        this.dispatchToWindow("ThemePickerThemeUpdated", result);
        break;
      }
      case PREF_NATIVE_THEME: {
        const result = await this.sendQuery("ThemePicker:GetNativeTheme");
        this.dispatchToWindow("ThemePickerNativeThemeUpdated", result);
        break;
      }
      case PREF_SYSTEM_USES_DARK: {
        const result = await this.sendQuery("ThemePicker:GetAppearance");
        this.dispatchToWindow("ThemePickerAppearanceUpdated", result);
        break;
      }
    }
  };

  async handleEvent(event) {
    const target = event.composedTarget;

    switch (event.type) {
      case "ThemePickerGetInitialState": {
        const result = await this.sendQuery(
          "ThemePicker:GetInitialState",
          event.detail
        );
        this.dispatchToWidget(target, "ThemePickerInitialState", result);
        break;
      }
      case "ThemePickerUpdateTheme": {
        const result = await this.sendQuery(
          "ThemePicker:UpdateTheme",
          event.detail
        );
        this.dispatchToWindow("ThemePickerThemeUpdated", result);
        break;
      }
      case "ThemePickerUpdateAppearance": {
        const result = await this.sendQuery(
          "ThemePicker:UpdateAppearance",
          event.detail
        );
        this.dispatchToWindow("ThemePickerAppearanceUpdated", result);
        break;
      }
      case "ThemePickerUpdateNativeTheme": {
        const result = await this.sendQuery(
          "ThemePicker:UpdateNativeTheme",
          event.detail
        );
        this.dispatchToWindow("ThemePickerNativeThemeUpdated", result);
        break;
      }
    }
  }

  dispatchToWidget(target, eventName, detail) {
    const win = target.documentGlobal;
    target.dispatchEvent(
      new win.CustomEvent(eventName, {
        bubbles: true,
        composed: true,
        detail: Cu.cloneInto(detail, win),
      })
    );
  }

  dispatchToWindow(eventName, detail) {
    this.contentWindow.dispatchEvent(
      new this.contentWindow.CustomEvent(eventName, {
        detail: Cu.cloneInto(detail, this.contentWindow),
      })
    );
  }
}
