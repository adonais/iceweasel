/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  AddonRepository: "resource://gre/modules/addons/AddonRepository.sys.mjs",
});

/**
 * @typedef {string} ThemesInstallSource
 *   Telemetry source string recorded when a theme is installed (e.g. "about:addons",
 *   "about:newprofile"). Add new values to the
 *   `addons_manager.install.extra_keys.source` description in
 *   `toolkit/mozapps/extensions/metrics.yaml`.
 */

/**
 * @typedef {object} ThemeColorVariant
 * @property {"color" | "gradient"} type - Whether the value is a plain CSS color or a gradient.
 * @property {string} value - The CSS string for this variant.
 */

/**
 * @typedef {object} ThemePickerColors
 * @property {ThemeColorVariant} light - The color variant to use in light mode.
 * @property {ThemeColorVariant} dark - The color variant to use in dark mode.
 */

/**
 * @typedef {object} ThemeListEntry
 * @property {string} id - The addon ID of the theme.
 * @property {boolean} [isBuiltIn] - Whether the theme ships built-in with Firefox.
 * @property {boolean} [showInCompactLayout] - Whether the theme should be shown
 *   in the theme picker's compact layout mode.
 * @property {ThemePickerColors} themePickerColors
 *   The light and dark color or gradient variants representing the theme in the
 *   Firefox Themes Picker UI.
 */

// TODO(Bug 2053215): consider rolling the metadata related to built-in themes that is
// currently still provided by BuiltInThemeConfig.sys.mjs into this module.

// TODO(Bug 2053217): consider moving this metadata into a themes_list.json
// file built into the omni jar and load the data from it (similarly to how
// we manage the list of built-in add-ons through "built_in_addons.json").

/** @type {Array<ThemeListEntry>} */
const FIREFOX_THEMES_LIST = [
  {
    id: "default-theme@mozilla.org",
    isBuiltIn: true,
    showInCompactLayout: true,
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(96deg, #EADDFF 39.84%, #FFDBC5 101.72%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(96deg, #3E315F 39.84%, #701c07 101.72%)",
      },
    },
  },
  {
    id: "nova-sun@mozilla.org",
    showInCompactLayout: true,
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(90deg, #F9F5E6 0%, #FDE8B5 60%, #FBCC77 100%)",
      },
      dark: { type: "color", value: "#270F00" },
    },
  },
  {
    id: "nova-spark@mozilla.org",
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #F8F0EC 0%, #FFDBC5 60%, #FEBD99 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #701C07 0%, #461209 60%, #250E0B 100%)",
      },
    },
  },
  {
    id: "nova-flame@mozilla.org",
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #FCF2F3 0%, #FFD9DF 60%, #FFB6BF 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #69172D 0%, #42121F 60%, #211014 100%)",
      },
    },
  },
  {
    id: "nova-flare@mozilla.org",
    showInCompactLayout: true,
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #F7EFF3 0%, #FFD5EE 60%, #FFB0E2 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #5F1854 0%, #3C1334 60%, #1E111B 100%)",
      },
    },
  },
  {
    id: "nova-lavender@mozilla.org",
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #FAEBFF 0%, #F6D7FF 60%, #E8B7FF 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #4F216B 0%, #311842 60%, #1A1220 100%)",
      },
    },
  },
  {
    id: "nova-dusk@mozilla.org",
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #F5ECFF 0%, #EADDFF 60%, #D4C1FF 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #3E2976 0%, #271C48 60%, #161423 100%)",
      },
    },
  },
  {
    id: "nova-lagoon@mozilla.org",
    showInCompactLayout: true,
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #ECF3F8 0%, #C5EAFE 60%, #A2D3FF 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #23327B 0%, #17214C 60%, #111524 100%)",
      },
    },
  },
  {
    id: "nova-pine@mozilla.org",
    showInCompactLayout: true,
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #ECF4F1 0%, #C4F1E0 60%, #90E3C6 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #004933 0%, #003020 60%, #001E12 100%)",
      },
    },
  },
  {
    id: "nova-tide@mozilla.org",
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #EBF4F5 0%, #C3EEF8 60%, #8FDDF0 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #034554 0%, #002D38 60%, #011C23 100%)",
      },
    },
  },
  {
    id: "nova-ash@mozilla.org",
    showInCompactLayout: true,
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(90deg, #FCFBFF 0%, #EFEDF2 60%, #D6D5DA 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(90deg, #3F3E42 0%, #252428 60%, #171519 100%)",
      },
    },
  },
  {
    id: "nova-smoke@mozilla.org",
    themePickerColors: {
      light: {
        type: "gradient",
        value: "linear-gradient(135deg, #FFF9F6 0%, #FBF4EE 60%, #E3DBD7 100%)",
      },
      dark: {
        type: "gradient",
        value: "linear-gradient(135deg, #3B3532 0%, #2F2926 60%, #201B18 100%)",
      },
    },
  },
];

const FIREFOX_THEMES_MAP = new Map(
  FIREFOX_THEMES_LIST.map(theme => [theme.id, theme])
);

/**
 * Manages the set of Firefox built-in and AMO-hosted themes exposed in the
 * Firefox Themes Picker UI.
 */
class ThemesList {
  #installSource;

  /**
   * @param {object} options
   * @param {ThemesInstallSource} options.installSource
   */
  constructor({ installSource }) {
    this.#installSource = installSource;
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.showInCompactLayout] - If true, only return themes
   *   marked to be shown in the theme picker's compact layout mode.
   * @returns {Array<{id: string, themePickerColors: ThemePickerColors}>}
   *   Array of theme objects with id and themePickerColors.
   */
  getThemesInfo({ showInCompactLayout = false } = {}) {
    let themes = Array.from(FIREFOX_THEMES_MAP.values());
    if (showInCompactLayout) {
      themes = themes.filter(theme => theme.showInCompactLayout);
    }
    return themes.map(({ id, themePickerColors }) => ({
      id,
      themePickerColors,
    }));
  }

  /**
   * @param {string} themeId
   * @returns {boolean} Whether the given ID belongs to a theme managed by this instance.
   */
  hasThemeId(themeId) {
    return FIREFOX_THEMES_MAP.has(themeId);
  }

  /**
   * @param {string} themeId
   * @returns {boolean} Whether the given theme is a Firefox built-in (i.e. ships without
   *   requiring an AMO install).
   */
  isBuiltIn(themeId) {
    return !!FIREFOX_THEMES_MAP.get(themeId)?.isBuiltIn;
  }

  /**
   * @param {string} themeId
   * @returns {string|null} The URL to the bundled theme preview svg file if any
   *  *   (returns null for themes that aren't managed by this module).
   */
  getThemePreviewURL(themeId) {
    if (this.isBuiltIn(themeId) || !this.hasThemeId(themeId)) {
      return null;
    }

    return `resource://extra-themes-previews/${themeId}-preview.svg`;
  }

  /**
   * Enables or disables one of the Firefox Themes managed by this module by its addon ID,
   * installing it from AMO if not yet locally installed.
   *
   * @param {string} themeId - The addon ID of the theme to toggle.
   * @param {boolean} enabled - Whether to enable or disable the theme.
   * @param {AddonInstallListener} [installListener] - Optional listener forwarded to
   *   {@link AddonInstall#addListener} when a download and install is required.
   * @returns {Promise<boolean>} `true` if the request completed successfully, `false` if it
   *   failed or the given `themeId` is not managed by this instance.
   */
  async updateThemeState(themeId, enabled, installListener) {
    if (!this.hasThemeId(themeId)) {
      console.error(
        "ThemesList.updateThemeState can only update themes managed by it"
      );
      return false;
    }

    let install;
    try {
      const addon = await lazy.AddonManager.getAddonByID(themeId);
      if (!enabled) {
        await addon?.disable();
        return true;
      }
      if (addon) {
        await addon.enable();
        return true;
      }

      const [repoAddon] = await lazy.AddonRepository.getAddonsByIDs([themeId]);
      if (!repoAddon?.sourceURI) {
        console.error("Unable to resolve the XPI url for the theme", themeId);
        return false;
      }

      const installUrl = repoAddon.sourceURI.spec;
      const installName = repoAddon.name;

      install = await lazy.AddonManager.getInstallForURL(installUrl, {
        name: installName,
        telemetryInfo: {
          source: this.#installSource,
          method: "FirefoxThemesList",
        },
      });
      if (installListener) {
        install.addListener(installListener);
      }
      const theme = await install.install();
      await theme.enable();
      return true;
    } catch (err) {
      console.error(
        "Error on downloading or installing the theme",
        themeId,
        err
      );
      return false;
    } finally {
      if (installListener) {
        install?.removeListener(installListener);
      }
    }
  }
}

/**
 * Returns a {@link ThemesList} for the given install source.
 *
 * Marked async so callers cannot assume the theme list is synchronously available;
 * the source may move to RemoteSettings in the future (see Bug 1922374).
 *
 * @param {object} options
 * @param {ThemesInstallSource} options.installSource
 * @returns {Promise<ThemesList>}
 */
export async function getThemesList({ installSource }) {
  if (!installSource) {
    throw new Error("getThemesList installSource option is mandatory");
  }
  return new ThemesList({ installSource });
}
