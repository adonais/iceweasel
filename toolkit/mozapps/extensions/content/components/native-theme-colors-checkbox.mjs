/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { isBrowserNovaEnabled } from "../aboutaddons-utils.mjs";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const PREF_NATIVE_THEME = "browser.theme.native-theme";
const DEFAULT_THEME_ID = "default-theme@mozilla.org";

/**
 * Whether the native theme colors checkbox should be shown in the addon-card
 * related to the given add-on.
 */
export function shouldShowNativeThemeCheckbox(addon) {
  return (
    isBrowserNovaEnabled() &&
    AppConstants.platform === "linux" &&
    addon?.id === DEFAULT_THEME_ID
  );
}

/**
 * Checkbox shown below the enabled default theme's addon-card on Linux, to
 * opt into matching the GTK/system theme colors instead of the built-in
 * default theme colors. Ancestor components (addon-card and addon-details)
 * are responsible for showing this element (based on the result got from
 * shouldShowNativeThemeCheckbox).
 */
export class NativeThemeColorsCheckbox extends MozLitElement {
  static properties = {
    checked: { state: true },
    hidden: { type: Boolean, reflect: true },
  };

  #prefObserver = {
    observe: () => this.#updateFromPref(),
    QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
  };

  #observing = false;

  constructor() {
    super();
    this.checked = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hidden) {
      this.#startObserving();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopObserving();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has("hidden")) {
      if (this.hidden) {
        this.#stopObserving();
      } else {
        this.#startObserving();
      }
    }
  }

  #startObserving() {
    if (this.#observing || !this.isConnected) {
      return;
    }
    this.#observing = true;
    this.#updateFromPref();
    Services.prefs.addObserver(PREF_NATIVE_THEME, this.#prefObserver);
  }

  #stopObserving() {
    if (!this.#observing) {
      return;
    }
    this.#observing = false;
    Services.prefs.removeObserver(PREF_NATIVE_THEME, this.#prefObserver);
  }

  #updateFromPref() {
    this.checked = Services.prefs.getBoolPref(PREF_NATIVE_THEME, false);
  }

  #onChange(e) {
    Services.prefs.setBoolPref(PREF_NATIVE_THEME, e.target.checked);
  }

  render() {
    if (this.hidden) {
      return nothing;
    }
    return html`
      <link
        rel="stylesheet"
        href="chrome://mozapps/content/extensions/components/native-theme-colors-checkbox.css"
      />
      <moz-checkbox
        data-l10n-id="aboutaddons-linux-theme-colors-checkbox-label"
        ?checked=${this.checked}
        @change=${this.#onChange}
      ></moz-checkbox>
    `;
  }
}
customElements.define(
  "native-theme-colors-checkbox",
  NativeThemeColorsCheckbox
);
