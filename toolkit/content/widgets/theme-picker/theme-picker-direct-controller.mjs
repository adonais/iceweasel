/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const lazy = XPCOMUtils.declareLazy({
  // eslint-disable-next-line mozilla/no-browser-refs-in-toolkit
  getThemesList: "moz-src:///browser/themes/ThemesList.sys.mjs",
});

/**
 * @import { ReactiveController } from "chrome://global/content/vendor/lit.all.mjs";
 * @import { ThemePicker, ThemechangeEvent, ThemechangeEventDetail } from "./theme-picker.mjs";
 */

const PREF_SYSTEM_USES_DARK = "ui.systemUsesDarkTheme";
const PREF_NATIVE_THEME = "browser.theme.native-theme";
const PREF_ACTIVE_THEME_ID = "extensions.activeThemeID";

/**
 * @implements {ReactiveController}
 */
export class ThemePickerDirectController {
  /**
   * @param {ThemePicker} host
   */
  constructor(host) {
    this.host = host;
    this.host.addController(this);
    lazy
      .getThemesList({
        installSource: this.host.getAttribute("installsource") || "unknown",
      })
      .then(tm => {
        this.themesManager = tm;
        this.host.themes = tm.getThemesInfo({
          showInCompactLayout: this.host.layout === "compact",
        });
        this.updateHost();
      });
    this.lazy = XPCOMUtils.declareLazy({
      activeThemeId: {
        pref: PREF_ACTIVE_THEME_ID,
        default: "",
        onUpdate: () => this.updateHost(),
      },
      nativeTheme: {
        pref: PREF_NATIVE_THEME,
        default: false,
        onUpdate: () => this.updateHost(),
      },
      systemUsesDark: {
        pref: PREF_SYSTEM_USES_DARK,
        default: -1,
        onUpdate: () => this.updateHost(),
      },
    });

    this.host.addEventListener(
      "themechange",
      /** @param {ThemechangeEvent} e */
      e => this.onThemechange(e.detail)
    );
  }

  hostConnected() {
    Services.obs.addObserver(this.updateHost, "look-and-feel-changed");
    this.updateHost();
  }

  hostDisconnected() {
    Services.obs.removeObserver(this.updateHost, "look-and-feel-changed");
  }

  /**
   * @param {ThemechangeEventDetail} state
   */
  async onThemechange({ property, value }) {
    switch (property) {
      case "theme":
        this.setTheme(String(value));
        break;
      case "appearance":
        if (value == "device") {
          Services.prefs.clearUserPref(PREF_SYSTEM_USES_DARK);
        } else {
          Services.prefs.setIntPref(
            PREF_SYSTEM_USES_DARK,
            value == "light" ? 0 : 1
          );
        }
        break;
      case "nativeTheme":
        Services.prefs.setBoolPref(PREF_NATIVE_THEME, Boolean(value));
        break;
    }
  }

  /**
   * @param {string} themeId
   */
  async setTheme(themeId) {
    await this.themesManager.updateThemeState(themeId, true);
  }

  updateHost = () => {
    this.host.activeThemeId = this.lazy.activeThemeId;
    this.host.nativeTheme = this.lazy.nativeTheme;
    if (this.lazy.systemUsesDark == 0) {
      this.host.appearance = "light";
    } else if (this.lazy.systemUsesDark == 1) {
      this.host.appearance = "dark";
    } else {
      this.host.appearance = "device";
    }
    this.host.showNativeThemeOption = AppConstants.platform === "linux";
    this.host.deviceAppearance = Services.appinfo
      .contentThemeDerivedColorSchemeIsDark
      ? "dark"
      : "light";
  };
}
