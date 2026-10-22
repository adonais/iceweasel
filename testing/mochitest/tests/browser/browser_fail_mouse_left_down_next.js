/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Runs after browser_fail_mouse_left_down.js, whose mousedown the harness
// should have released.
add_task(async function mouseIsUp() {
  ok(!window.windowUtils.isMouseDown, "The mouse is up when the test starts");
});
