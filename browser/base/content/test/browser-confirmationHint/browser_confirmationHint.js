/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_hint_hides_on_its_own() {
  let panel = ConfirmationHint._panel;
  let shown = BrowserTestUtils.waitForPopupEvent(panel, "shown");
  ConfirmationHint.show(
    document.getElementById("PanelUI-menu-button"),
    "confirmation-hint-page-bookmarked"
  );
  await shown;

  await BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  ok(true, "The hint hid itself.");
});

// A second show() while a hint is still visible has to restart the auto-hide
// timer itself: openPopup does nothing for an already open panel, so there
// will be no popupshown event to restart the timer show() just cleared.
add_task(async function test_second_show_while_showing_still_hides() {
  let panel = ConfirmationHint._panel;
  let anchor = document.getElementById("PanelUI-menu-button");

  let shown = BrowserTestUtils.waitForPopupEvent(panel, "shown");
  ConfirmationHint.show(anchor, "confirmation-hint-page-bookmarked");
  await shown;

  ConfirmationHint.show(anchor, "confirmation-hint-send-to-device");
  is(panel.state, "open", "The hint is still showing after the second show().");
  is(
    panel.getAttribute("data-message-id"),
    "confirmation-hint-send-to-device",
    "The second hint's message replaced the first one's."
  );
  // The message text is only opaque while this attribute is set.
  ok(
    ConfirmationHint._animationBox.hasAttribute("animate"),
    "The second hint's message is visible."
  );

  await TestUtils.waitForCondition(
    () => panel.state == "closed",
    "the hint hides on its own after a second show() while it was showing",
    100,
    100
  );
});
