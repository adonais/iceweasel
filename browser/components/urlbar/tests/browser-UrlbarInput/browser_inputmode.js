/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The input mode the bar hands the widget, which is what picks the on-screen
// keyboard.

"use strict";

add_task(async function inputmode() {
  gURLBar.focus();

  Assert.equal(
    window.windowUtils.focusedInputMode,
    "mozAwesomebar",
    "the address bar asks for the URL keyboard"
  );
});
