/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Toolbox } from "./toolbox.d.ts";
import { SettingChangedEvent } from "../events.mjs";
import { callbacks, conditions } from "../inventory.mjs";

export type SettingChangeHandler = (context: {
  toolbox: Toolbox;
  event: SettingChangedEvent;
}) => void;

export type SettingCondition = (context: {
  toolbox: Toolbox;
  setting: Setting;
}) => boolean;

export interface BaseSetting {
  id: string;
  hidden?: keyof typeof conditions;
}

export interface PrefBaseSetting extends BaseSetting {
  pref: string;
  l10nId: string;
  disabled?: keyof typeof conditions;
  disabledL10nId?: string;
  changeAction?: keyof typeof callbacks;
}

export interface BooleanSetting extends PrefBaseSetting {
  type: "boolean";
}

export interface SettingOption {
  value: string;
  l10nId?: string;
}

export interface SelectSetting extends PrefBaseSetting {
  type: "select";
  options: ReadonlyArray<SettingOption>;
}

export interface CustomElementSetting extends BaseSetting {
  type: "custom-element";
  element: keyof HTMLElementTagNameMap;
  l10nId?: string;
}

export type Setting = BooleanSetting | SelectSetting | CustomElementSetting;

export interface SettingSection {
  id: string;
  l10nId: string;
  settings: ReadonlyArray<Setting>;
}
