/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

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

const PREF_ICON_ID = "browser.shell.customIcon.id";

// The default-browser and taskbar-pin state, resolved asynchronously. The Bonus
// icons are unlocked only when both are true; until then they stay disabled and
// the header promo offers a button for each missing action.
let gIsDefault = true;
let gIsPinned = true;
let gIconsUnlocked = true;

/**
 * Recompute the default-browser / taskbar-pin state and, if anything changed,
 * notify every dependent element to re-render.
 */
async function refreshUnlockState() {
  gIsDefault = true;
  gIsPinned = true;
  gIconsUnlocked = true;
}

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
  getControlConfig(config) {
    resolveOptionPreviews(config);
    for (let option of config.options) {
      option.disabled = !gIconsUnlocked;
    }
    return config;
  },
});

// Success promo on the Bonus card, shown once the icons are unlocked
Preferences.addSetting({
  id: "customBrowserIconUnlocked",
  visible: () => gIconsUnlocked,
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
