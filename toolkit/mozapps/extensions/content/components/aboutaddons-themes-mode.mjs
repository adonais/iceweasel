/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const PREF_SYSTEM_USES_DARK = "ui.systemUsesDarkTheme";

const ICON_LIGHT = "chrome://global/skin/icons/sun.svg";
const ICON_DARK = "chrome://global/skin/icons/moon.svg";
const ICON_DEVICE = "chrome://global/skin/icons/local-host.svg";

// TODO(Bug 2053873): in the long term we'd like to replacing this domain specific
// webcomponent with a reusable component shared with the theme-picker.

export class ThemeAppearanceMode extends MozLitElement {
  static properties = {
    value: { type: String },
  };

  #prefObserver = {
    observe: () => this.#updateFromPref(),
    QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
  };

  constructor() {
    super();
    this.value = "device";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#updateFromPref();
    Services.prefs.addObserver(PREF_SYSTEM_USES_DARK, this.#prefObserver);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    Services.prefs.removeObserver(PREF_SYSTEM_USES_DARK, this.#prefObserver);
  }

  #updateFromPref() {
    switch (Services.prefs.getIntPref(PREF_SYSTEM_USES_DARK, -1)) {
      case 0:
        this.value = "light";
        break;
      case 1:
        this.value = "dark";
        break;
      default:
        this.value = "device";
    }
  }

  #onChange(e) {
    const appearance = e.target.value;
    if (appearance === "device") {
      Services.prefs.clearUserPref(PREF_SYSTEM_USES_DARK);
    } else {
      Services.prefs.setIntPref(
        PREF_SYSTEM_USES_DARK,
        appearance === "light" ? 0 : 1
      );
    }
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://mozapps/content/extensions/components/aboutaddons-themes-mode.css"
      />
      <moz-segmented-control .value=${this.value} @change=${this.#onChange}>
        <moz-segmented-control-item
          size="small"
          value="light"
          data-l10n-id="themes-mode-light"
          .iconSrc=${ICON_LIGHT}
        ></moz-segmented-control-item>
        <moz-segmented-control-item
          size="small"
          value="dark"
          data-l10n-id="themes-mode-dark"
          .iconSrc=${ICON_DARK}
        ></moz-segmented-control-item>
        <moz-segmented-control-item
          size="small"
          value="device"
          data-l10n-id="themes-mode-device"
          .iconSrc=${ICON_DEVICE}
        ></moz-segmented-control-item>
      </moz-segmented-control>
    `;
  }
}
customElements.define("aboutaddons-themes-mode", ThemeAppearanceMode);
