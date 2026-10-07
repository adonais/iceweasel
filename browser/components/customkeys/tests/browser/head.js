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
  remappedDisplay: isMac ? "⇧⌥⌘M" : "Ctrl+Shift+Alt+M",

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
  remappedDigitDisplay: isMac ? "⇧⌥⌘€" : "Ctrl+Shift+Alt+€",

  // A key whose character takes two UTF-16 code units but is one character
  // as the user sees it: the Hebrew letter shin with a dagesh, U+05E9 U+05BC.
  twoCodeUnitArgs: ["\u05E9\u05BC", { accelKey: true, shiftKey: true }],
  twoCodeUnitDisplay: isMac ? "⇧⌘\u05E9\u05BC" : "Ctrl+Shift+\u05E9\u05BC",
};
consts.unusedDisplay = `${consts.unusedModifiersDisplay}${consts.unusedKey}`;
