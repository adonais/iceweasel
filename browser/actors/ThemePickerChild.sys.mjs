/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * JSWindowActor child for theme-picker component. Handles communication between
 * unprivileged content (ThemePickerRemoteController) and the privileged parent
 * process via custom events and sendQuery.
 */
export class ThemePickerChild extends JSWindowActorChild {
  actorCreated() {
    Services.obs.addObserver(this.lookAndFeelChanged, "look-and-feel-changed");
  }

  didDestroy() {
    Services.obs.removeObserver(
      this.lookAndFeelChanged,
      "look-and-feel-changed"
    );
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

  async handleEvent(event) {
    const target = event.composedTarget;

    switch (event.type) {
      case "ThemePickerGetInitialState": {
        const result = await this.sendQuery(
          "ThemePicker:GetInitialState",
          event.detail
        );
        this.sendToWidget(target, "ThemePickerInitialState", result);
        break;
      }
      case "ThemePickerUpdateTheme": {
        const result = await this.sendQuery(
          "ThemePicker:UpdateTheme",
          event.detail
        );
        this.sendToWidget(target, "ThemePickerThemeUpdated", result);
        break;
      }
      case "ThemePickerUpdateAppearance": {
        const result = await this.sendQuery(
          "ThemePicker:UpdateAppearance",
          event.detail
        );
        this.sendToWidget(target, "ThemePickerAppearanceUpdated", result);
        break;
      }
      case "ThemePickerUpdateNativeTheme": {
        const result = await this.sendQuery(
          "ThemePicker:UpdateNativeTheme",
          event.detail
        );
        this.sendToWidget(target, "ThemePickerNativeThemeUpdated", result);
        break;
      }
    }
  }

  sendToWidget(target, eventName, detail) {
    const win = target.documentGlobal;
    target.dispatchEvent(
      new win.CustomEvent(eventName, {
        bubbles: true,
        composed: true,
        detail: Cu.cloneInto(detail, win),
      })
    );
  }
}
