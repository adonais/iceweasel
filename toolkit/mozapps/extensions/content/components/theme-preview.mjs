/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  nothing,
  styleMap,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import {
  DEFAULT_THEME_PREVIEW_NOVA_URL,
  getScreenshotForAddon,
  getThemesModeColorScheme,
} from "../aboutaddons-utils.mjs";
import { isNovaThemesPickerEnabled } from "./aboutaddons-themes-picker.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  // eslint-disable-next-line mozilla/no-browser-refs-in-toolkit
  getThemesList: "moz-src:///browser/themes/ThemesList.sys.mjs",
});

export class ThemePreview extends MozLitElement {
  static properties = {
    addon: { type: Object },
  };

  #themesListManager = null;

  #colorSchemeMediaQuery = window.matchMedia("(-moz-system-dark-theme)");
  #onColorSchemeChange = () => this.requestUpdate();

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#getExtraThemesListManager();
    this.#colorSchemeMediaQuery.addEventListener(
      "change",
      this.#onColorSchemeChange
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#colorSchemeMediaQuery.removeEventListener(
      "change",
      this.#onColorSchemeChange
    );
  }

  render() {
    if (this.addon?.type !== "theme") {
      return nothing;
    }

    // The official extra themes reuse the default theme Nova preview svg
    // bundled into the omni jar, recolored through link-parameters.
    const linkParameters =
      this.#themesListManager?.getThemePreviewLinkParameters(this.addon.id);
    const screenshot = linkParameters
      ? {
          url: DEFAULT_THEME_PREVIEW_NOVA_URL,
          linkParameters,
          colorScheme: getThemesModeColorScheme(),
        }
      : getScreenshotForAddon(this.addon);
    if (!screenshot.url) {
      return nothing;
    }
    return html`<img
      class="card-heading-image"
      role="presentation"
      src=${screenshot.url}
      style=${styleMap({
        colorScheme: screenshot.colorScheme,
        linkParameters: screenshot.linkParameters,
      })}
    />`;
  }

  #getExtraThemesListManager() {
    if (!isNovaThemesPickerEnabled()) {
      // Skip fetching custom theme preview SVGs via Desktop-only
      // ThemesList.sys.mjs module when the Nova Themes Picker UI
      // is disabled (the about:config pref gating the Nova Themes
      // Picker UI, `browser.aboutaddons.novaThemesPickerEnabled`,
      // is set to false at toolkit-level and enabled in Firefox
      // Desktop builds where the ThemesList.sys.mjs module is
      // actually available)
      //
      // NOTE: on builds where that is the case, the preview image
      // for the Nova themes hosted on AMO falls back to the AMO
      // API's png, which only covers light mode and won't switch
      // with dark/light theme mode changes like the SVG bundled
      // in the Firefox omni jar does.
      return;
    }

    lazy
      .getThemesList({ installSource: "about:addons" })
      .then(themesListManager => {
        this.#themesListManager = themesListManager;
        this.requestUpdate();
      });
  }
}
customElements.define("theme-preview", ThemePreview);
