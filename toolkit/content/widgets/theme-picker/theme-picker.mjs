/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.MozXULElement?.insertFTLIfNeeded("toolkit/global/theme-picker.ftl");

import { html, styleMap } from "../vendor/lit.all.mjs";
import { MozLitElement } from "../lit-utils.mjs";
import { ThemePickerStorybookController } from "chrome://global/content/elements/theme-picker-storybook-controller.mjs";
import { ThemePickerRemoteController } from "chrome://global/content/elements/theme-picker-remote-controller.mjs";

/**
 * @import { ThemePickerDirectController } from "chrome://global/content/elements/theme-picker-direct-controller.mjs"
 */

const THEME_L10N_IDS = {
  "default-theme@mozilla.org": "theme-picker-default",
  "nova-sun@mozilla.org": "theme-picker-sun",
  "nova-spark@mozilla.org": "theme-picker-spark",
  "nova-flame@mozilla.org": "theme-picker-flame",
  "nova-flare@mozilla.org": "theme-picker-flare",
  "nova-lavender@mozilla.org": "theme-picker-lavender",
  "nova-dusk@mozilla.org": "theme-picker-dusk",
  "nova-lagoon@mozilla.org": "theme-picker-lagoon",
  "nova-pine@mozilla.org": "theme-picker-pine",
  "nova-tide@mozilla.org": "theme-picker-tide",
  "nova-ash@mozilla.org": "theme-picker-ash",
  "nova-smoke@mozilla.org": "theme-picker-smoke",
};

/** @type {typeof ThemePickerDirectController | null} */
let ThemePickerDirectControllerClass = null;
function getThemePickerController() {
  if (window.IS_STORYBOOK) {
    return ThemePickerStorybookController;
  }
  if (typeof ChromeUtils !== "undefined") {
    if (!ThemePickerDirectControllerClass) {
      ThemePickerDirectControllerClass = ChromeUtils.importESModule(
        "chrome://global/content/elements/theme-picker-direct-controller.mjs",
        { global: "current" }
      ).ThemePickerDirectController;
    }
    return ThemePickerDirectControllerClass;
  }
  return ThemePickerRemoteController;
}

const DEFAULT_THEME_ID = "default-theme@mozilla.org";

/**
 * @import { ReactiveController } from "chrome://global/content/vendor/lit.all.mjs";
 */

/**
 * @typedef {object} ThemePickerTheme
 * @property {string} id
 * @property {{ light: { type: string, value: string }, dark: { type: string, value: string } } | null} themePickerColors
 */

/**
 * @typedef {"appearance"|"theme"|"nativeTheme"} ThemechangeProperty
 * @typedef {{ property: ThemechangeProperty, value: string|boolean }} ThemechangeEventDetail
 */

/**
 * @typedef {CustomEvent & { detail: ThemechangeEventDetail }} ThemechangeEvent
 */

/**
 * A component for selecting and managing Firefox themes. Displays theme color
 * swatches and optionally appearance mode controls (light/dark/device).
 *
 * @tagname theme-picker
 * @property {string} appearance
 *   Current appearance mode: "light", "dark", or "device"
 * @property {string} activeThemeId - The addon ID of the currently active theme
 * @property {boolean} nativeTheme - Whether native theme styling is enabled
 * @property {ThemePickerTheme[]} themes
 *   Array of theme objects with IDs and picker colors
 * @property {string} layout
 *   Display layout: "full" (with mode selector and native theme checkbox) or
 *   "compact" (color swatches only)
 * @property {boolean} showLabels
 *   Whether to show visible text labels outside the theme swatches. When false,
 *   aria-labels are provided for accessibility.
 * @property {boolean} showNativeThemeOption
 *   Whether to show the native theme checkbox. Only applies on Linux.
 * @property {string} deviceAppearance
 *   The device's system appearance: "light" or "dark". Used to display the
 *   correct theme colors when appearance is set to "device".
 * @fires themechange - Fired when appearance, theme, or nativeTheme changes.
 * Detail contains {property, value}
 */
export class ThemePicker extends MozLitElement {
  static properties = {
    appearance: { type: String },
    activeThemeId: { type: String },
    nativeTheme: { type: Boolean },
    themes: { type: Array },
    layout: { type: String },
    showLabels: { type: Boolean },
    showNativeThemeOption: { type: Boolean },
    deviceAppearance: { type: String },
  };

  static queries = {
    pickerEl: "moz-visual-picker",
  };

  constructor() {
    super();
    this.appearance = "device";
    this.activeThemeId = DEFAULT_THEME_ID;
    /** @type {ThemePickerTheme[]} */
    this.themes = [];
    this.nativeTheme = false;
    this.showLabels = true;
    this.controller = ThemePicker.createController(this);
    this.layout = "full";
    this.showNativeThemeOption = false;
    this.deviceAppearance = "light";
  }

  /**
   * Builds the ReactiveController backing this picker: the lightweight
   * storybook controller when platform APIs are unavailable (e.g. Storybook),
   * the remote controller for unprivileged contexts (e.g. about:editprofile,
   * about:welcome),
   * and otherwise the direct controller that talks to AddonManager and prefs.
   * Overridable so tests can exercise a specific controller.
   *
   * @param {ThemePicker} host
   * @returns {ReactiveController}
   */
  static createController(host) {
    return new (getThemePickerController())(host);
  }

  /**
   * @param {ThemechangeProperty} property
   * @param {string|boolean} value
   */
  dispatchChange(property, value) {
    this.dispatchEvent(
      new CustomEvent("themechange", {
        bubbles: true,
        composed: true,
        detail: { property, value },
      })
    );
  }

  /**
   * @param {Event & { target: { value: string } }} e
   */
  appearanceChange(e) {
    this.dispatchChange("appearance", e.target.value);
  }

  /**
   * @param {Event & { target: { value: string } }} e
   */
  themeChange(e) {
    this.dispatchChange("theme", e.target.value);
  }

  /**
   * @param {Event & { target: { checked: boolean } }} e
   */
  nativeThemeChange(e) {
    this.dispatchChange("nativeTheme", e.target.checked);
  }

  /**
   * @param {ThemePickerTheme} theme
   */
  themeStyle(theme) {
    let effectiveAppearance =
      this.appearance === "device" ? this.deviceAppearance : this.appearance;
    let colors =
      effectiveAppearance === "dark"
        ? theme.themePickerColors.dark
        : theme.themePickerColors.light;
    return styleMap({
      [colors.type == "gradient" ? "backgroundImage" : "backgroundColor"]:
        colors.value,
    });
  }

  appearanceChooserTemplate() {
    if (this.layout == "compact") {
      return "";
    }
    const icons = {
      light: "chrome://global/skin/icons/sun.svg",
      dark: "chrome://global/skin/icons/moon.svg",
      device: "chrome://global/skin/icons/local-host.svg",
    };
    return html`<moz-segmented-control
      .value=${this.appearance}
      @change=${this.appearanceChange}
    >
      <moz-segmented-control-item
        data-l10n-id="theme-picker-mode-light"
        value="light"
        .iconSrc=${icons.light}
      ></moz-segmented-control-item>
      <moz-segmented-control-item
        data-l10n-id="theme-picker-mode-dark"
        value="dark"
        .iconSrc=${icons.dark}
      ></moz-segmented-control-item>
      <moz-segmented-control-item
        data-l10n-id="theme-picker-mode-device"
        value="device"
        .iconSrc=${icons.device}
      ></moz-segmented-control-item>
    </moz-segmented-control>`;
  }

  defaultThemeTemplate() {
    if (this.layout == "compact" || !this.showNativeThemeOption) {
      return "";
    }
    return html`<moz-checkbox
      data-l10n-id="theme-picker-use-linux-theme"
      ?checked=${this.nativeTheme}
      ?disabled=${this.activeThemeId != DEFAULT_THEME_ID}
      @change=${this.nativeThemeChange}
    ></moz-checkbox>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://global/content/elements/theme-picker.css"
      />
      ${this.appearanceChooserTemplate()}
      <moz-visual-picker
        type="listbox"
        .value=${this.activeThemeId}
        @change=${this.themeChange}
      >
        ${this.themes.map(theme => {
          const baseL10nId = THEME_L10N_IDS[theme.id];
          return html`<moz-visual-picker-item
            value=${theme.id}
            labelposition="outside"
            data-l10n-id=${this.showLabels
              ? baseL10nId
              : `${baseL10nId}-aria-label`}
            ><span class="theme-preview" style=${this.themeStyle(theme)}></span
          ></moz-visual-picker-item>`;
        })}
      </moz-visual-picker>
      ${this.defaultThemeTemplate()}
    `;
  }
}
customElements.define("theme-picker", ThemePicker);
