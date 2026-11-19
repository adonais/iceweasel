/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CustomKeys } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customkeys/CustomKeys.sys.mjs"
);

// With no browser window open, macOS shows the hidden window's menu bar, which
// takes its shortcuts from the hidden window's key elements.
add_task(async function testHiddenWindowGetsCustomization() {
  const hiddenWindow = Services.appShell.hiddenDOMWindow;
  const keyEl = hiddenWindow.document.getElementById("key_privatebrowsing");
  const nativeKey = () =>
    hiddenWindow.windowUtils.getNativeMenuItemKeyEquivalent(
      "menu_newPrivateWindow"
    );
  is(nativeKey(), "shift,command|p", "Starts out with the built-in shortcut");

  CustomKeys.changeKey("key_privatebrowsing", {
    modifiers: consts.unusedModifiers,
    key: consts.unusedKey,
  });
  registerCleanupFunction(() => CustomKeys.resetKey("key_privatebrowsing"));
  is(
    keyEl.getAttribute("key"),
    consts.unusedKey,
    "The hidden window's key element has the customized key"
  );
  is(
    nativeKey(),
    `shift,command|${consts.unusedKey.toLowerCase()}`,
    "The hidden window's menu item has the customized shortcut"
  );

  CustomKeys.resetKey("key_privatebrowsing");
  is(nativeKey(), "shift,command|p", "The built-in shortcut is back");
});
