/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  WindowsVersionInfo:
    "resource://gre/modules/components-utils/WindowsVersionInfo.sys.mjs",
  ICON_CATALOG: "moz-src:///browser/components/shell/CustomIconManager.sys.mjs",
  resolvePreview:
    "moz-src:///browser/components/shell/CustomIconManager.sys.mjs",
});

const PREF_ICON_ID = "browser.shell.customIcon.id";

const FORCED_COLORS_QUERY = matchMedia("(forced-colors)");
// The readout thumbnail follows this (chrome) document's color scheme, so a
// theme-aware icon shows the variant matching the surface it's previewed on.
const COLOR_SCHEME_QUERY = matchMedia("(prefers-color-scheme: dark)");

// browser.uidensity mode values are defined by gUIDensity in browser.js;
// reference them through the chrome window so the two stay in sync.
function getUIDensity() {
  // @ts-ignore topChromeWindow global
  return window.browsingContext.topChromeWindow.gUIDensity;
}

const isWindows = AppConstants.platform == "win";
// The auto-touch-mode checkbox is only offered on Windows 10 and Linux; Windows
// 11 manages tablet mode differently and macOS has no touch density.
function isAutoTouchModeAvailable() {
  if (AppConstants.MOZ_WIDGET_GTK) {
    return true;
  }
  return (
    isWindows &&
    lazy.WindowsVersionInfo.get({ throwOnError: false }).buildNumber < 22000
  );
}

// The custom browser-icon picker is gated behind a feature pref, is
// Windows-only, and is not yet offered on MSIX builds.
function isBrowserIconAvailable() {
  return (
    isWindows &&
    Services.prefs.getBoolPref("browser.shell.customIcon.enabled", false) &&
    !Services.sysinfo.getProperty("hasWinPackageId")
  );
}

Preferences.addAll([
  { id: "layout.css.prefers-color-scheme.content-override", type: "int" },
  { id: "browser.uidensity", type: "int" },
  { id: "browser.touchmode.auto", type: "bool" },
]);

Preferences.addSetting({
  id: "web-appearance-override-warning",
  setup: emitChange => {
    FORCED_COLORS_QUERY.addEventListener("change", emitChange);
    return () => FORCED_COLORS_QUERY.removeEventListener("change", emitChange);
  },
  visible: () => {
    return FORCED_COLORS_QUERY.matches;
  },
});

Preferences.addSetting(
  /** @type {{ themeNames: string[] } & SettingConfig}} */ ({
    id: "web-appearance-chooser",
    themeNames: ["dark", "light", "auto"],
    pref: "layout.css.prefers-color-scheme.content-override",
    setup(emitChange) {
      Services.obs.addObserver(emitChange, "look-and-feel-changed");
      return () =>
        Services.obs.removeObserver(emitChange, "look-and-feel-changed");
    },
    get(val, _, setting) {
      return (
        this.themeNames[val] ||
        this.themeNames[/** @type {number} */ (setting.pref.defaultValue)]
      );
    },
    /** @param {string} val */
    set(val) {
      return this.themeNames.indexOf(val);
    },
    getControlConfig(config) {
      // Set the auto theme image to the light/dark that matches.
      let systemThemeIndex = Services.appinfo
        .contentThemeDerivedColorSchemeIsDark
        ? 2
        : 1;
      config.options[0].controlAttrs = {
        ...config.options[0].controlAttrs,
        imagesrc: config.options[systemThemeIndex].controlAttrs.imagesrc,
      };
      return config;
    },
  })
);

Preferences.addSetting({
  id: "web-appearance-manage-themes-link",
  onUserClick: e => {
    e.preventDefault();
    // @ts-ignore topChromeWindow global
    window.browsingContext.topChromeWindow.BrowserAddonUI.openAddonsMgr(
      "addons://list/theme"
    );
  },
});

Preferences.addSetting({
  id: "related-settings-accessibility-link",
  onUserClick: e => {
    e.preventDefault();
    window.gotoPref("paneAccessibility");
  },
});

Preferences.addSetting({
  id: "related-settings-home-link",
  onUserClick: e => {
    e.preventDefault();
    window.gotoPref("paneHome");
  },
});

Preferences.addSetting({
  id: "related-settings-tabs-browsing-link",
  onUserClick: e => {
    e.preventDefault();
    window.gotoPref("paneTabsBrowsing-layout");
  },
});

Preferences.addSetting({ id: "relatedSettingsBoxGroup" });

// Tracks the browser.uidensity pref so the uiDensity radio group re-renders
// when the density changes (including via clearUserPref for the automatic
// option).
Preferences.addSetting({
  id: "uiDensityPref",
  pref: "browser.uidensity",
});

// The "Use touch spacing" checkbox nested under the Standard option, controlling
// whether the browser automatically switches to the touch density in tablet
// mode.
Preferences.addSetting({
  id: "uiDensityAutoTouchMode",
  pref: "browser.touchmode.auto",
  visible: () => isAutoTouchModeAvailable(),
});

Preferences.addSetting({
  id: "uiDensity",
  deps: ["uiDensityPref"],
  visible: () => Services.prefs.getBoolPref("browser.nova.enabled", false),
  // Map the browser.uidensity pref to one of the radio options. When the pref
  // has no user value, gUIDensity (see browser.js) chooses the density
  // automatically: small windows are auto-compacted based on
  // browser.compactmode.auto.threshold and tablet mode switches to touch. An
  // explicit user value pins the density to the matching option, so users who
  // opted into compact or touch before Nova keep that choice rather than
  // reverting to automatic.
  get(_, { uiDensityPref }) {
    if (!uiDensityPref.pref.hasUserValue) {
      return "auto";
    }
    let gUIDensity = getUIDensity();
    switch (uiDensityPref.value) {
      case gUIDensity.MODE_COMPACT:
        return "compact";
      case gUIDensity.MODE_TOUCH:
        return "touch";
      default:
        return "standard";
    }
  },
  set(val, { uiDensityPref }) {
    let { id } = uiDensityPref.pref;
    let gUIDensity = getUIDensity();
    // For an explicit choice, go through gUIDensity.setUIDensity so that any
    // active density override (e.g. touch forced by tablet mode) is cleared,
    // matching the Customize panel.
    switch (val) {
      case "auto":
        Services.prefs.clearUserPref(id);
        break;
      case "compact":
        gUIDensity.setUIDensity(gUIDensity.MODE_COMPACT);
        break;
      case "touch":
        gUIDensity.setUIDensity(gUIDensity.MODE_TOUCH);
        break;
      default:
        gUIDensity.setUIDensity(gUIDensity.MODE_NORMAL);
        break;
    }
  },
});

Preferences.addSetting({
  id: "browser-icon-button",
  onUserClick: e => {
    e.preventDefault();
    window.gotoPref("browserIcon");
  },
});

Preferences.addSetting({
  id: "browser-icon-box-group",
  visible: () => isBrowserIconAvailable(),
});

// Non-interactive readout of the currently selected browser icon (label +
// thumbnail), shown above the "Change browser icon" button. Reads the active
// icon from the catalog so the strings/preview stay in one place; re-renders
// when the pref changes (including from the sub-pane picker).
Preferences.addSetting({
  id: "current-browser-icon",
  setup(emitChange) {
    let observer = () => emitChange();
    Services.prefs.addObserver(PREF_ICON_ID, observer);
    COLOR_SCHEME_QUERY.addEventListener("change", emitChange);
    return () => {
      Services.prefs.removeObserver(PREF_ICON_ID, observer);
      COLOR_SCHEME_QUERY.removeEventListener("change", emitChange);
    };
  },
  getControlConfig(config) {
    if (!isBrowserIconAvailable()) {
      return config;
    }
    let id = Services.prefs.getStringPref(PREF_ICON_ID, "");
    // An unset/unknown pref is the "default" (no-override) state, which is
    // itself a catalog entry, so the label/preview come from the catalog.
    let entry = lazy.ICON_CATALOG[id] || lazy.ICON_CATALOG.default;
    let scheme = COLOR_SCHEME_QUERY.matches ? "dark" : "light";
    return {
      ...config,
      l10nId: entry.l10nId,
      iconSrc: lazy.resolvePreview(entry, scheme),
    };
  },
});

SettingGroupManager.registerGroups({
  appearance: {
    l10nId: "appearance-group2",
    iconSrc: "chrome://global/skin/icons/defaultFavicon.svg",
    headingLevel: 2,
    items: [
      {
        id: "web-appearance-override-warning",
        l10nId: "preferences-web-appearance-override-warning3",
        control: "moz-message-bar",
        controlAttrs: {
          role: "status",
        },
      },
      {
        id: "web-appearance-chooser",
        control: "moz-visual-picker",
        options: [
          {
            value: "auto",
            l10nId: "preferences-web-appearance-choice-auto3",
            controlAttrs: {
              id: "preferences-web-appearance-choice-auto",
              class: "setting-chooser-item",
              imagesrc:
                "chrome://browser/content/preferences/web-appearance-light.svg",
            },
          },
          {
            value: "light",
            l10nId: "preferences-web-appearance-choice-light2",
            controlAttrs: {
              id: "preferences-web-appearance-choice-light",
              class: "setting-chooser-item",
              imagesrc:
                "chrome://browser/content/preferences/web-appearance-light.svg",
            },
          },
          {
            value: "dark",
            l10nId: "preferences-web-appearance-choice-dark2",
            controlAttrs: {
              id: "preferences-web-appearance-choice-dark",
              class: "setting-chooser-item",
              imagesrc:
                "chrome://browser/content/preferences/web-appearance-dark.svg",
            },
          },
        ],
      },
    ],
  },
  windowDensity: {
    l10nId: "appearance-window-density-group",
    iconSrc: "chrome://browser/skin/window.svg",
    headingLevel: 2,
    subcategory: "windowDensity",
    items: [
      {
        id: "uiDensity",
        control: "moz-radio-group",
        l10nId: "appearance-window-density-radio-group",
        options: [
          {
            value: "auto",
            // Touch spacing is only applied automatically (in tablet mode)
            // where auto-touch-mode is available, so reflect that in the
            // description.
            l10nId: isAutoTouchModeAvailable()
              ? "appearance-window-density-automatic"
              : "appearance-window-density-automatic-no-touch",
          },
          {
            value: "standard",
            l10nId: "appearance-window-density-standard",
            items: [
              {
                id: "uiDensityAutoTouchMode",
                control: "moz-checkbox",
                l10nId: "appearance-window-density-auto-touch-mode",
              },
            ],
          },
          {
            value: "compact",
            l10nId: "appearance-window-density-compact",
          },
          {
            value: "touch",
            l10nId: "appearance-window-density-touch",
          },
        ],
      },
    ],
  },
  browserTheme: {
    l10nId: "browser-theme-group",
    iconSrc: "chrome://browser/skin/customize.svg",
    headingLevel: 2,
    items: [
      {
        id: "web-appearance-manage-themes-link",
        l10nId: "browser-theme-manage-link",
        control: "moz-box-link",
        controlAttrs: {
          href: "about:addons",
        },
      },
    ],
  },
  browserIconEntry: {
    l10nId: "appearance-browser-icon-entry-group",
    iconSrc: "chrome://browser/skin/sidebar/firefox.svg",
    headingLevel: 2,
    controlAttrs: { badge: "new" },
    items: [
      {
        id: "browser-icon-box-group",
        control: "moz-box-group",
        items: [
          {
            id: "current-browser-icon",
            control: "moz-box-item",
            controlAttrs: { layout: "large-icon" },
          },
          {
            id: "browser-icon-button",
            l10nId: "appearance-browser-icon-button",
            control: "moz-box-button",
            loadPane: "browserIcon",
          },
        ],
      },
    ],
  },
  relatedSettings: {
    l10nId: "related-settings-group",
    headingLevel: 2,
    items: [
      {
        id: "relatedSettingsBoxGroup",
        control: "moz-box-group",
        items: [
          {
            id: "related-settings-accessibility-link",
            l10nId: "related-settings-accessibility-link",
            control: "moz-box-link",
            controlAttrs: {
              href: "about:preferences#accessibility",
            },
          },
          {
            id: "related-settings-home-link",
            l10nId: "related-settings-home-link",
            control: "moz-box-link",
            controlAttrs: {
              href: "about:preferences#home",
            },
          },
          {
            id: "related-settings-tabs-browsing-link",
            l10nId: "related-settings-tabs-browsing-link",
            control: "moz-box-link",
            controlAttrs: {
              href: "about:preferences#tabsBrowsing",
            },
          },
        ],
      },
    ],
  },
});
