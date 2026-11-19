/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* global add_task, Assert */

// Debugged from browser_backward_compat_xpcshell.js, which relies on the
// markers below to find the lines where it pauses.

add_task(function test_debug_me() {
  let counter = 0; // BREAKPOINT
  counter++; // STEP
  Assert.equal(counter, 1, "The test ran to completion");
});
