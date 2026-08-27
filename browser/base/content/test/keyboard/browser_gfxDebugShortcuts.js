/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const IS_MAC = AppConstants.platform == "macosx";

// The shortcut strings WebExtension commands use for Ctrl+Shift+3 and
// Ctrl+Shift+6 on macOS, where the control key is called MacCtrl and maps to the
// "control" modifier of the key elements. On other platforms Ctrl maps to
// "accel", so ShortcutUtils never matches the capture shortcuts there.
const MAC_CAPTURE_SHORTCUT = "MacCtrl+Shift+3";
const MAC_CAPTURE_SEQUENCE_SHORTCUT = "MacCtrl+Shift+6";

// The manifest turns gfx.webrender.debug.enable-capture off so that this runs
// the same way in builds configured with --enable-webrender-debugger, which
// enable captures by default.
add_task(async function test_capture_shortcuts_are_pref_gated() {
  is(
    document.getElementById("gfxDebugKeyset"),
    null,
    "The capture shortcuts are not registered when captures are disabled."
  );
  if (IS_MAC) {
    ok(
      !ShortcutUtils.isSystem(window, MAC_CAPTURE_SHORTCUT),
      "Ctrl+Shift+3 is available for other shortcuts."
    );
    ok(
      !ShortcutUtils.isSystem(window, MAC_CAPTURE_SEQUENCE_SHORTCUT),
      "Ctrl+Shift+6 is available for other shortcuts."
    );
  }

  // The pref is a `once` mirror so it can't be flipped at runtime: register the
  // shortcuts directly instead to check the rest of the mechanism.
  registerCleanupFunction(() =>
    document.getElementById("gfxDebugKeyset")?.remove()
  );
  gGfxUtils.registerCaptureShortcuts();

  ok(
    document.getElementById("key_wrCaptureCmd"),
    "The capture shortcut is registered."
  );
  ok(
    document.getElementById("key_wrToggleCaptureSequenceCmd"),
    "The capture sequence shortcut is registered."
  );

  if (IS_MAC) {
    ok(
      ShortcutUtils.isSystem(window, MAC_CAPTURE_SHORTCUT),
      "Ctrl+Shift+3 is a system shortcut once registered."
    );
    ok(
      ShortcutUtils.isSystem(window, MAC_CAPTURE_SEQUENCE_SHORTCUT),
      "Ctrl+Shift+6 is a system shortcut once registered."
    );
  }
});

// Runs after the task above, which makes sure the shortcuts are registered.
add_task(async function test_capture_shortcut_triggers_a_capture() {
  let captured = false;
  let webrenderCapture = gGfxUtils.webrenderCapture;
  gGfxUtils.webrenderCapture = () => {
    captured = true;
  };
  registerCleanupFunction(() => {
    gGfxUtils.webrenderCapture = webrenderCapture;
  });

  // Blur the browser so that the key event is handled by the chrome window
  // instead of being routed to the content process first. Key events sent while
  // the focus moves between the two are lost, and the key handler and the
  // command it triggers run synchronously once the event reaches the window.
  await SimpleTest.promiseFocus(window, false, true);

  if (IS_MAC) {
    EventUtils.synthesizeKey("3", { ctrlKey: true, shiftKey: true });
  } else {
    EventUtils.synthesizeKey("#", { ctrlKey: true });
  }

  ok(captured, "The capture shortcut triggered a capture.");
});
