/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { getScreenshotUrlForAddon } from "../aboutaddons-utils.mjs";
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

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#getExtraThemesListManager();
  }

  render() {
    if (this.addon?.type !== "theme") {
      return nothing;
    }

    // Pick theme preview svg bundled into the omni jar
    // if the theme is one of the official extra themes.
    let screenshotUrl = this.#themesListManager?.getThemePreviewURL(
      this.addon.id
    );

    // Use the AMO preview for default-theme and other themes
    // that aren't in the official extra themes set.
    screenshotUrl ??= getScreenshotUrlForAddon(this.addon);

    if (!screenshotUrl) {
      return nothing;
    }
    return html`<img
      class="card-heading-image"
      role="presentation"
      src=${screenshotUrl}
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
