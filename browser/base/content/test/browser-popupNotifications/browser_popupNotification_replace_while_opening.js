/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that replacing a notification while the panel is animating open doesn't
// fire "shown" for the notification that was replaced. Its callback would run
// last and overwrite whatever the replacement wrote into the panel.

const NOTIFICATION_ID = "test-replace-while-opening";

function show(shownEvents, index) {
  return PopupNotifications.show(
    gBrowser.selectedBrowser,
    NOTIFICATION_ID,
    `Test notification ${index}`,
    null,
    { label: "OK", accessKey: "O", callback() {} },
    null,
    {
      removeOnDismissal: true,
      eventCallback(topic) {
        if (topic == "shown") {
          shownEvents.push(index);
        }
      },
    }
  );
}

add_task(async function test_replace_while_animating_open() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    let panel = PopupNotifications.panel;
    let shownEvents = [];

    let showingPromise = BrowserTestUtils.waitForEvent(panel, "popupshowing");
    let shownPromise = BrowserTestUtils.waitForEvent(panel, "popupshown");
    show(shownEvents, 1);
    await showingPromise;

    Assert.equal(
      panel.state,
      "showing",
      "Panel is still animating open, so the popupshown listener is pending"
    );

    let second = show(shownEvents, 2);
    await shownPromise;

    Assert.equal(
      shownEvents.at(-1),
      2,
      `The replacement notification was shown last, so it owns the panel contents (got ${shownEvents})`
    );
    Assert.equal(
      PopupNotifications.getNotification(
        NOTIFICATION_ID,
        gBrowser.selectedBrowser
      ),
      second,
      "The replacement notification is the current one"
    );

    let hiddenPromise = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    panel.hidePopup();
    await hiddenPromise;
    second.remove();
  });
});
