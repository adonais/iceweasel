/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Commonly reused targeting expressions for Firefox Messaging System messages.
 *
 * These constants standardize targeting strings that are frequently used across
 * in-tree messages and experiments, making them easier to maintain, review, and
 * communicate changes. When a targeting heuristic changes, update the constant
 * here and add a versioned suffix (e.g. _V2) to preserve backward
 * compatibility for any experiments or rollouts still referencing the old
 * version.
 *
 * Modeled after Experimenter's targeting constants:
 * https://github.com/mozilla/experimenter/blob/main/experimenter/experimenter/targeting/constants.py
 */

export const NEED_DEFAULT =
  "'browser.shell.checkDefaultBrowser'|preferenceValue && !isDefaultBrowser";
export const NEED_DEFAULT_AND_PIN = `doesAppNeedPin && ${NEED_DEFAULT}`;

export const EXISTING_USER =
  "(currentDate|date - profileAgeCreated|date) / 86400000 >= 28 && previousSessionEnd";
export const NEW_USER =
  "(currentDate|date - profileAgeCreated|date) / 86400000 < 28";
export const PROFILE_MORE_THAN_3_DAYS =
  "(currentDate|date - profileAgeCreated|date) / 86400000 > 3";

export const NO_COMPETING_UI =
  "!isMajorUpgrade && !activeNotifications && !willShowDefaultPrompt";
export const ON_STARTUP = `source == 'startup' && ${NO_COMPETING_UI}`;
export const ON_NEWTAB = `source == 'newtab' && ${NO_COMPETING_UI}`;

export const NEEDS_IMPORT =
  "!(hasMigratedBookmarks|preferenceValue || hasMigratedCSVPasswords|preferenceValue || hasMigratedHistory|preferenceValue || hasMigratedPasswords|preferenceValue)";

export const CFR_FEATURES_ENABLED =
  "'browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features'|preferenceValue != false";
export const CFR_ADDONS_ENABLED =
  "'browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons'|preferenceValue != false";

export const NOT_ENTERPRISE = "!hasActiveEnterprisePolicies";

// True when Windows will show its own OS-level consent prompt when pinning is
// silently triggered (PIN_FIREFOX_TASKBAR_WIN_OS_PROMPT), i.e. the OS
// supports it (mirrors GetPinningSupportedByWindowsVersionWithoutSystemPopup
// in https://searchfox.org/firefox-main/source/browser/installer/windows/nsis/shared.nsh#1099)
// and auto-triggered actions haven't been disabled via
// browser.bypassAutoTriggerActions.
export const WIN_OS_PIN_PROMPT_ENABLED =
  "(!('browser.bypassAutoTriggerActions'|preferenceValue) && (os.isWindows && ((os.windowsBuildNumber == 19045 && os.windowsUBR >= 3996) || (os.windowsBuildNumber > 19045 && os.windowsBuildNumber < 22000) || (os.windowsBuildNumber == 22621 && os.windowsUBR >= 2361) || os.windowsBuildNumber > 22621)))";

// True when the OS itself will present the user with a consent surface if the
// set default action is silently triggered
// (SET_DEFAULT_MAC_AND_WINDOWS_OS_PROMPT). macOS always shows its own consent
// prompt, and Windows falls back to its own "Choose default apps" settings UI
// when one-click set default (a silent UserChoice registry write with no
// consent surface at all) isn't available. Linux is excluded because
// isOneClickSetDefaultEnabled is Windows only. Whether set default is
// one-click on Linux varies by build, and targeting can't currently tell.
// This also requires that auto-triggered actions haven't been disabled via
// browser.bypassAutoTriggerActions.
export const SET_DEFAULT_OS_PROMPT_ENABLED =
  "(!('browser.bypassAutoTriggerActions'|preferenceValue) && (os.isMac || (os.isWindows && !isOneClickSetDefaultEnabled)))";

export const FXA_NOT_SIGNED_IN = "isFxAEnabled && !isFxASignedIn";

export const TAB_GROUPS_ENABLED =
  "('browser.tabs.groups.enabled'|preferenceValue) && userPrefs.cfrFeatures";

export const EXISTING_USER_ON_STARTUP = `${EXISTING_USER} && ${ON_STARTUP} && ${NOT_ENTERPRISE}`;
export const EXISTING_USER_ON_NEWTAB = `${EXISTING_USER} && ${ON_NEWTAB} && ${NOT_ENTERPRISE}`;
