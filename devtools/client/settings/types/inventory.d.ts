/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Toolbox } from "../../framework/toolbox.js";
import { callbacks } from "../inventory.mjs";

export type SettingChangeHandler = (context: { toolbox: Toolbox }) => void;

export interface BaseSetting {
  id: string;
  pref: string;
  l10nId: string;
  changeAction?: keyof typeof callbacks;
}

export interface BooleanSetting extends BaseSetting {
  type: "boolean";
}

export type Setting = BooleanSetting;

export interface SettingSection {
  id: string;
  l10nId: string;
  settings: ReadonlyArray<Setting>;
}
