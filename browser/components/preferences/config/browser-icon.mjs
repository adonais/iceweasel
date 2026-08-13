/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { DefaultBrowserHelper } from "chrome://browser/content/preferences/DefaultBrowserHelper.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomIconManager:
    "moz-src:///browser/components/shell/CustomIconManager.sys.mjs",
  ICON_CATALOG: "moz-src:///browser/components/shell/CustomIconManager.sys.mjs",
  resolvePreview:
    "moz-src:///browser/components/shell/CustomIconManager.sys.mjs",
});

// The picker preview sits in this (chrome) document, so it should show the
// variant for the document's own color scheme; a theme-aware icon's preview
// follows that, while the applied icon follows the OS theme (resolved in
// CustomIconManager). Re-render on change so a theme switch updates previews.
const COLOR_SCHEME_QUERY = matchMedia("(prefers-color-scheme: dark)");
function currentScheme() {
  return COLOR_SCHEME_QUERY.matches ? "dark" : "light";
}
function watchScheme(emitChange) {
  COLOR_SCHEME_QUERY.addEventListener("change", emitChange);
  return () => COLOR_SCHEME_QUERY.removeEventListener("change", emitChange);
}
XPCOMUtils.defineLazyServiceGetters(lazy, {
  WinTaskbar: ["@mozilla.org/windows-taskbar;1", Ci.nsIWinTaskbar],
});

const PREF_ICON_ID = "browser.shell.customIcon.id";

// The default-browser and taskbar-pin state, resolved asynchronously. The Bonus
// icons are unlocked only when both are true; until then they stay disabled and
// the header promo offers a button for each missing action.
let gIsDefault = false;
let gIsPinned = false;
let gIconsUnlocked = false;

// Re-render callbacks for the elements that depend on this state (the Bonus
// picker, its header promo, and the promo's action buttons), so they update
// together when the asynchronous check resolves.
const gUnlockListeners = new Set();

// Unsubscribe handle for the shared DefaultBrowserHelper poll, held while any
// dependent element is alive so a single subscription is shared.
let gPollUnsubscribe = null;

/**
 * Recompute the default-browser / taskbar-pin state and, if anything changed,
 * notify every dependent element to re-render.
 */
async function refreshUnlockState() {
  let isDefault = false;
  let isPinned = false;
  try {
    isDefault = DefaultBrowserHelper.isBrowserDefault;
    // Reach the shell service through getShellService() (rather than the raw
    // XPCOM component) so tests can substitute it. Call the native pin check on
    // .shellService directly: ShellService is a Proxy that would forward the
    // method but invoke it with the wrong `this`.
    isPinned = await window
      .getShellService()
      .shellService.isCurrentAppPinnedToTaskbar(lazy.WinTaskbar.defaultGroupId);
  } catch (ex) {
    isDefault = false;
    isPinned = false;
  }
  let unlocked = isDefault && isPinned;
  if (
    isDefault !== gIsDefault ||
    isPinned !== gIsPinned ||
    unlocked !== gIconsUnlocked
  ) {
    gIsDefault = isDefault;
    gIsPinned = isPinned;
    gIconsUnlocked = unlocked;
    for (let notify of gUnlockListeners) {
      notify();
    }
  }
}

/**
 * setup() helper: register a re-render callback tied to the unlock state and
 * kick off the (async) check. Returns the teardown function.
 *
 * While any dependent element is alive, subscribe (once) to the shared
 * DefaultBrowserHelper poll so the unlock state also refreshes when the default
 * browser changes outside this sub-pane (the OS, or the General pane's "Set as
 * default"). The taskbar-pin half is re-checked as part of refreshUnlockState.
 *
 * @param {Function} emitChange Callback that triggers a re-render.
 * @returns {() => void} Teardown that removes this listener and, once the last
 *          listener is gone, unsubscribes from the default-browser poller.
 */
function watchUnlockState(emitChange) {
  if (!gUnlockListeners.size && DefaultBrowserHelper.canCheck) {
    gPollUnsubscribe =
      DefaultBrowserHelper.pollForDefaultChanges(refreshUnlockState);
  }
  gUnlockListeners.add(emitChange);
  refreshUnlockState();
  return () => {
    gUnlockListeners.delete(emitChange);
    if (!gUnlockListeners.size && gPollUnsubscribe) {
      gPollUnsubscribe();
      gPollUnsubscribe = null;
    }
  };
}

// Re-check the default/pinned state each time the user (re-)enters the Browser
// icon sub-pane, so a change made outside about:settings (setting default via
// the OS, pinning to the taskbar) is reflected without reloading the page. The
// first entry is already covered by the settings' setup(); this catches
// re-entry. "paneBrowserIcon" is the internal name of the "browserIcon" pane.
document.addEventListener("paneshown", event => {
  if (event.detail?.category === "paneBrowserIcon") {
    refreshUnlockState();
    lazy.CustomIconManager.refreshTaskbarButtons();
  }
});

/**
 * Build a moz-visual-picker option for a catalog icon.
 *
 * @param {string} id Catalog id (or "default").
 * @param {string} l10nId Fluent id for the label.
 * @param {string} preview chrome:// URI of the preview image.
 * @returns {object}
 */
function iconOption(id, l10nId, preview) {
  return {
    value: id,
    key: id,
    l10nId,
    controlAttrs: {
      class: "browser-icon-item",
      imagesrc: preview,
    },
  };
}

/**
 * Returns the list of alternative browser icons from the catalog, as
 * an option object that can be rendered by the moz-visual-picker.
 *
 * @param {boolean} isGated
 *   True if the gated browser icons should be returned, otherwise this
 *   will return the non-gated icons.
 * @returns {object[]}
 */
function getOptions(isGated) {
  let scheme = currentScheme();
  let options = [];
  for (let [id, entry] of Object.entries(lazy.ICON_CATALOG)) {
    if (!!entry.gated == isGated) {
      options.push(
        iconOption(id, entry.l10nId, lazy.resolvePreview(entry, scheme))
      );
    }
  }
  return options;
}

// Re-resolve each option's preview for the current color scheme, so theme-aware
// icons show the right variant after a theme switch. Called from the pickers'
// getControlConfig so it runs on every (re-)render.
function resolveOptionPreviews(config) {
  let scheme = currentScheme();
  for (let option of config.options) {
    let entry = lazy.ICON_CATALOG[option.value];
    if (entry) {
      option.controlAttrs = {
        ...option.controlAttrs,
        imagesrc: lazy.resolvePreview(entry, scheme),
      };
    }
  }
  return config;
}

// Which ids each card owns. The active icon is a single value (the pref); each
// picker shows it only if it owns that id, otherwise it shows nothing selected.
function isBonusId(id) {
  return !!lazy.ICON_CATALOG[id]?.gated;
}
function isBasicId(id) {
  let entry = lazy.ICON_CATALOG[id];
  return !!entry && !entry.gated;
}

/**
 * Apply or revert the icon identified by a picker value. No pref on the picker
 * settings: apply/revert own the side effects and update the pref themselves,
 * which re-renders both pickers via the customIconIdPref dep.
 *
 * @param {string} val A catalog id, or "default" to revert.
 */
async function selectIcon(val) {
  if (val === "default") {
    await lazy.CustomIconManager.revert();
  } else {
    await lazy.CustomIconManager.apply(val);
  }
}

Preferences.addAll([{ id: PREF_ICON_ID, type: "string" }]);

// Tracks the icon pref so the pickers re-render when the active icon changes
// (including from another window or the startup reconcile).
Preferences.addSetting({
  id: "customIconIdPref",
  pref: PREF_ICON_ID,
});

// Basic card picker: shows the active icon if it is a Basic id, else nothing.
Preferences.addSetting({
  id: "customBrowserIconBasic",
  deps: ["customIconIdPref"],
  get(_, { customIconIdPref }) {
    let id = customIconIdPref.value || "default";
    return isBasicId(id) ? id : "";
  },
  set: selectIcon,
  setup: watchScheme,
  getControlConfig: resolveOptionPreviews,
});

// Bonus card picker: shows the active icon if it is a Bonus id, else nothing,
// and disables every option until the icons are unlocked.
Preferences.addSetting({
  id: "customBrowserIconBonus",
  deps: ["customIconIdPref"],
  get(_, { customIconIdPref }) {
    let id = customIconIdPref.value || "default";
    return isBonusId(id) ? id : "";
  },
  set: selectIcon,
  setup(emitChange) {
    let stopUnlock = watchUnlockState(emitChange);
    let stopScheme = watchScheme(emitChange);
    return () => {
      stopUnlock();
      stopScheme();
    };
  },
  getControlConfig(config) {
    resolveOptionPreviews(config);
    for (let option of config.options) {
      option.disabled = !gIconsUnlocked;
    }
    return config;
  },
});

// Header promo on the Bonus card, shown only while the icons are locked.
Preferences.addSetting({
  id: "customBrowserIconRequirement",
  setup: watchUnlockState,
  visible: () => !gIconsUnlocked,
});

// Success promo on the Bonus card, shown once the icons are unlocked (the
// inverse of customBrowserIconRequirement). Shares watchUnlockState so it
// re-renders when the async default/pin check resolves.
Preferences.addSetting({
  id: "customBrowserIconUnlocked",
  setup: watchUnlockState,
  visible: () => gIconsUnlocked,
});

// Action buttons in the promo header. Each is shown only while its condition is
// unmet, performs that single action, then re-checks state so the UI (buttons,
// promo, Bonus picker) updates.
Preferences.addSetting({
  id: "browserIconSetDefaultButton",
  setup: watchUnlockState,
  visible: () => !gIsDefault,
  async onUserClick() {
    await DefaultBrowserHelper.setDefaultBrowser();
    refreshUnlockState();
  },
});
Preferences.addSetting({
  id: "browserIconPinButton",
  setup: watchUnlockState,
  visible: () => !gIsPinned,
  async onUserClick() {
    await window.getShellService().pinToTaskbar();
    refreshUnlockState();
  },
});

SettingGroupManager.registerGroups({
  browserIconBasic: {
    l10nId: "appearance-browser-icon-basic-group",
    headingLevel: 2,
    items: [
      {
        id: "customBrowserIconBasic",
        control: "moz-visual-picker",
        controlAttrs: { orientation: "vertical" },
        options: getOptions(false /* isGated */),
      },
    ],
  },
  browserIconBonus: {
    l10nId: "appearance-browser-icon-bonus-group",
    headingLevel: 2,
    items: [
      {
        id: "customBrowserIconRequirement",
        l10nId: "appearance-browser-icon-requirement",
        control: "moz-promo",
        controlAttrs: {
          imagesrc: "chrome://global/skin/illustrations/kit-holding-lock.svg",
          imagewidth: "small",
          imagedisplay: "cover",
        },
        items: [
          {
            id: "browserIconSetDefaultButton",
            l10nId: "appearance-browser-icon-set-default-button",
            control: "moz-button",
            slot: "actions",
          },
          {
            id: "browserIconPinButton",
            l10nId: "appearance-browser-icon-pin-button",
            control: "moz-button",
            slot: "actions",
          },
        ],
      },
      {
        id: "customBrowserIconUnlocked",
        l10nId: "appearance-browser-icon-unlocked",
        control: "moz-promo",
        controlAttrs: {
          imagesrc: "chrome://global/skin/illustrations/kit-confetti.svg",
          imagewidth: "small",
          imagedisplay: "cover",
        },
      },
      {
        id: "customBrowserIconBonus",
        control: "moz-visual-picker",
        controlAttrs: { orientation: "vertical" },
        options: getOptions(true /* isGated */),
      },
    ],
  },
});
