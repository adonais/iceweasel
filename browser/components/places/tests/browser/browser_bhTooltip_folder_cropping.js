/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The places bhTooltip should appear on bookmark toolbar entries only when
// the displayed label is actually cropped by text-overflow. For folders
// (no URL) this gates the tooltip entirely; for URI bookmarks the tooltip
// is shown regardless because the URL itself is informative.

const LONG_TITLE =
  "A bookmark or folder title long enough to overflow the toolbarbutton " +
  "width and trigger text-overflow ellipsis " +
  "x".repeat(120);
const SHORT_TITLE = "Short";

add_setup(async function () {
  await PlacesUtils.bookmarks.eraseEverything();
  let toolbar = document.getElementById("PersonalToolbar");
  let wasCollapsed = toolbar.collapsed;
  if (wasCollapsed) {
    await promiseSetToolbarVisibility(toolbar, true);
    await BrowserTestUtils.waitForEvent(
      toolbar,
      "BookmarksToolbarVisibilityUpdated"
    );
  }
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
    if (wasCollapsed) {
      await promiseSetToolbarVisibility(toolbar, false);
    }
  });
});

// Drive BookmarksEventHandler.fillInBHTooltip synchronously and report
// whether the platform would have shown the tooltip (i.e. preventDefault
// was NOT called).
function tooltipWouldShow(triggerNode) {
  const tooltip = document.getElementById("bhTooltip");
  Object.defineProperty(tooltip, "triggerNode", {
    value: triggerNode,
    configurable: true,
  });
  let prevented = false;
  const fakeEvent = {
    preventDefault() {
      prevented = true;
    },
    target: tooltip,
  };
  try {
    window.BookmarksEventHandler.fillInBHTooltip(tooltip, fakeEvent);
  } finally {
    delete tooltip.triggerNode;
  }
  return !prevented;
}

add_task(async function test_bhTooltip_for_folders_only_when_cropped() {
  const longFolder = await PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: LONG_TITLE,
  });
  const shortFolder = await PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: SHORT_TITLE,
  });
  const bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: LONG_TITLE,
    url: "https://example.com/long-titled-bookmark",
  });

  await waitForBookmarksToolbarElements(3);

  const longFolderNode = getToolbarNodeForItemGuid(longFolder.guid);
  const shortFolderNode = getToolbarNodeForItemGuid(shortFolder.guid);
  const bookmarkNode = getToolbarNodeForItemGuid(bookmark.guid);

  for (const { node, expectCropped, expectTooltip, desc } of [
    {
      node: longFolderNode,
      expectCropped: true,
      expectTooltip: true,
      desc: "cropped folder",
    },
    {
      node: shortFolderNode,
      expectCropped: false,
      expectTooltip: false,
      desc: "non-cropped folder",
    },
    {
      node: bookmarkNode,
      expectCropped: true,
      expectTooltip: true,
      desc: "URL bookmark",
    },
  ]) {
    Assert.ok(node, `${desc}: rendered on toolbar.`);
    let label = node.querySelector(".toolbarbutton-text");
    // A flex/grid display turns the label's ::before (which holds the
    // cropped text) into its own flex/grid item, which breaks both the
    // ellipsis rendering and this scrollWidth/clientWidth check (see
    // bug 2049182 - the .bookmark-item display:flex regression).
    Assert.notEqual(
      getComputedStyle(label).display,
      "flex",
      `${desc}: label must not be a flex container.`
    );
    Assert.equal(
      label.scrollWidth > label.clientWidth,
      expectCropped,
      `${desc}: label cropping.`
    );
    Assert.equal(
      tooltipWouldShow(node),
      expectTooltip,
      `${desc}: tooltip visibility.`
    );
  }
});
