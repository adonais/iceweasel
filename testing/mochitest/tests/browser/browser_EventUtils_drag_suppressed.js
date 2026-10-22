/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_task(async function synthesizeDropWhileDragServiceSuppressed() {
  const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
    Ci.nsIDragService
  );
  const target = gURLBar.inputField;

  dragService.suppress();
  try {
    Assert.throws(
      () =>
        EventUtils.synthesizeDrop(
          target,
          target,
          [[{ type: "text/plain", data: "foo" }]],
          "copy",
          window
        ),
      /the drag service is suppressed/,
      "synthesizeDrop should throw a clear error"
    );
  } finally {
    dragService.unsuppress();
  }

  ok(!window.windowUtils.dragSession, "No drag session should be left behind");
});
