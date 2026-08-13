/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Most commands don't make sense in customize mode. Check that they're
 * disabled, so shortcuts can't activate them either. Also check that
 * some basic commands (close tab/window, quit, new tab, new window)
 * remain functional.
 */
add_task(async function test_disable_commands() {
  let disabledCommands = ["cmd_print", "Browser:SavePage", "Browser:SendLink"];
  let enabledCommands = [
    "cmd_newNavigatorTab",
    "cmd_newNavigator",
    "cmd_quitApplication",
    "cmd_close",
    "cmd_closeWindow",
  ];

  function checkDisabled() {
    for (let cmd of disabledCommands) {
      is(
        document.getElementById(cmd).getAttribute("disabled"),
        "true",
        `Command ${cmd} should be disabled`
      );
    }
    for (let cmd of enabledCommands) {
      ok(
        !document.getElementById(cmd).hasAttribute("disabled"),
        `Command ${cmd} should NOT be disabled`
      );
    }
  }
  await startCustomizing();

  checkDisabled();

  // Do a reset just for fun, making sure we don't accidentally
  // break things:
  await gCustomizeMode.reset();

  checkDisabled();

  await endCustomizing();
  for (let cmd of disabledCommands.concat(enabledCommands)) {
    ok(
      !document.getElementById(cmd).hasAttribute("disabled"),
      `Command ${cmd} should NOT be disabled after customize mode`
    );
  }
});

/**
 * When buttons are connected to a command, they should not get
 * disabled just because we move them.
 */
add_task(async function test_dont_disable_when_moving() {
  let button = gNavToolbox.palette.querySelector("#print-button");
  ok(button.hasAttribute("command"), "Button should have a command attribute.");
  await startCustomizing();
  CustomizableUI.addWidgetToArea("print-button", "nav-bar");
  await endCustomizing();
  ok(
    !button.hasAttribute("disabled"),
    "Should not have disabled attribute after adding the button."
  );
  ok(
    button.hasAttribute("command"),
    "Button should still have a command attribute."
  );

  await startCustomizing();
  await gCustomizeMode.reset();
  await endCustomizing();
  ok(
    !button.hasAttribute("disabled"),
    "Should not have disabled attribute when resetting in customize mode"
  );
  ok(
    button.hasAttribute("command"),
    "Button should still have a command attribute."
  );
});

/**
 * Regression test for bug 2040682: Buttons whose `command` attribute is moved
 * onto the toolbarpaletteitem wrapper while in customize mode (i.e. buttons
 * without keepbroadcastattributeswhencustomizing) should not keep the
 * temporarily-disabled state of their command after being added to a toolbar.
 */
add_task(async function test_dont_disable_non_broadcast_button_when_moving() {
  const kWidgetId = "open-file-button";
  CustomizableUI.reset();
  registerCleanupFunction(() => CustomizableUI.reset());

  let button = gNavToolbox.palette.querySelector("#" + kWidgetId);
  ok(button, "open-file-button starts in the palette.");
  ok(
    !button.hasAttribute("keepbroadcastattributeswhencustomizing"),
    "open-file-button does not keep broadcast attributes"
  );

  await startCustomizing();
  CustomizableUI.addWidgetToArea(kWidgetId, "nav-bar");
  await endCustomizing();

  is(
    CustomizableUI.getPlacementOfWidget(kWidgetId).area,
    "nav-bar",
    "Button is in the nav-bar after adding."
  );
  ok(
    !button.hasAttribute("disabled"),
    "Button should not be disabled after adding to a toolbar in customize mode."
  );
  is(
    button.getAttribute("command"),
    "Browser:OpenFile",
    "Button still drives Browser:OpenFile after exit."
  );

  let openFileCommand = document.getElementById("Browser:OpenFile");
  ok(
    !openFileCommand.hasAttribute("disabled"),
    "Browser:OpenFile command should be enabled after exiting customize mode."
  );
});
