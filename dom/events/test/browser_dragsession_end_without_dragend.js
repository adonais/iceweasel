/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

function tryStartDragSession() {
  try {
    dragService.startDragSessionForTests(
      window,
      Ci.nsIDragService.DRAGDROP_ACTION_MOVE
    );
  } catch (e) {
    // The drag service may refuse to start a session while suppressed.
  }
  return dragService.getCurrentSession(window);
}

// A drag that ends without a dragend, e.g. when tabbrowser recovers from a
// stale drag session, must not leave the mouse button considered pressed:
// otherwise the next window move or resize suppresses drag and drop.
add_task(async function test_window_resize_after_drag_ended_without_dragend() {
  EventUtils.synthesizeMouseAtCenter(
    document.documentElement,
    { type: "mousedown" },
    window
  );
  let session = tryStartDragSession();
  ok(session, "A drag session started");
  session.endDragSession(false);

  window.resizeBy(0, 0);

  session = tryStartDragSession();
  ok(session, "The next drag session can start after the window resize");
  session?.endDragSession(false);

  // Release the button in case the drag service was suppressed.
  EventUtils.synthesizeMouseAtCenter(
    document.documentElement,
    { type: "mouseup" },
    window
  );
});
