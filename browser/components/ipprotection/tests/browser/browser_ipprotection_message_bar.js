/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ERRORS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);

/**
 * Tests the generic error message bar.
 */
add_task(async function test_generic_error() {
  let content = await openPanel({
    isSignedIn: true,
    error: "",
  });

  let messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");

  Assert.ok(!messageBar, "Message bar should not be present");

  let messageBarLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.shadowRoot.querySelector("ipprotection-message-bar")
  );

  await setPanelState({
    isSignedIn: true,
    error: ERRORS.GENERIC,
  });
  await messageBarLoadedPromise;

  messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");

  Assert.ok(messageBar, "Message bar should be present");
  Assert.ok(
    messageBar.mozMessageBarEl,
    "Wrapped moz-message-bar should be present"
  );
  Assert.equal(
    messageBar.type,
    ERRORS.GENERIC,
    "Message bar should be generic error"
  );

  await closePanel();
});

/**
 * Tests that dismissing the message bar dispatches the expected events and
 * removes it from the DOM.
 */
add_task(async function test_dismiss() {
  let content = await openPanel({
    isSignedIn: true,
    error: "",
  });

  let messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");

  Assert.ok(!messageBar, "Message bar should not be present");

  let messageBarLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.shadowRoot.querySelector("ipprotection-message-bar")
  );

  // Use generic error as a fallback
  await setPanelState({
    isSignedIn: true,
    error: ERRORS.GENERIC,
  });
  await messageBarLoadedPromise;

  messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");

  Assert.ok(messageBar, "Message bar should be present");
  Assert.ok(
    messageBar.mozMessageBarEl,
    "Wrapped moz-message-bar should be present"
  );

  let closeButton = messageBar.mozMessageBarEl.closeButton;

  Assert.ok(closeButton, "Message bar should have close button");

  let dismissEvent = BrowserTestUtils.waitForEvent(
    document,
    messageBar.DISMISS_EVENT
  );
  let messageBarUnloadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => !content.shadowRoot.querySelector("ipprotection-message-bar")
  );

  closeButton.click();

  await dismissEvent;
  Assert.ok(true, "Dismiss event was dispatched");

  await messageBarUnloadedPromise;
  Assert.ok(true, "Message bar should be not be present");

  await closePanel();
});
