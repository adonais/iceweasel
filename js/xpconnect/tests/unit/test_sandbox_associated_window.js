/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(function test_associated_window_must_be_a_window() {
  Assert.throws(
    () => Cu.Sandbox(null, { associatedWindow: {} }),
    /associatedWindow must be a Window/
  );

  Assert.throws(
    () => Cu.Sandbox(null, { associatedWindow: Cu.Sandbox(null) }),
    /associatedWindow must be a Window/
  );

  Assert.throws(
    () => Cu.Sandbox(null, { associatedWindow: null }),
    /Expected an object value for property associatedWindow/
  );

  Assert.ok(Cu.Sandbox(null, {}), "the option is optional");
});
