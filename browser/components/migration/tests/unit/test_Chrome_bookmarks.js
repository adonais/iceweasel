"use strict";

const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
);

const { PlacesUIUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/places/PlacesUIUtils.sys.mjs"
);

let rootDir = do_get_file("chromefiles/", true);

add_task(async function setup_fakePaths() {
  let pathId;
  if (AppConstants.platform == "macosx") {
    pathId = "ULibDir";
  } else if (AppConstants.platform == "win") {
    pathId = "LocalAppData";
  } else {
    pathId = "Home";
  }
  registerFakePath(pathId, rootDir);
});

add_task(async function setup_initialBookmarks() {
  let bookmarks = [];
  for (let i = 0; i < PlacesUIUtils.NUM_TOOLBAR_BOOKMARKS_TO_UNHIDE + 1; i++) {
    bookmarks.push({ url: "https://example.com/" + i, title: "" + i });
  }

  // Ensure we have enough items in both the menu and toolbar to trip creating a "from" folder.
  await PlacesUtils.bookmarks.insertTree({
    guid: PlacesUtils.bookmarks.toolbarGuid,
    children: bookmarks,
  });
  await PlacesUtils.bookmarks.insertTree({
    guid: PlacesUtils.bookmarks.menuGuid,
    children: bookmarks,
  });
});

async function testBookmarks(
  migratorKey,
  subDirs,
  bookmarksFileName = "Bookmarks"
) {
  if (AppConstants.platform == "macosx") {
    subDirs.unshift("Application Support");
  } else if (AppConstants.platform == "win") {
    subDirs.push("User Data");
  } else {
    subDirs.unshift(".config");
  }

  let target = rootDir.clone();

  // Pretend this is the default profile
  while (subDirs.length) {
    target.append(subDirs.shift());
  }

  let localStatePath = PathUtils.join(target.path, "Local State");
  await IOUtils.writeJSON(localStatePath, []);

  target.append("Default");

  await IOUtils.makeDirectory(target.path, {
    createAncestor: true,
    ignoreExisting: true,
  });

  // Copy Favicons database into Default profile
  const sourcePath = do_get_file(
    "AppData/Local/Google/Chrome/User Data/Default/Favicons"
  ).path;
  await IOUtils.copy(sourcePath, target.path);

  // Get page url and the image data for each favicon
  let favicons = await MigrationUtils.getRowsFromDBWithoutLocks(
    sourcePath,
    "Chrome Bookmark Favicons",
    `SELECT page_url, image_data FROM icon_mapping
     INNER JOIN favicon_bitmaps ON (favicon_bitmaps.icon_id = icon_mapping.icon_id)
    `
  );

  // Clean up any bookmark files left over from a previous test run so that
  // each test only exercises the file(s) it writes.
  for (let leafName of ["Bookmarks", "AccountBookmarks"]) {
    await IOUtils.remove(PathUtils.join(target.path, leafName), {
      ignoreAbsent: true,
    });
  }

  target.append(bookmarksFileName);

  let bookmarksData = createChromeBookmarkStructure();
  await IOUtils.writeJSON(target.path, bookmarksData);

  let migrator = await MigrationUtils.getMigrator(migratorKey);
  // Migrator instances (and their resolved resources) are cached across
  // add_task runs, so drop any cached resources to make sure this run reads
  // the bookmark file(s) we just wrote from disk.
  migrator._resourcesByProfile = {};
  Assert.ok(await migrator.hasPermissions(), "Has permissions");
  // Sanity check for the source.
  Assert.ok(await migrator.isSourceAvailable());

  let itemsSeen = { bookmarks: 0, folders: 0 };
  let listener = events => {
    for (let event of events) {
      itemsSeen[
        event.itemType == PlacesUtils.bookmarks.TYPE_FOLDER
          ? "folders"
          : "bookmarks"
      ]++;
    }
  };

  PlacesUtils.observers.addListener(["bookmark-added"], listener);
  const PROFILE = {
    id: "Default",
    name: "Default",
  };
  let observerNotified = false;
  Services.obs.addObserver((aSubject, aTopic, aData) => {
    let [toolbar, visibility] = JSON.parse(aData);
    Assert.equal(
      toolbar,
      CustomizableUI.AREA_BOOKMARKS,
      "Notification should be received for bookmarks toolbar"
    );
    Assert.equal(
      visibility,
      "true",
      "Notification should say to reveal the bookmarks toolbar"
    );
    observerNotified = true;
  }, "browser-set-toolbar-visibility");
  const initialToolbarCount = await getFolderItemCount(
    PlacesUtils.bookmarks.toolbarGuid
  );
  const initialUnfiledCount = await getFolderItemCount(
    PlacesUtils.bookmarks.unfiledGuid
  );
  const initialmenuCount = await getFolderItemCount(
    PlacesUtils.bookmarks.menuGuid
  );

  await promiseMigration(
    migrator,
    MigrationUtils.resourceTypes.BOOKMARKS,
    PROFILE
  );
  const postToolbarCount = await getFolderItemCount(
    PlacesUtils.bookmarks.toolbarGuid
  );
  const postUnfiledCount = await getFolderItemCount(
    PlacesUtils.bookmarks.unfiledGuid
  );
  const postmenuCount = await getFolderItemCount(
    PlacesUtils.bookmarks.menuGuid
  );

  Assert.equal(
    postUnfiledCount - initialUnfiledCount,
    210,
    "Should have seen 210 items in unsorted bookmarks"
  );
  Assert.equal(
    postToolbarCount - initialToolbarCount,
    105,
    "Should have seen 105 items in toolbar"
  );
  Assert.equal(
    postmenuCount - initialmenuCount,
    0,
    "Should have seen 0 items in menu toolbar"
  );

  PlacesUtils.observers.removeListener(["bookmark-added"], listener);

  Assert.equal(itemsSeen.bookmarks, 300, "Should have seen 300 bookmarks.");
  Assert.equal(itemsSeen.folders, 15, "Should have seen 15 folders.");
  Assert.equal(
    MigrationUtils._importQuantities.bookmarks,
    itemsSeen.bookmarks + itemsSeen.folders,
    "Telemetry reporting correct."
  );
  Assert.ok(observerNotified, "The observer should be notified upon migration");

  for (const favicon of favicons) {
    await assertFavicon(
      favicon.getResultByName("page_url"),
      favicon.getResultByName("image_data"),
      "image/png"
    );
  }
}

add_task(async function test_Chrome() {
  // Expire all favicons before the test to make sure favicons are imported
  PlacesUtils.favicons.expireAllFavicons();
  let subDirs =
    AppConstants.platform == "linux" ? ["google-chrome"] : ["Google", "Chrome"];
  await testBookmarks("chrome", subDirs);
});

add_task(async function test_Chrome_account_bookmarks() {
  // When signed in to a Google account, Chrome stores bookmarks in an
  // "AccountBookmarks" file instead of "Bookmarks". Ensure we still import
  // them. See bug 2071625.
  PlacesUtils.favicons.expireAllFavicons();
  let subDirs =
    AppConstants.platform == "linux" ? ["google-chrome"] : ["Google", "Chrome"];
  await testBookmarks("chrome", subDirs, "AccountBookmarks");
});

add_task(async function test_ChromiumEdge() {
  PlacesUtils.favicons.expireAllFavicons();
  if (AppConstants.platform == "linux") {
    // Edge isn't available on Linux.
    return;
  }
  let subDirs =
    AppConstants.platform == "macosx"
      ? ["Microsoft Edge"]
      : ["Microsoft", "Edge"];
  await testBookmarks("chromium-edge", subDirs);
});

add_task(async function test_Chrome_both_bookmark_files() {
  // When both a "Bookmarks" (local) and "AccountBookmarks" (signed-in) file
  // are present, bookmarks from both should be imported. See bug 2071625.
  PlacesUtils.favicons.expireAllFavicons();

  let subDirs =
    AppConstants.platform == "linux" ? ["google-chrome"] : ["Google", "Chrome"];
  if (AppConstants.platform == "macosx") {
    subDirs.unshift("Application Support");
  } else if (AppConstants.platform == "win") {
    subDirs.push("User Data");
  } else {
    subDirs.unshift(".config");
  }

  let target = rootDir.clone();
  while (subDirs.length) {
    target.append(subDirs.shift());
  }
  let localStatePath = PathUtils.join(target.path, "Local State");
  await IOUtils.writeJSON(localStatePath, []);

  target.append("Default");
  await IOUtils.makeDirectory(target.path, {
    createAncestor: true,
    ignoreExisting: true,
  });

  const LOCAL_URL = "https://local-bookmarks-only.example.com/";
  const ACCOUNT_URL = "https://account-bookmarks-only.example.com/";

  let localData = {
    roots: {
      bookmark_bar: {
        children: [{ url: LOCAL_URL, name: "local bookmark", type: "url" }],
      },
      other: { children: [] },
      synced: { children: [] },
    },
  };
  let accountData = {
    roots: {
      bookmark_bar: {
        children: [{ url: ACCOUNT_URL, name: "account bookmark", type: "url" }],
      },
      other: { children: [] },
      synced: { children: [] },
    },
  };

  await IOUtils.writeJSON(PathUtils.join(target.path, "Bookmarks"), localData);
  await IOUtils.writeJSON(
    PathUtils.join(target.path, "AccountBookmarks"),
    accountData
  );

  let migrator = await MigrationUtils.getMigrator("chrome");
  // Drop cached resources so the migration reads the files we just wrote.
  migrator._resourcesByProfile = {};
  Assert.ok(await migrator.isSourceAvailable(), "Source is available");

  await promiseMigration(migrator, MigrationUtils.resourceTypes.BOOKMARKS, {
    id: "Default",
    name: "Default",
  });

  Assert.ok(
    await PlacesUtils.bookmarks.fetch({ url: LOCAL_URL }),
    "Bookmark from the local Bookmarks file should be imported"
  );
  Assert.ok(
    await PlacesUtils.bookmarks.fetch({ url: ACCOUNT_URL }),
    "Bookmark from the AccountBookmarks file should be imported"
  );
});

add_task(async function test_Chrome_merges_same_named_toolbar_subfolders() {
  // When both bookmark files contain a subfolder with the same name under the
  // bookmarks toolbar, items from both files should be merged into a single
  // subfolder rather than creating a duplicate folder. See bug 2071625.
  PlacesUtils.favicons.expireAllFavicons();

  let subDirs =
    AppConstants.platform == "linux" ? ["google-chrome"] : ["Google", "Chrome"];
  if (AppConstants.platform == "macosx") {
    subDirs.unshift("Application Support");
  } else if (AppConstants.platform == "win") {
    subDirs.push("User Data");
  } else {
    subDirs.unshift(".config");
  }

  let target = rootDir.clone();
  while (subDirs.length) {
    target.append(subDirs.shift());
  }
  let localStatePath = PathUtils.join(target.path, "Local State");
  await IOUtils.writeJSON(localStatePath, []);

  target.append("Default");
  await IOUtils.makeDirectory(target.path, {
    createAncestor: true,
    ignoreExisting: true,
  });

  // Remove any bookmark files left over from previous tests.
  for (let leafName of ["Bookmarks", "AccountBookmarks"]) {
    await IOUtils.remove(PathUtils.join(target.path, leafName), {
      ignoreAbsent: true,
    });
  }

  const FOLDER_NAME = "Shared Folder";
  const LOCAL_URL = "https://local-in-shared-folder.example.com/";
  const ACCOUNT_URL = "https://account-in-shared-folder.example.com/";

  let makeData = (url, name) => ({
    roots: {
      bookmark_bar: {
        children: [
          {
            type: "folder",
            name: FOLDER_NAME,
            children: [{ url, name, type: "url" }],
          },
        ],
      },
      other: { children: [] },
      synced: { children: [] },
    },
  });

  await IOUtils.writeJSON(
    PathUtils.join(target.path, "Bookmarks"),
    makeData(LOCAL_URL, "local bookmark")
  );
  await IOUtils.writeJSON(
    PathUtils.join(target.path, "AccountBookmarks"),
    makeData(ACCOUNT_URL, "account bookmark")
  );

  let migrator = await MigrationUtils.getMigrator("chrome");
  // Drop cached resources so the migration reads the files we just wrote.
  migrator._resourcesByProfile = {};
  Assert.ok(await migrator.isSourceAvailable(), "Source is available");

  await promiseMigration(migrator, MigrationUtils.resourceTypes.BOOKMARKS, {
    id: "Default",
    name: "Default",
  });

  let toolbar = await PlacesUtils.promiseBookmarksTree(
    PlacesUtils.bookmarks.toolbarGuid
  );
  let matchingFolders = (toolbar.children || []).filter(
    child =>
      child.type == PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER &&
      child.title == FOLDER_NAME
  );
  Assert.equal(
    matchingFolders.length,
    1,
    "Only one merged subfolder should be created in the toolbar"
  );

  let urls = (matchingFolders[0].children || []).map(child => child.uri).sort();
  Assert.deepEqual(
    urls,
    [ACCOUNT_URL, LOCAL_URL].sort(),
    "The merged subfolder should contain items from both files"
  );
});

async function getFolderItemCount(guid) {
  let results = await PlacesUtils.promiseBookmarksTree(guid);

  return results.itemsCount;
}
