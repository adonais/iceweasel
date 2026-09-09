/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = "about:buildconfig";

add_setup(async function () {
  // The following initialization code is necessary to avoid a frequent
  // intermittent failure in verify-fission where, due to timings, we may or
  // may not import default bookmarks.
  info("Ensure Places init is complete");
  let placesInitCompleteObserved = TestUtils.topicObserved(
    "places-browser-init-complete"
  );
  Cc["@mozilla.org/browser/browserglue;1"]
    .getService(Ci.nsIObserver)
    .observe(null, "browser-glue-test", "places-browser-init-complete");
  await placesInitCompleteObserved;
  // Clean before and after so we don't have anything in the folders.
  await PlacesUtils.bookmarks.eraseEverything();

  registerCleanupFunction(async function () {
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

// Simulating actual drag and drop is hard for a xul tree as we can't get the
// required source elements, so we have to do a lot more work by hand.
async function simulateDrop(
  selectTargets,
  sourceBm,
  dropEffect,
  targetGuid,
  isVirtualRoot = false
) {
  await withSidebarTree("bookmarks", async function (tree) {
    for (let target of selectTargets) {
      tree.selectItems([target]);
      if (tree.selectedNode instanceof Ci.nsINavHistoryContainerResultNode) {
        tree.selectedNode.containerOpen = true;
      }
    }

    let dataTransfer = {
      _data: [],
      dropEffect,
      mozCursor: "auto",
      mozItemCount: 1,
      types: [PlacesUtils.TYPE_X_MOZ_PLACE],
      mozTypesAt() {
        return [this._data[0].type];
      },
      mozGetDataAt() {
        return this._data[0].data;
      },
      mozSetDataAt(type, data, index) {
        this._data.push({
          type,
          data,
          index,
        });
      },
    };

    let event = {
      dataTransfer,
      preventDefault() {},
      stopPropagation() {},
    };

    tree._controller.setDataTransfer(event);

    Assert.equal(
      dataTransfer.mozTypesAt(0),
      PlacesUtils.TYPE_X_MOZ_PLACE,
      "Should have x-moz-place as the first data type."
    );

    let dataObject = JSON.parse(dataTransfer.mozGetDataAt(0));

    let guid = isVirtualRoot ? dataObject.concreteGuid : dataObject.itemGuid;

    Assert.equal(guid, sourceBm.guid, "Should have the correct guid.");
    Assert.equal(
      dataObject.title,
      PlacesUtils.bookmarks.getLocalizedTitle(sourceBm),
      "Should have the correct title."
    );

    Assert.equal(dataTransfer.dropEffect, dropEffect);

    let ip = new PlacesInsertionPoint({
      parentId: await PlacesTestUtils.promiseItemId(targetGuid),
      parentGuid: targetGuid,
      index: 0,
      orientation: Ci.nsITreeView.DROP_ON,
    });

    await PlacesControllerDragHelper.onDrop(ip, dataTransfer);
  });
}

// Unlike the dataTransfer mock created by simulateDrop, this one respects
// the index argument passed to mozTypesAt/mozGetDataAt/mozItemCount, since
// some tests need to tell apart the data of multiple dragged items.
function createIndexAwareDataTransfer() {
  return {
    _data: [],
    dropEffect: "move",
    mozCursor: "auto",
    get mozItemCount() {
      return new Set(this._data.map(item => item.index)).size;
    },
    mozTypesAt(index) {
      return this._data
        .filter(item => item.index == index)
        .map(item => item.type);
    },
    mozGetDataAt(type, index) {
      let item = this._data.find(
        entry => entry.index == index && entry.type == type
      );
      return item ? item.data : null;
    },
    mozSetDataAt(type, data, index) {
      this._data.push({ type, data, index });
    },
  };
}

add_task(async function test_move_normal_bm_in_sidebar() {
  let bm = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: "Fake",
    url: TEST_URL,
  });

  await simulateDrop([bm.guid], bm, "move", PlacesUtils.bookmarks.unfiledGuid);

  let newBm = await PlacesUtils.bookmarks.fetch(bm.guid);

  Assert.equal(
    newBm.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "Should have moved to the new parent."
  );

  let oldLocationBm = await PlacesUtils.bookmarks.fetch({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    index: 0,
  });

  Assert.ok(!oldLocationBm, "Should not have a bookmark at the old location.");
});

add_task(async function test_try_move_root_in_sidebar() {
  let menuFolder = await PlacesUtils.bookmarks.fetch(
    PlacesUtils.bookmarks.menuGuid
  );
  await simulateDrop(
    [menuFolder.guid],
    menuFolder,
    "move",
    PlacesUtils.bookmarks.toolbarGuid,
    true
  );

  menuFolder = await PlacesUtils.bookmarks.fetch(
    PlacesUtils.bookmarks.menuGuid
  );

  Assert.equal(
    menuFolder.parentGuid,
    PlacesUtils.bookmarks.rootGuid,
    "Should have remained in the root"
  );

  let newFolder = await PlacesUtils.bookmarks.fetch({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    index: 0,
  });

  Assert.notEqual(
    newFolder.guid,
    menuFolder.guid,
    "Should have created a different folder"
  );
  Assert.equal(
    newFolder.title,
    PlacesUtils.bookmarks.getLocalizedTitle(menuFolder),
    "Should have copied the folder title."
  );
  Assert.equal(
    newFolder.type,
    PlacesUtils.bookmarks.TYPE_BOOKMARK,
    "Should have a bookmark type (for a folder shortcut)."
  );
  Assert.equal(
    newFolder.url,
    `place:parent=${PlacesUtils.bookmarks.menuGuid}`,
    "Should have the correct url for the folder shortcut."
  );
});

add_task(async function test_try_move_bm_within_two_root_folder_queries() {
  await PlacesUtils.bookmarks.eraseEverything();

  let bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    title: "Fake",
    url: TEST_URL,
  });

  let queryType = Ci.nsINavHistoryQueryOptions.QUERY_TYPE_BOOKMARKS;

  let queries = await PlacesUtils.bookmarks.insertTree({
    guid: PlacesUtils.bookmarks.toolbarGuid,
    children: [
      {
        title: "Query",
        url: `place:queryType=${queryType}&terms=Fake`,
      },
    ],
  });

  await simulateDrop(
    [queries[0].guid, bookmark.guid],
    bookmark,
    "move",
    PlacesUtils.bookmarks.toolbarGuid
  );

  let newBm = await PlacesUtils.bookmarks.fetch(bookmark.guid);

  Assert.equal(
    newBm.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "should have moved the bookmark to a new folder."
  );
});

add_task(async function test_move_folder_with_child_bookmark_in_sidebar() {
  await PlacesUtils.bookmarks.eraseEverything();

  let folder = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Folder",
  });

  let bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: folder.guid,
    title: "Fake",
    url: TEST_URL,
  });

  await withSidebarTree("bookmarks", async function (tree) {
    tree.selectItems([folder.guid, bookmark.guid]);

    let dataTransfer = createIndexAwareDataTransfer();
    tree._controller.setDataTransfer({ dataTransfer });

    Assert.equal(
      dataTransfer.mozItemCount,
      1,
      "Should only add the folder to the data transfer, since the " +
        "bookmark is already a descendant of the selected folder."
    );

    tree.selectItems([PlacesUtils.bookmarks.unfiledGuid]);
    let unfiledIndex = tree.view.treeIndexForNode(tree.selectedNode);

    await tree.view.drop(unfiledIndex, Ci.nsITreeView.DROP_ON, dataTransfer);
  });

  let newFolder = await PlacesUtils.bookmarks.fetch(folder.guid);
  Assert.equal(
    newFolder.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "Should have moved the folder to the new parent."
  );

  let newBookmark = await PlacesUtils.bookmarks.fetch(bookmark.guid);
  Assert.equal(
    newBookmark.parentGuid,
    folder.guid,
    "Should still be inside the folder after the move, rather than " +
      "moved to the same depth as the folder."
  );
});

add_task(async function test_move_folder_with_nested_descendant_in_sidebar() {
  await PlacesUtils.bookmarks.eraseEverything();

  let folderA = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "a",
  });

  let folderB = await PlacesUtils.bookmarks.insert({
    parentGuid: folderA.guid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "b",
  });

  let bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: folderB.guid,
    title: "c-bookmark",
    url: TEST_URL,
  });

  await withSidebarTree("bookmarks", async function (tree) {
    // Select folder a and the bookmark nested two levels below it,
    // without selecting the intermediate folder b.
    tree.selectItems([folderA.guid, bookmark.guid]);

    let dataTransfer = createIndexAwareDataTransfer();
    tree._controller.setDataTransfer({ dataTransfer });

    Assert.equal(
      dataTransfer.mozItemCount,
      1,
      "Should only add folder a to the data transfer, since the " +
        "bookmark is already a descendant of the selected folder, even " +
        "though the intermediate folder b isn't itself selected."
    );

    tree.selectItems([PlacesUtils.bookmarks.unfiledGuid]);
    let unfiledIndex = tree.view.treeIndexForNode(tree.selectedNode);

    await tree.view.drop(unfiledIndex, Ci.nsITreeView.DROP_ON, dataTransfer);
  });

  let newFolderA = await PlacesUtils.bookmarks.fetch(folderA.guid);
  Assert.equal(
    newFolderA.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "Should have moved folder a to the new parent."
  );

  let newBookmark = await PlacesUtils.bookmarks.fetch(bookmark.guid);
  Assert.equal(
    newBookmark.parentGuid,
    folderB.guid,
    "Should still be inside folder b after the move, rather than moved " +
      "to the same depth as folder a."
  );
});

add_task(async function test_move_multiple_siblings_in_sidebar() {
  await PlacesUtils.bookmarks.eraseEverything();

  let folderA = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "a",
  });

  let folderB = await PlacesUtils.bookmarks.insert({
    parentGuid: folderA.guid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "b",
  });

  let bookmark1 = await PlacesUtils.bookmarks.insert({
    parentGuid: folderB.guid,
    title: "bookmark-1",
    url: TEST_URL,
  });

  await PlacesUtils.bookmarks.insert({
    parentGuid: folderA.guid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "c",
  });

  let bookmark2 = await PlacesUtils.bookmarks.insert({
    parentGuid: folderA.guid,
    title: "bookmark-2",
    url: TEST_URL,
  });

  await withSidebarTree("bookmarks", async function (tree) {
    // Select folder b and bookmark-2, two siblings under folder a that
    // are neither ancestor nor descendant of each other, so both should
    // be dragged and moved on their own.
    tree.selectItems([folderB.guid, bookmark2.guid]);

    let dataTransfer = createIndexAwareDataTransfer();
    tree._controller.setDataTransfer({ dataTransfer });

    Assert.equal(
      dataTransfer.mozItemCount,
      2,
      "Should add both folder b and bookmark-2 to the data transfer, " +
        "since neither is a descendant of the other."
    );

    tree.selectItems([PlacesUtils.bookmarks.unfiledGuid]);
    let unfiledIndex = tree.view.treeIndexForNode(tree.selectedNode);

    await tree.view.drop(unfiledIndex, Ci.nsITreeView.DROP_ON, dataTransfer);
  });

  let newFolderB = await PlacesUtils.bookmarks.fetch(folderB.guid);
  Assert.equal(
    newFolderB.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "Should have moved folder b to the new parent."
  );

  let newBookmark1 = await PlacesUtils.bookmarks.fetch(bookmark1.guid);
  Assert.equal(
    newBookmark1.parentGuid,
    folderB.guid,
    "Should still be inside folder b after the move."
  );

  let newBookmark2 = await PlacesUtils.bookmarks.fetch(bookmark2.guid);
  Assert.equal(
    newBookmark2.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "Should have moved bookmark-2 to the new parent alongside folder b."
  );
});

add_task(async function test_move_within_itself() {
  await PlacesUtils.bookmarks.eraseEverything();

  let bookmarks = await PlacesUtils.bookmarks.insertTree({
    guid: PlacesUtils.bookmarks.unfiledGuid,
    children: [
      {
        title: "bm1",
        url: "https://www.example.com/bookmark1.html",
      },
      {
        title: "bm2",
        url: "https://www.example.com/bookmark2.html",
      },
      {
        title: "bm3",
        url: "https://www.example.com/bookmark3.html",
      },
    ],
  });

  await withSidebarTree("bookmarks", async function (tree) {
    // Select the folder containing the bookmarks
    // and save its index position
    tree.selectItems([PlacesUtils.bookmarks.unfiledGuid]);
    let unfiledFolderIndex = tree.view.treeIndexForNode(tree.selectedNode);

    let guids = bookmarks.map(bookmark => bookmark.guid);
    tree.selectItems(guids);
    let dataTransfer = {
      _data: [],
      dropEffect: "move",
      mozCursor: "auto",
      mozItemCount: bookmarks.length,
      types: [PlacesUtils.TYPE_X_MOZ_PLACE],
      mozTypesAt() {
        return [this._data[0].type];
      },
      mozGetDataAt() {
        return this._data[0].data;
      },
      mozSetDataAt(type, data, index) {
        this._data.push({
          type,
          data,
          index,
        });
      },
    };

    bookmarks.forEach((bookmark, index) => {
      // Index positions of the newly created bookmarks
      bookmark.rowIndex = unfiledFolderIndex + index + 1;
      bookmark.node = tree.view.nodeForTreeIndex(bookmark.rowIndex);
      bookmark.cachedBookmarkIndex = bookmark.node.bookmarkIndex;
    });

    let assertBookmarksHaveNotChangedPosition = () => {
      bookmarks.forEach(bookmark => {
        Assert.equal(
          bookmark.node.bookmarkIndex,
          bookmark.cachedBookmarkIndex,
          "should not have moved the bookmark."
        );
      });
    };

    // Mimic "drag" events
    let dragStartEvent = new CustomEvent("dragstart", {
      bubbles: true,
    });
    dragStartEvent.dataTransfer = dataTransfer;

    let dragEndEvent = new CustomEvent("dragend", {
      bubbles: true,
    });

    let treeChildren = tree.view._element.children[1];

    treeChildren.dispatchEvent(dragStartEvent);
    await tree.view.drop(
      bookmarks[1].rowIndex,
      Ci.nsITreeView.DROP_ON,
      dataTransfer
    );
    treeChildren.dispatchEvent(dragEndEvent);
    assertBookmarksHaveNotChangedPosition();

    treeChildren.dispatchEvent(dragStartEvent);
    await tree.view.drop(
      bookmarks[2].rowIndex,
      Ci.nsITreeView.DROP_ON,
      dataTransfer
    );
    treeChildren.dispatchEvent(dragEndEvent);
    assertBookmarksHaveNotChangedPosition();
  });
});
