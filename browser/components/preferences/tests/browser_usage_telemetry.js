/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function testSettingGroupTelemetry() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:preferences",
    },
    async () => {
      let win = gBrowser.selectedBrowser.contentWindow;
      let doc = win.document;

      win.Preferences.addSetting({
        id: "test-checkbox",
        get: () => false,
        set: () => {},
      });
      win.Preferences.addSetting({
        id: "test-radio",
        get: () => "one",
        set: () => {},
      });
      win.Preferences.addSetting({
        id: "test-select",
        get: () => "one",
        set: () => {},
      });
      win.Preferences.addSetting({
        id: "test-button",
      });

      let group = doc.createElement("setting-group");
      group.groupId = "testing";
      group.config = {
        id: "testingGroup",
        items: [
          {
            id: "test-checkbox",
            l10nId: "httpsonly-radio-disabled3",
          },
          {
            id: "test-radio",
            l10nId: "httpsonly-radio-disabled3",
            control: "moz-radio-group",
            optionControl: "moz-radio",
            options: [
              {
                id: "test-radio-one",
                l10nId: "httpsonly-radio-disabled3",
                value: "one",
              },
              {
                id: "test-radio-two",
                l10nId: "httpsonly-radio-disabled3",
                value: "two",
                items: [
                  {
                    id: "test-button",
                    l10nId: "httpsonly-radio-enabled-pbm",
                    control: "moz-button",
                  },
                ],
              },
            ],
          },
          {
            id: "test-select",
            l10nId: "httpsonly-radio-disabled3",
            control: "moz-select",
            optionControl: "moz-option",
            options: [
              {
                id: "test-select-one",
                l10nId: "httpsonly-radio-enabled-pbm",
                value: "one",
              },
              {
                id: "test-select-two",
                l10nId: "httpsonly-radio-enabled-pbm",
                value: "two",
              },
            ],
          },
        ],
      };
      group.getSetting = win.Preferences.getSetting.bind(win.Preferences);
      group.dataset.category = "paneGeneral";
      doc.body.append(group);

      // Ensure all elements have updated.
      await new Promise(r => win.requestAnimationFrame(r));

      let checkbox = doc.getElementById("test-checkbox");
      EventUtils.synthesizeMouseAtCenter(checkbox.inputEl, {}, win);
      EventUtils.synthesizeMouseAtCenter(checkbox.labelEl, {}, win);
      EventUtils.synthesizeMouseAtCenter(checkbox.descriptionEl, {}, win);

      let button = doc.getElementById("test-button");
      is(button.buttonEl.disabled, true, "button is disabled");
      let radio = doc.getElementById("test-radio-two");
      EventUtils.synthesizeMouseAtCenter(radio.inputEl, {}, win);
      EventUtils.synthesizeMouseAtCenter(radio.descriptionEl, {}, win);

      // Ensure the button disabled state updated.
      await new Promise(r => win.requestAnimationFrame(r));

      is(button.buttonEl.disabled, false, "button is enabled");
      EventUtils.synthesizeMouseAtCenter(button, {}, win);

      let select = doc.getElementById("test-select");
      let popupShown = BrowserTestUtils.waitForSelectPopupShown(window);
      EventUtils.synthesizeMouseAtCenter(select.inputEl, {}, win);
      let popup = await popupShown;
      let popupHidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
      EventUtils.synthesizeKey("KEY_ArrowDown", {}, win);
      EventUtils.synthesizeKey("KEY_Enter", {}, win);
      await popupHidden;

      // Check that telemetry appeared:
      const { TelemetryTestUtils } = ChromeUtils.importESModule(
        "resource://testing-common/TelemetryTestUtils.sys.mjs"
      );
      let snapshot = TelemetryTestUtils.getProcessScalars("parent", true, true);
      TelemetryTestUtils.assertKeyedScalar(
        snapshot,
        "browser.ui.interaction.preferences_paneGeneral",
        "test-checkbox",
        2 // input and label clicked
      );
      TelemetryTestUtils.assertKeyedScalar(
        snapshot,
        "browser.ui.interaction.preferences_paneGeneral",
        "test-radio-two",
        1 // only input clicked
      );
      TelemetryTestUtils.assertKeyedScalar(
        snapshot,
        "browser.ui.interaction.preferences_paneGeneral",
        "test-button",
        1
      );
      TelemetryTestUtils.assertKeyedScalar(
        snapshot,
        "browser.ui.interaction.preferences_paneGeneral",
        "test-select",
        1
      );
    }
  );
});
