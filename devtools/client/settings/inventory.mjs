/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import { SettingSection, SettingChangeHandler } from "./types/inventory.d.ts" */

/** @type {ReadonlyArray<SettingSection>} */
export const inventory = [
  {
    id: "settings-toolbox-buttons",
    l10nId: "devtools-settings-toolbox-buttons",
    settings: [
      {
        id: "settings-toolbox-rulers",
        l10nId: "devtools-settings-toolbox-rulers",
        type: "boolean",
        pref: "devtools.command-button-rulers.enabled",
        changeAction: "updateToolboxButtons",
      },
      {
        id: "settings-toolbox-screenshot",
        l10nId: "devtools-settings-toolbox-screenshot",
        type: "boolean",
        pref: "devtools.command-button-screenshot.enabled",
        changeAction: "updateToolboxButtons",
      },
    ],
  },
  {
    id: "settings-styleeditor",
    l10nId: "devtools-settings-styleeditor",
    settings: [
      {
        id: "settings-styleeditor-autocompletion",
        l10nId: "devtools-settings-styleeditor-autocompletion",
        type: "boolean",
        pref: "devtools.styleeditor.autocompletion-enabled",
      },
    ],
  },
];

/** @satisfies {Record<string, SettingChangeHandler>} */
export const callbacks = {
  updateToolboxButtons: ({ toolbox }) =>
    toolbox.updateToolboxButtonsVisibility(),
};
