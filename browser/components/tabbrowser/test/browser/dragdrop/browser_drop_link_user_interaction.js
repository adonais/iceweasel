/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.navigation.requireUserInteraction", true]],
  });
});

/**
 * Verify that dropping a link onto a tab in the tab strip, replacing its
 * content, marks the entry being replaced as having had user interaction,
 * so it isn't skipped by the back/forward menu when the back-button
 * intervention is enabled.
 */
add_task(async function test_drop_link_marks_previous_entry_interacted() {
  const targetTab = await addTab("https://example.com/1");
  const browser = targetTab.linkedBrowser;

  const url2 = "https://example.com/2";
  const loaded = BrowserTestUtils.browserLoaded(browser, false, url2);

  // Build the drag session and dataTransfer by hand, rather than using
  // EventUtils.synthesizeDrop with a real source element: synthesizing a
  // native dragstart on a draggable chrome element (e.g. a <tab>) would
  // make dataTransfer.mozSourceNode that element, which makes
  // ContentAreaDropListener resolve the triggering principal to that
  // element's own (system) principal instead of exercising the content
  // (non-system) principal path a real drag from a web page would take.
  EventUtils.startDragSession(window, "link");
  let dragSession = window.windowUtils.dragSession;
  dragSession.triggeringPrincipal =
    Services.scriptSecurityManager.createContentPrincipal(
      Services.io.newURI("https://example.org/"),
      {}
    );

  let dataTransfer = new DataTransfer();
  dataTransfer.mozSetDataAt("text/plain", url2, 0);
  dataTransfer.dropEffect = "link";

  EventUtils.sendDragEvent(
    EventUtils.createDragEventObject(
      "dragover",
      targetTab,
      window,
      dataTransfer,
      {}
    ),
    targetTab,
    window
  );
  EventUtils.sendDragEvent(
    EventUtils.createDragEventObject(
      "drop",
      targetTab,
      window,
      dataTransfer,
      {}
    ),
    targetTab,
    window
  );
  dragSession.endDragSession(true, EventUtils._parseModifiers({}));

  await loaded;

  let sessionHistory = browser.browsingContext.sessionHistory;
  ok(
    sessionHistory.getEntryAtIndex(0).hasUserInteraction,
    "entry replaced by the drop is marked as having had user interaction"
  );
  ok(
    !sessionHistory.getEntryAtIndex(1).hasUserInteraction,
    "newly created entry from the drop is not marked as user-interacted"
  );

  BrowserTestUtils.removeTab(targetTab);
});
