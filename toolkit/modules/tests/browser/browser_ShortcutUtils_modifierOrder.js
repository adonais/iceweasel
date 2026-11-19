/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// macOS menus list modifiers as Control, Option, Shift, Command, so that
// order must not depend on the order of the modifiers attribute.
add_task(function testMacModifierOrder() {
  for (const modifiers of [
    "meta,alt,control,shift",
    "shift,control,alt,meta",
    "accel,shift,alt,control",
  ]) {
    is(
      ShortcutUtils.getModifierString(modifiers),
      "⌃⌥⇧⌘",
      `Modifiers "${modifiers}" are listed in the macOS order`
    );
  }
  is(
    ShortcutUtils.getModifierString("alt,control,meta"),
    "⌃⌥⌘",
    "Control comes before Option"
  );
  is(
    ShortcutUtils.getModifierString("shift,access"),
    "⌃⇧",
    "The access key, Control on macOS, comes before Shift"
  );
});
