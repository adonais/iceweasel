/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The harness fails this test because it leaves the mouse button pressed.
add_task(async function leaveMouseDown() {
  ok(!window.windowUtils.isMouseDown, "The mouse is up when the test starts");
  EventUtils.synthesizeMouseAtCenter(gBrowser.selectedBrowser, {
    type: "mousedown",
  });
  ok(window.windowUtils.isMouseDown, "The mouse is down after a mousedown");
});
