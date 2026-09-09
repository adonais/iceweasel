/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import { ReactiveController } from "chrome://global/content/vendor/lit.all.mjs";
 * @import { ThemePicker, ThemechangeEvent, ThemechangeEventDetail } from "./theme-picker.mjs";
 */

const WINDOW_EVENTS = [
  "ThemePickerThemeUpdated",
  "ThemePickerAppearanceUpdated",
  "ThemePickerNativeThemeUpdated",
  "ThemePickerDeviceAppearanceUpdated",
];

/**
 * RemoteController for ThemePicker that communicates with the parent process
 * via JSWindowActor messages instead of directly accessing AddonManager and
 * Services.prefs.
 *
 * Used in unprivileged content contexts like about:editprofile where direct
 * access to platform APIs is not available.
 *
 * @implements {ReactiveController}
 */
export class ThemePickerRemoteController {
  host;

  /**
   * @param {ThemePicker} host
   */
  constructor(host) {
    this.host = host;
    this.host.addController(this);

    this.host.addEventListener("ThemePickerInitialState", this);

    this.host.addEventListener(
      "themechange",
      /** @param {ThemechangeEvent} e */
      e => this.onThemechange(e.detail)
    );

    for (const eventType of WINDOW_EVENTS) {
      window.addEventListener(eventType, this);
    }
  }

  hostDisconnected() {
    for (const eventType of WINDOW_EVENTS) {
      window.removeEventListener(eventType, this);
    }
  }

  hostConnected() {
    this.dispatchActorEvent("ThemePickerGetInitialState", {
      installSource: this.host.getAttribute("installsource") || "unknown",
      showInCompactLayout: this.host.layout === "compact",
    });
  }

  /**
   * Dispatch an event to the document for the actor to handle.
   *
   * @param {string} eventType - The event type to dispatch
   * @param {object} detail - Event detail data
   */
  dispatchActorEvent(eventType, detail) {
    this.host.dispatchEvent(
      new CustomEvent(eventType, {
        bubbles: true,
        composed: true,
        detail,
      })
    );
  }

  handleEvent(event) {
    switch (event.type) {
      case "ThemePickerInitialState":
        this.host.themes = event.detail.themes;
        this.host.activeThemeId = event.detail.activeThemeId;
        this.host.nativeTheme = event.detail.nativeTheme;
        this.host.appearance = event.detail.appearance;
        this.host.showNativeThemeOption = event.detail.showNativeThemeOption;
        this.host.deviceAppearance = event.detail.deviceAppearance;
        break;
      case "ThemePickerThemeUpdated":
        this.host.activeThemeId = event.detail.activeThemeId;
        break;
      case "ThemePickerAppearanceUpdated":
        this.host.appearance = event.detail.appearance;
        break;
      case "ThemePickerNativeThemeUpdated":
        this.host.nativeTheme = event.detail.nativeTheme;
        break;
      case "ThemePickerDeviceAppearanceUpdated":
        this.host.deviceAppearance = event.detail.deviceAppearance;
        break;
    }
  }

  /**
   * @param {ThemechangeEventDetail} detail
   */
  onThemechange({ property, value }) {
    switch (property) {
      case "theme":
        this.dispatchActorEvent("ThemePickerUpdateTheme", {
          themeId: String(value),
        });
        break;
      case "appearance":
        this.dispatchActorEvent("ThemePickerUpdateAppearance", {
          appearance: value,
        });
        break;
      case "nativeTheme":
        this.dispatchActorEvent("ThemePickerUpdateNativeTheme", {
          nativeTheme: Boolean(value),
        });
        break;
    }
  }
}
