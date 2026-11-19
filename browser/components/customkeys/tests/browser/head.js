/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const isMac = AppConstants.platform == "macosx";
const isLinux = AppConstants.platform == "linux";

const consts = {
  // The following constants specify the default key combinations for various
  // commands. They must be updated if these change in future.
  // key_gotoHistory
  historyDisplay: isMac ? "⇧⌘H" : "Ctrl+H",
  historyModifiers: isMac ? "accel,shift" : "accel",
  historyOptions: { accelKey: true, shiftKey: isMac },
  // key_openDownloads
  downloadsDisplay: (isMac && "⌘J") || (isLinux && "Ctrl+Shift+Y") || "Ctrl+J",
  // key_newNavigator
  newWindowDisplay: isMac ? "⌘N" : "Ctrl+N",
  // goBackKb
  backDisplay: isMac ? "⌘←" : "Alt+Left Arrow",
  backArgs: ["KEY_ArrowLeft", { accelKey: isMac, altKey: !isMac }],
  // key_paste
  pasteDisplay: isMac ? "⌘V" : "Ctrl+V",

  // The following unused* constants specify a key combination which is unused by
  // default. This will need to be updated if this key combination is assigned to
  // something by default in future.
  unusedModifiers: "accel,shift",
  unusedOptions: { accelKey: true, shiftKey: true },
  unusedKey: isLinux ? "Q" : "Y",
  unusedModifiersDisplay: isMac ? "⇧⌘" : "Ctrl+Shift+",
  unusedModifiersArgs: ["KEY_Shift", { accelKey: true }],

  // A key which Option (Alt and AltGraph together) remaps to a different
  // character, so that event.key is not the character on the key that was
  // pressed. Option+M types "µ" (U+00B5) on macOS, and upper casing that gives
  // "Μ" (U+039C), a character which is neither on the key nor produced by it,
  // so a shortcut assigned to it can never match.
  remappedArgs: [
    "µ",
    {
      accelKey: true,
      altKey: true,
      altGraphKey: true,
      shiftKey: true,
      keyCode: KeyEvent.DOM_VK_M,
    },
  ],
  remappedDisplay: isMac ? "⌥⇧⌘M" : "Ctrl+Shift+Alt+M",

  // A digit key which Option and Shift together remap to a different
  // character. Option+Shift+2 types "€" on macOS. Only the shifted character
  // on the key can match a shortcut, and on a digit key that is punctuation
  // rather than the digit, so the character which was produced is the one to
  // record.
  remappedDigitArgs: [
    "€",
    {
      accelKey: true,
      altKey: true,
      altGraphKey: true,
      shiftKey: true,
      keyCode: KeyEvent.DOM_VK_2,
    },
  ],
  remappedDigitDisplay: isMac ? "⌥⇧⌘€" : "Ctrl+Shift+Alt+€",

  // A key whose character takes two UTF-16 code units but is one character
  // as the user sees it: the Hebrew letter shin with a dagesh, U+05E9 U+05BC.
  twoCodeUnitArgs: ["\u05E9\u05BC", { accelKey: true, shiftKey: true }],
  twoCodeUnitDisplay: isMac ? "⇧⌘\u05E9\u05BC" : "Ctrl+Shift+\u05E9\u05BC",
};
consts.unusedDisplay = `${consts.unusedModifiersDisplay}${consts.unusedKey}`;

// The attributes that carry a key element's shortcut, and the copies that hold
// the built-in shortcut while the operating system's assignment is written
// over them.
const SHORTCUT_ATTRS = ["key", "keycode", "modifiers", "data-l10n-id"];
function builtinAttrName(attr) {
  return attr == "data-l10n-id"
    ? "data-builtin-l10n-id"
    : `data-builtin-${attr}`;
}

/**
 * Do to a key element what the macOS widget code does when the user assigns a
 * shortcut to its menu item in System Settings.
 *
 * @param {Element} keyEl The key element.
 * @param {string} modifiers The assigned modifiers; e.g. "accel,shift".
 * @param {string} key The assigned key; e.g. "Y".
 */
function simulateSystemAssignment(keyEl, modifiers, key) {
  if (!keyEl.hasAttribute("data-has-system-shortcut")) {
    for (const attr of SHORTCUT_ATTRS) {
      const val = keyEl.getAttribute(attr);
      if (val === null) {
        keyEl.removeAttribute(builtinAttrName(attr));
      } else {
        keyEl.setAttribute(builtinAttrName(attr), val);
      }
    }
    keyEl.setAttribute("data-has-system-shortcut", "true");
  }
  keyEl.removeAttribute("data-l10n-id");
  keyEl.removeAttribute("keycode");
  keyEl.setAttribute("key", key);
  keyEl.setAttribute("modifiers", modifiers);
}

/**
 * Do to a key element what the macOS widget code does when the assignment is
 * removed again.
 *
 * @param {Element} keyEl The key element.
 */
function simulateSystemAssignmentRemoval(keyEl) {
  if (!keyEl.hasAttribute("data-has-system-shortcut")) {
    return;
  }
  for (const attr of SHORTCUT_ATTRS) {
    const val = keyEl.getAttribute(builtinAttrName(attr));
    if (val === null) {
      keyEl.removeAttribute(attr);
    } else {
      keyEl.setAttribute(attr, val);
    }
    keyEl.removeAttribute(builtinAttrName(attr));
  }
  keyEl.removeAttribute("data-has-system-shortcut");
}
