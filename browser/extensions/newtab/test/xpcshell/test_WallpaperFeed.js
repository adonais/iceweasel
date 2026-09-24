/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  Utils: "resource://services-settings/Utils.sys.mjs",
  buildSavedWallpaperFilename:
    "resource://newtab/lib/Wallpapers/WallpaperFileNames.mjs",
  getDetailsFilename: "resource://newtab/lib/Wallpapers/WallpaperFileNames.mjs",
  getThumbnailFilename:
    "resource://newtab/lib/Wallpapers/WallpaperFileNames.mjs",
  parseWallpaperFilename:
    "resource://newtab/lib/Wallpapers/WallpaperFileNames.mjs",
  reducers: "resource://newtab/common/Reducers.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  WallpaperFeed: "resource://newtab/lib/Wallpapers/WallpaperFeed.sys.mjs",
});

const PREF_WALLPAPERS_ENABLED =
  "browser.newtabpage.activity-stream.newtabWallpapers.enabled";

const PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID =
  "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.uuid";

const PREF_WALLPAPERS_CUSTOM_WALLPAPER_THEME =
  "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.theme";

const PREF_WALLPAPERS_CUSTOM_WALLPAPER_POSITION =
  "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.position";

const PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED =
  "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.library.enabled";

// Two wallpaper names from before the library, when a filename was a bare UUID.
const LEGACY_UUID = "550e8400-e29b-41d4-a716-446655440000";
const LEGACY_UUID_TWO = "7f2a1c93-4d1e-4a8c-9f3b-2e6d5a1b0c74";

const PREF_INITIAL_WALLPAPER =
  "browser.newtabpage.activity-stream.newtabWallpapers.initialWallpaper";
const PREF_SELECTED_WALLPAPER =
  "browser.newtabpage.activity-stream.newtabWallpapers.wallpaper";

const PREF_WALLPAPERS_USER_ENABLED_MIGRATED =
  "browser.newtabpage.activity-stream.newtabWallpapers.user.enabled.migrated";

const PREF_WALLPAPERS_CUSTOM_WALLPAPER_ENABLED =
  "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.enabled";

function getWallpaperFeedForTest() {
  let feed = new WallpaperFeed();

  feed.store = {
    dispatch: sinon.spy(),
    // The feed reads the library flag out of Prefs state, which is where
    // PrefsFeed puts every configured pref.
    getState: () => ({
      Prefs: {
        values: {
          "newtabWallpapers.customWallpaper.library.enabled":
            Services.prefs.getBoolPref(
              PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
              false
            ),
        },
      },
    }),
  };

  return feed;
}

// The pref is channel-derived, so a bare xpcshell profile has it unset and
// every library test would silently exercise the single-image path instead.
add_setup(async function () {
  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    true
  );
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED
    );
  });
});

add_task(async function test_construction() {
  let feed = new WallpaperFeed();

  info("WallpaperFeed constructor should create initial values");

  Assert.ok(feed, "Could construct a WallpaperFeed");
  Assert.strictEqual(feed.loaded, false, "WallpaperFeed is not loaded");
  Assert.strictEqual(
    feed.wallpaperClient,
    null,
    "wallpaperClient is initialized as null"
  );
});

add_task(async function test_onAction_INIT() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  const attachment = {
    attachment: {
      location: "attachment",
    },
  };
  sandbox.stub(feed, "RemoteSettings").returns({
    get: () => [attachment],
    on: () => {},
  });
  feed.store = {
    dispatch: sinon.spy(),
  };
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");

  info("WallpaperFeed.onAction INIT should initialize wallpapers");

  await feed.onAction({
    type: actionTypes.INIT,
  });

  Assert.greaterOrEqual(feed.store.dispatch.callCount, 3);

  const matchingCall = feed.store.dispatch
    .getCalls()
    .find(call => call.args[0].type === actionTypes.WALLPAPERS_SET);

  Assert.ok(matchingCall, "Expected a WALLPAPERS_SET dispatch call");
  Assert.deepEqual(
    matchingCall.args[0],
    actionCreators.BroadcastToContent({
      type: actionTypes.WALLPAPERS_SET,
      data: [
        {
          ...attachment,
          background_position: "center",
          category: "",
          order: 0,
          wallpaperUrl: "http://localhost:8888/base_url/attachment",
          thumbnail: null,
        },
      ],
      meta: {
        isStartup: true,
      },
    })
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  sandbox.restore();
});

add_task(async function test_onAction_PREF_CHANGED() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperSetup").returns();

  info("WallpaperFeed.onAction PREF_CHANGED should call wallpaperSetup");

  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "newtabWallpapers.enabled" },
  });

  Assert.ok(feed.wallpaperSetup.calledOnce);
  Assert.ok(feed.wallpaperSetup.calledWith(false));

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  sandbox.restore();
});

add_task(async function test_onAction_WALLPAPER_UPLOAD() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  const fileData = {};
  const savedPath = PathUtils.join(
    feed.libraryDirectory,
    `v1-custom-light-center-1-${LEGACY_UUID}`
  );

  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperUpload").resolves(savedPath);

  info("WallpaperFeed.onAction WALLPAPER_UPLOAD should call wallpaperUpload");

  await feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: {
      file: fileData,
      theme: "light",
      type: "potd",
      name: "A picture of a bird",
      publishedDate: "2026-08-28",
      requestId: "request-1",
    },
    meta: { fromTarget: "port-1" },
  });

  Assert.ok(feed.wallpaperUpload.calledOnce);
  Assert.ok(
    feed.wallpaperUpload.calledWithExactly(
      fileData,
      "light",
      "potd",
      {
        name: "A picture of a bird",
        publishedDate: "2026-08-28",
        thumbnail: undefined,
      },
      "port-1"
    ),
    "The kind of upload, its name, date and the page to report to are passed through"
  );
  const result = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .find(action => action.type === actionTypes.WALLPAPER_UPLOAD_RESULT);
  Assert.deepEqual(
    result.data,
    {
      requestId: "request-1",
      filename: PathUtils.filename(savedPath),
    },
    "The asking tab receives the saved filename"
  );
  Assert.equal(result.meta.toTarget, "port-1", "Only the asking tab is told");

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);

  sandbox.restore();
});

add_task(async function test_onAction_WALLPAPER_UPLOAD_reports_failure() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  sandbox.stub(feed, "wallpaperUpload").resolves(null);

  await feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: {
      file: {},
      theme: "light",
      requestId: "request-2",
    },
    meta: { fromTarget: "port-2" },
  });

  const result = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .find(action => action.type === actionTypes.WALLPAPER_UPLOAD_RESULT);
  Assert.deepEqual(
    result.data,
    { requestId: "request-2", filename: null },
    "The asking tab is told that the upload failed"
  );

  sandbox.restore();
});

add_task(async function test_Wallpaper_Upload() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest(sandbox);

  info(
    "File uploaded via WallpaperFeed.wallpaperUpload should match the saved file"
  );

  // Create test file to upload with custom contents to verify the same file was stored in the /wallpaper dir successfully
  const testUploadContents = "custom-wallpaper-upload-test";
  const testFileName = "test-wallpaper.jpg";

  const testWallpaperFile = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    testFileName
  );

  await IOUtils.writeUTF8(testWallpaperFile, testUploadContents);
  let testNsIFile = await IOUtils.getFile(testWallpaperFile);
  let testFileToUpload = await File.createFromNsIFile(testNsIFile);

  // Upload test file
  let writtenFile = await feed.wallpaperUpload(testFileToUpload, "light");

  // Check if test file exists in WallpaperFeed directory
  Assert.ok(await IOUtils.exists(writtenFile));

  // Check if stored file has the same unique contents as the original test file contents
  const storedWallpaperFeedFileContent = await IOUtils.readUTF8(writtenFile);
  Assert.equal(storedWallpaperFeedFileContent, testUploadContents);

  // Check UUID of file name matches stored PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID pref value
  const writtenUUID = PathUtils.filename(writtenFile);
  const storedUUID = Services.prefs.getStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID
  );

  // Confirm written filename UUID matches the stored UUID pref
  Assert.equal(writtenUUID, storedUUID);

  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("newtabWallpapers.customWallpaper.theme", "light")
    )
  );

  // Cleanup files
  await IOUtils.remove(testWallpaperFile);
  await IOUtils.remove(writtenFile);
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);

  sandbox.restore();
});

add_task(async function test_updateWallpapers_category_order() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  Services.prefs.setBoolPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_ENABLED, true);

  const records = [
    { category: "solid-colors", attachment: { location: "a" } },
    { category: "photographs", attachment: { location: "b" } },
    { category: "celestial", attachment: { location: "c" } },
    { category: "abstracts", attachment: { location: "d" } },
    { category: "firefox", attachment: { location: "e" } },
  ];

  sandbox.stub(feed, "RemoteSettings").returns({
    get: () => records,
    on: () => {},
  });
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");

  feed.store = { dispatch: sinon.spy() };

  info(
    "WallpaperFeed.updateWallpapers should dispatch categories in the correct display order"
  );

  await feed.wallpaperSetup(false);

  const categoryCall = feed.store.dispatch
    .getCalls()
    .find(call => call.args[0].type === actionTypes.WALLPAPERS_CATEGORY_SET);

  Assert.ok(categoryCall, "Expected a WALLPAPERS_CATEGORY_SET dispatch call");
  Assert.deepEqual(categoryCall.args[0].data, [
    "custom-wallpaper",
    "firefox",
    "abstracts",
    "celestial",
    "photographs",
    "solid-colors",
  ]);

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_ENABLED);
  sandbox.restore();
});

add_task(async function test_updateWallpapers_empty_records() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  Services.prefs.setBoolPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_ENABLED, true);

  sandbox.stub(feed, "RemoteSettings").returns({
    get: () => [],
    on: () => {},
  });

  feed.store = { dispatch: sinon.spy() };

  info(
    "WallpaperFeed.updateWallpapers should still dispatch custom-wallpaper " +
      "category when remote settings returns no records"
  );

  await feed.wallpaperSetup(false);

  const categoryCall = feed.store.dispatch
    .getCalls()
    .find(call => call.args[0].type === actionTypes.WALLPAPERS_CATEGORY_SET);

  Assert.ok(
    categoryCall,
    "Expected a WALLPAPERS_CATEGORY_SET dispatch call even with empty records"
  );
  Assert.deepEqual(categoryCall.args[0].data, ["custom-wallpaper"]);

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_ENABLED);
  sandbox.restore();
});

add_task(async function test_onAction_PREF_CHANGED_customColor() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperTeardown").returns();
  sandbox.stub(feed, "wallpaperSetup").returns();

  info(
    "WallpaperFeed.onAction PREF_CHANGED with customColor.enabled " +
      "should teardown and re-setup wallpapers"
  );

  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "newtabWallpapers.customColor.enabled" },
  });

  Assert.ok(
    feed.wallpaperTeardown.calledOnce,
    "wallpaperTeardown should be called when customColor.enabled pref changes"
  );
  Assert.ok(
    feed.wallpaperSetup.calledOnce,
    "wallpaperSetup should be called when customColor.enabled pref changes"
  );
  Assert.ok(
    feed.wallpaperSetup.calledWith(false),
    "wallpaperSetup should be called with isStartup=false"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  sandbox.restore();
});

add_task(async function test_onAction_PREF_CHANGED_nova() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();
  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperTeardown").returns();
  sandbox.stub(feed, "wallpaperSetup").returns();

  info(
    "WallpaperFeed.onAction PREF_CHANGED with nova.enabled " +
      "should teardown and re-setup wallpapers"
  );

  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "nova.enabled" },
  });

  Assert.ok(
    feed.wallpaperTeardown.calledOnce,
    "wallpaperTeardown should be called when nova.enabled pref changes"
  );
  Assert.ok(
    feed.wallpaperSetup.calledOnce,
    "wallpaperSetup should be called when nova.enabled pref changes"
  );
  Assert.ok(
    feed.wallpaperSetup.calledWith(false),
    "wallpaperSetup should be called with isStartup=false"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  sandbox.restore();
});

/**
 * Tests that the parent process sends down a moz-newtab-wallpaper:// protocol URI
 * to newtab to render as the background.
 */
add_task(async function test_Wallpaper_protocolURI() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest(sandbox);

  // Stub out a fake RemoteClient so that updateWallpapers won't complain
  // when we eventually call it.
  feed.wallpaperClient = {
    async get() {
      return [];
    },
  };

  const testUploadContents = "custom-wallpaper-upload-test";
  const testFileName = "test-wallpaper.jpg";

  const testWallpaperFile = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    testFileName
  );

  await IOUtils.writeUTF8(testWallpaperFile, testUploadContents);
  let testNsIFile = await IOUtils.getFile(testWallpaperFile);
  let testFileToUpload = await File.createFromNsIFile(testNsIFile);

  // Upload test file
  let writtenFile = await feed.wallpaperUpload(testFileToUpload, "light");

  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WALLPAPERS_CUSTOM_SET,
        data: sandbox.match("moz-newtab-wallpaper://"),
      })
    ),
    "Should dispatch WALLPAPERS_CUSTOM_SET with moz-newtab-wallpaper:// URI"
  );

  // Verify the protocol URI uses the correct scheme and gets stored in state
  const [action] = feed.store.dispatch.getCall(0).args;
  const wallpaperURI = action.data;

  Assert.ok(
    wallpaperURI.startsWith("moz-newtab-wallpaper://"),
    "Wallpaper URI should use moz-newtab-wallpaper:// protocol"
  );

  const state = reducers.Wallpapers(null, action);
  Assert.equal(
    state.uploadedWallpaper,
    wallpaperURI,
    "Should have updated the state to include the protocol URI"
  );

  // Cleanup files
  await IOUtils.remove(testWallpaperFile);
  await IOUtils.remove(writtenFile);
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);
});

add_task(
  async function test_wallpaperSetup_migration_with_existing_wallpaper() {
    let sandbox = sinon.createSandbox();
    let feed = new WallpaperFeed();

    Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "beach");
    Services.prefs.clearUserPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED);

    sandbox.stub(feed, "RemoteSettings").returns({
      get: () => [],
      on: () => {},
    });
    feed.store = { dispatch: sinon.spy() };

    info(
      "wallpaperSetup should set user.enabled to true when a wallpaper was previously selected"
    );

    await feed.wallpaperSetup(true);

    Assert.ok(
      Services.prefs.getBoolPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED),
      "Migration marker should be set after running"
    );
    Assert.ok(
      feed.store.dispatch.calledWith(
        actionCreators.SetPref("newtabWallpapers.user.enabled", true)
      ),
      "Should dispatch user.enabled = true when a wallpaper is already set"
    );

    Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
    Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
    Services.prefs.clearUserPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED);
    sandbox.restore();
  }
);

add_task(
  async function test_wallpaperSetup_migration_without_existing_wallpaper() {
    let sandbox = sinon.createSandbox();
    let feed = new WallpaperFeed();

    Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
    Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
    Services.prefs.clearUserPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED);

    sandbox.stub(feed, "RemoteSettings").returns({
      get: () => [],
      on: () => {},
    });
    feed.store = { dispatch: sinon.spy() };

    info(
      "wallpaperSetup should not set user.enabled when no wallpaper was previously selected"
    );

    await feed.wallpaperSetup(true);

    Assert.ok(
      Services.prefs.getBoolPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED),
      "Migration marker should be set after running"
    );
    Assert.ok(
      !feed.store.dispatch.calledWith(
        actionCreators.SetPref("newtabWallpapers.user.enabled", true)
      ),
      "Should not dispatch user.enabled = true when no wallpaper is set"
    );

    Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
    Services.prefs.clearUserPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED);
    sandbox.restore();
  }
);

add_task(async function test_wallpaperSetup_migration_does_not_rerun() {
  let sandbox = sinon.createSandbox();
  let feed = new WallpaperFeed();

  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "beach");
  Services.prefs.setBoolPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED, true);

  sandbox.stub(feed, "RemoteSettings").returns({
    get: () => [],
    on: () => {},
  });
  feed.store = { dispatch: sinon.spy() };

  info(
    "wallpaperSetup should not set user.enabled when migration has already run"
  );

  await feed.wallpaperSetup(true);

  Assert.ok(
    !feed.store.dispatch.calledWith(
      actionCreators.SetPref("newtabWallpapers.user.enabled", true)
    ),
    "Should not dispatch user.enabled = true when migration already ran"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);
  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  Services.prefs.clearUserPref(PREF_WALLPAPERS_USER_ENABLED_MIGRATED);
  sandbox.restore();
});

// Must match WALLPAPER_FILE_LOCK in the feed.
const WALLPAPER_FILE_LOCK_FOR_TEST = "newtab-wallpaper-file";

const wallpaperDirForTest = () =>
  PathUtils.join(PathUtils.profileDir, "wallpaper");

// Saved images live one level down, where the cleanup in older New Tab versions
// cannot reach them. Only the applied one is copied up into the wallpaper folder.
const libraryDirForTest = () =>
  PathUtils.join(wallpaperDirForTest(), "library");

const appliedCopyForTest = libraryPath =>
  PathUtils.join(wallpaperDirForTest(), PathUtils.filename(libraryPath));

const clearWallpaperDirForTest = async () => {
  await IOUtils.remove(wallpaperDirForTest(), {
    recursive: true,
    ignoreAbsent: true,
  });
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);
  Services.prefs.clearUserPref(
    "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.nextNumber"
  );
};

add_task(async function test_upload_sweeps_before_writing() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Every upload should clear orphans before writing its own file");

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  // A wallpaper written before the library existed, with nothing pointing at it.
  const legacyOrphan = PathUtils.join(dir, LEGACY_UUID);
  await IOUtils.writeUTF8(legacyOrphan, "junk");
  // A .tmp left by a write that was interrupted partway through.
  await IOUtils.writeUTF8(
    PathUtils.join(dir, "orphan-uuid.tmp"),
    "interrupted"
  );
  // A name the library does not recognize, which is not ours to remove.
  const unknown = PathUtils.join(dir, "holiday-photo.jpg");
  await IOUtils.writeUTF8(unknown, "someone else's file");

  const written = await feed.wallpaperUpload(
    new Blob(["fresh"], { type: "image/png" }),
    "light"
  );

  Assert.deepEqual(
    (await IOUtils.getChildren(dir)).sort(),
    [unknown, libraryDirForTest(), appliedCopyForTest(written)].sort(),
    "Orphans and leftover .tmp files are gone, unrecognized names are left"
  );
  Assert.deepEqual(
    await IOUtils.getChildren(libraryDirForTest()),
    [written],
    "The saved image itself is in the library"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_upload_sweep_keeps_directories() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The sweep an upload runs should only remove regular files");

  const dir = wallpaperDirForTest();
  // Named like a wallpaper the sweep would remove, so only the check that it
  // is a regular file keeps it.
  const nested = PathUtils.join(dir, LEGACY_UUID_TWO);
  await IOUtils.makeDirectory(nested, { createAncestors: true });
  // Orphans either side of the directory, so a sweep that trips over it leaves
  // one of them behind whichever order the children come back in.
  await IOUtils.writeUTF8(PathUtils.join(dir, "aaa-orphan.tmp"), "before");
  await IOUtils.writeUTF8(PathUtils.join(dir, "zzz-orphan.tmp"), "after");

  const written = await feed.wallpaperUpload(
    new Blob(["fresh"], { type: "image/png" }),
    "light"
  );

  const children = await IOUtils.getChildren(dir);
  Assert.ok(children.includes(nested), "A directory is left alone");
  Assert.ok(
    children.includes(appliedCopyForTest(written)),
    "The new upload is applied"
  );
  Assert.equal(
    children.length,
    3,
    "Both orphaned files are removed, the library folder stays"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_concurrent_uploads_are_serialized() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Two uploads at once should both be saved, and the later one applied");

  const [first, second] = await Promise.all([
    feed.wallpaperUpload(new Blob(["one"], { type: "image/png" }), "light"),
    feed.wallpaperUpload(new Blob(["two"], { type: "image/png" }), "dark"),
  ]);

  Assert.notEqual(first, second, "Each upload wrote its own file");
  Assert.deepEqual(
    (await IOUtils.getChildren(libraryDirForTest())).sort(),
    [first, second].sort(),
    "Both uploads are in the library"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(wallpaperDirForTest())).sort(),
    [libraryDirForTest(), appliedCopyForTest(second)].sort(),
    "Only the applied one is copied up where the page can load it"
  );
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(second),
    "The applied wallpaper pref names the second upload"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_remove_requested_after_upload_wins() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Reset requested after an upload should delete that upload");

  const uploadPromise = feed.wallpaperUpload(
    new Blob(["doomed"], { type: "image/png" }),
    "light"
  );
  const removePromise = feed.removeCustomWallpaper();
  const written = await uploadPromise;
  await removePromise;

  Assert.ok(!(await IOUtils.exists(written)), "The uploaded file is deleted");
  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    "No wallpaper is selected afterwards"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_upload_requested_after_remove_wins() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("An upload requested after Reset should be the stored wallpaper");

  await feed.wallpaperUpload(new Blob(["old"], { type: "image/png" }), "light");

  const removePromise = feed.removeCustomWallpaper();
  const uploadPromise = feed.wallpaperUpload(
    new Blob(["new"], { type: "image/png" }),
    "dark"
  );
  await removePromise;
  const written = await uploadPromise;

  Assert.deepEqual(
    await IOUtils.getChildren(libraryDirForTest()),
    [written],
    "Only the newest upload is in the library"
  );
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(written),
    "The uuid pref names the newest upload"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_wallpaperUpload_keeps_earlier_wallpapers() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Adding a wallpaper should keep the one it replaced in the library");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const second = await feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );

  Assert.notEqual(first, second, "A new upload gets its own file");
  Assert.ok(await IOUtils.exists(first), "The earlier wallpaper is kept");
  Assert.ok(await IOUtils.exists(second), "The new wallpaper file is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(second),
    "The applied wallpaper pref names the new file"
  );

  // Age the first upload so the order comes from the timestamp rather than
  // from the filename tiebreak.
  await IOUtils.setModificationTime(first, Date.now() - 60000);

  const saved = await feed.getSavedWallpapers();
  Assert.deepEqual(
    saved.map(wallpaper => wallpaper.filename),
    [PathUtils.filename(second), PathUtils.filename(first)],
    "Both are in the library, newest first"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_wallpaperUpload_filename_carries_the_details() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("An upload should be saved under a name that says what it is");

  const written = await feed.wallpaperUpload(
    new Blob(["fresh"], { type: "image/png" }),
    "dark"
  );

  Assert.deepEqual(
    parseWallpaperFilename(PathUtils.filename(written)),
    {
      kind: "saved",
      type: "custom",
      theme: "dark",
      position: "center",
      number: 1,
      uuid: parseWallpaperFilename(PathUtils.filename(written)).uuid,
    },
    "An upload is a custom wallpaper, cropped from the center"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_sweep_keeps_saved_wallpapers_and_credits() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Routine cleanup should never remove a saved wallpaper");

  const dir = libraryDirForTest();
  await IOUtils.makeDirectory(dir, { createAncestors: true });

  const saved = `v1-builtin-light-topright-1-${LEGACY_UUID}`;
  const credit = `${saved}.txt`;
  const orphanedCredit = `v1-custom-dark-center-1-${LEGACY_UUID_TWO}.txt`;
  await IOUtils.writeUTF8(PathUtils.join(dir, saved), "image");
  await IOUtils.writeUTF8(PathUtils.join(dir, credit), "photographer");
  await IOUtils.writeUTF8(PathUtils.join(dir, orphanedCredit), "no image");

  await feed.wallpaperUpload(
    new Blob(["fresh"], { type: "image/png" }),
    "light"
  );

  const children = (await IOUtils.getChildren(dir)).map(path =>
    PathUtils.filename(path)
  );
  Assert.ok(children.includes(saved), "A saved wallpaper is kept");
  Assert.ok(children.includes(credit), "Its credit is kept with it");
  Assert.ok(
    !children.includes(orphanedCredit),
    "A credit whose image is gone is removed"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_migrateLegacyWallpaper() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A wallpaper from before the library should join it and stay applied");

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  await IOUtils.writeUTF8(PathUtils.join(dir, LEGACY_UUID), "applied");
  await IOUtils.writeUTF8(PathUtils.join(dir, LEGACY_UUID_TWO), "orphan");
  Services.prefs.setStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    LEGACY_UUID
  );
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_THEME, "dark");

  // A page open during migration is told the new name the moment the pref
  // changes, so both copies have to exist by then.
  let copiesAtPrefChange = null;
  const observer = () => {
    const name = Services.prefs.getStringPref(
      PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
      ""
    );
    const exists = path => {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      return file.exists();
    };
    copiesAtPrefChange = {
      top: exists(PathUtils.join(dir, name)),
      library: exists(PathUtils.join(dir, "library", name)),
    };
  };
  Services.prefs.addObserver(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, observer);
  await feed.migrateWallpaperLibrary();
  Services.prefs.removeObserver(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    observer
  );

  Assert.deepEqual(
    copiesAtPrefChange,
    { top: true, library: true },
    "Both copies exist by the time the pref names the new file"
  );

  const migrated = `v1-custom-dark-center-1-${LEGACY_UUID}`;
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    migrated,
    "The applied wallpaper keeps its theme and is renamed into the library"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(libraryDirForTest())).map(path =>
      PathUtils.filename(path)
    ),
    [migrated],
    "The image itself now lives in the library"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(dir))
      .map(path => PathUtils.filename(path))
      .sort(),
    ["library", migrated].sort(),
    "A copy stays up top so the page can still load it, the orphan is gone"
  );

  info("Running it again should do nothing");
  await feed.migrateWallpaperLibrary();
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    migrated,
    "The applied wallpaper is left where it is"
  );
  // The applied image lives in both places on purpose. A second run must not
  // treat the copy up top as a stray and move it back down.
  Assert.deepEqual(
    (await IOUtils.getChildren(dir))
      .map(path => PathUtils.filename(path))
      .sort(),
    ["library", migrated].sort(),
    "The copy up top is still there after a second run"
  );
  Assert.ok(
    await IOUtils.exists(PathUtils.join(dir, "library", migrated)),
    "And the library still has the original"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_THEME);
  await clearWallpaperDirForTest();
});

add_task(async function test_migrate_moves_a_flat_library() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Images saved beside the applied one should move down into the library");

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  const applied = `v1-custom-light-center-1-${LEGACY_UUID}`;
  const other = `v1-builtin-dark-topright-1-${LEGACY_UUID_TWO}`;
  await IOUtils.writeUTF8(PathUtils.join(dir, applied), "applied");
  await IOUtils.writeUTF8(PathUtils.join(dir, other), "other");
  await IOUtils.writeUTF8(PathUtils.join(dir, `${other}.txt`), "photographer");
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, applied);

  await feed.migrateWallpaperLibrary();

  Assert.deepEqual(
    (await IOUtils.getChildren(libraryDirForTest()))
      .map(path => PathUtils.filename(path))
      .sort(),
    [applied, other, `${other}.txt`].sort(),
    "Every saved image and its credit is in the library"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(dir))
      .map(path => PathUtils.filename(path))
      .sort(),
    ["library", applied].sort(),
    "Only the applied image is left where older New Tab versions look"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_migrateLegacyWallpaper_missing_file() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A pref pointing at a file that is gone should be left alone");

  Services.prefs.setStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    LEGACY_UUID
  );

  await feed.migrateWallpaperLibrary();

  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    LEGACY_UUID,
    "There is nothing to rename, so nothing changes"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_wallpaperUpload_unreadable_file_keeps_previous() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("An unreadable upload should leave the previous one referenced");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const firstUuid = PathUtils.filename(first);

  // A Blob that cannot be read, so the upload fails before anything is written.
  class UnreadableBlob extends Blob {
    arrayBuffer() {
      return Promise.reject(new Error("could not read the file"));
    }
  }

  const failed = await feed.wallpaperUpload(
    new UnreadableBlob(["second"], { type: "image/png" }),
    "dark"
  );

  Assert.strictEqual(failed, null, "A failed upload returns null");
  Assert.ok(await IOUtils.exists(first), "The previous wallpaper file is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    firstUuid,
    "The uuid pref still names the previous file"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_wallpaperUpload_failed_write_keeps_previous() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A write that fails should not move the uuid pref off the old file");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const firstUuid = PathUtils.filename(first);

  // Fail the disk write itself. That is the only point that proves the pref
  // moves after the file lands rather than before it: a failure earlier, say an
  // unreadable file, would pass even if the pref were set first.
  sandbox.stub(feed, "writeFile").rejects(new Error("no space left on device"));

  const failed = await feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );

  sandbox.restore();

  Assert.strictEqual(failed, null, "A failed write returns null");
  Assert.ok(await IOUtils.exists(first), "The previous wallpaper file is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    firstUuid,
    "The uuid pref still names the previous file"
  );
  Assert.deepEqual(
    await IOUtils.getChildren(libraryDirForTest()),
    [first],
    "Nothing new is left behind by the failed write"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(wallpaperDirForTest())).sort(),
    [libraryDirForTest(), appliedCopyForTest(first)].sort(),
    "The applied copy is still the previous wallpaper"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_removeCustomWallpaper() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info(
    "removeCustomWallpaper should delete the applied file and clear the pref"
  );

  const applied = await feed.wallpaperUpload(
    new Blob(["applied"], { type: "image/png" }),
    "light"
  );

  await feed.removeCustomWallpaper();

  Assert.ok(!(await IOUtils.exists(applied)), "The applied file is deleted");
  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    "The uuid pref is cleared"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WALLPAPERS_CUSTOM_SET,
        data: null,
      })
    ),
    "Content is told there is no custom wallpaper"
  );

  info("removeCustomWallpaper should be a no-op with no wallpaper set");
  feed.store.dispatch.resetHistory();
  await feed.removeCustomWallpaper();

  Assert.ok(
    feed.store.dispatch.notCalled,
    "Nothing is dispatched when there is no wallpaper to remove"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_broadcastWallpaperLibrary() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Content should be sent every saved wallpaper, newest first");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const second = await feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );
  feed.store.dispatch.resetHistory();

  await feed.broadcastWallpaperLibrary();

  const call = feed.store.dispatch
    .getCalls()
    .find(c => c.args[0].type === actionTypes.WALLPAPERS_CUSTOM_LIBRARY_SET);

  Assert.ok(call, "Expected a WALLPAPERS_CUSTOM_LIBRARY_SET dispatch call");
  Assert.ok(
    call.args[0].data.every(entry => typeof entry.lastModified === "number"),
    "Each entry carries the time it was written, which the order comes from"
  );
  Assert.deepEqual(
    call.args[0].data.map(({ lastModified: _written, ...entry }) => entry),
    [
      {
        filename: PathUtils.filename(second),
        number: 2,
        type: "custom",
        theme: "dark",
        position: "center",
        fallbackName: "",
        publishedDate: "",
        attribution: null,
      },
      {
        filename: PathUtils.filename(first),
        number: 1,
        type: "custom",
        theme: "light",
        position: "center",
        fallbackName: "",
        publishedDate: "",
        attribution: null,
      },
    ],
    "Each saved wallpaper comes with what the page needs to show it"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_picking_a_saved_wallpaper_updates_content() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Picking a saved image only changes prefs, so the feed reacts to those");

  const saved = `v1-custom-dark-center-1-${LEGACY_UUID}`;
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, saved);
  feed.store.dispatch.resetHistory();

  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "newtabWallpapers.customWallpaper.uuid", value: saved },
  });

  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WALLPAPERS_CUSTOM_SET,
        data: `moz-newtab-wallpaper://${saved}`,
      })
    ),
    "Content is told to show the image that was picked"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("newtabWallpapers.customWallpaper.theme", "dark")
    ),
    "The theme comes from the filename"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
});

add_task(async function test_applied_broadcast_carries_the_crop() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The crop must reach the page without waiting for the library");

  const filename = buildSavedWallpaperFilename({
    type: "builtin",
    theme: "dark",
    position: "top right",
    number: 1,
    uuid: "11111111-2222-3333-4444-555555555555",
  });
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, filename);
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");

  feed.broadcastAppliedWallpaper();

  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref(
        "newtabWallpapers.customWallpaper.position",
        "top right"
      )
    ),
    "The crop is sent with the applied wallpaper, not with the library"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_POSITION);
  await clearWallpaperDirForTest();
});

add_task(async function test_cleanWallpaperDirectory() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Cleanup should run without an upload to trigger it");

  const dir = wallpaperDirForTest();
  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { createAncestors: true });
  const saved = `v1-custom-light-center-1-${LEGACY_UUID}`;
  const leftover = `v1-custom-dark-center-2-${LEGACY_UUID_TWO}`;
  const orphanedCredit = `v1-custom-dark-center-1-${LEGACY_UUID_TWO}.txt`;
  await IOUtils.writeUTF8(PathUtils.join(libraryDir, saved), "image");
  await IOUtils.writeUTF8(PathUtils.join(libraryDir, orphanedCredit), "none");
  await IOUtils.writeUTF8(PathUtils.join(dir, saved), "applied copy");
  await IOUtils.writeUTF8(
    PathUtils.join(dir, leftover),
    "previous applied copy"
  );
  await IOUtils.writeUTF8(PathUtils.join(dir, "half-written.tmp"), "partial");
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, saved);

  await feed.cleanWallpaperDirectory();

  Assert.deepEqual(
    (await IOUtils.getChildren(dir))
      .map(path => PathUtils.filename(path))
      .sort(),
    ["library", saved].sort(),
    "Only the applied copy is left beside the library"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(libraryDir)).map(path =>
      PathUtils.filename(path)
    ),
    [saved],
    "The library keeps its image and loses the credit with no image"
  );

  await clearWallpaperDirForTest();
});

add_task(
  async function test_switching_wallpaper_keeps_the_picture_of_the_day() {
    let feed = getWallpaperFeedForTest();
    await clearWallpaperDirForTest();

    info("A Picture of the Day someone set stays after they pick another");

    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");
    const picture = await feed.wallpaperUpload(
      new Blob(["picture"], { type: "image/png" }),
      "dark",
      "potd",
      { name: "A grey heron at dawn", publishedDate: "2026-08-28" }
    );
    const appliedCopy = PathUtils.join(
      wallpaperDirForTest(),
      PathUtils.filename(picture)
    );
    Assert.ok(
      await IOUtils.exists(appliedCopy),
      "The picture is the wallpaper"
    );

    // Exactly what picking a shipped wallpaper does: the selection changes and
    // the applied filename is left behind.
    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "light-beach");
    await feed.onAction({
      type: actionTypes.PREF_CHANGED,
      data: { name: "newtabWallpapers.wallpaper", value: "light-beach" },
    });

    Assert.ok(
      await IOUtils.exists(picture),
      "The picture is still in the library"
    );
    const saved = await feed.getSavedWallpapers();
    Assert.deepEqual(
      saved.map(wallpaper => wallpaper.filename),
      [PathUtils.filename(picture)],
      "So it is still one of the images the picker offers"
    );
    // The copy beside the library stays while the applied name points at it,
    // the same as an upload, so switching back does not have to copy again.
    Assert.ok(
      await IOUtils.exists(appliedCopy),
      "Its copy is kept the way an upload's is"
    );

    // Setting tomorrow's picture moves the applied name, so yesterday's copy
    // is swept while the picture itself stays saved.
    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");
    await feed.wallpaperUpload(
      new Blob(["tomorrow"], { type: "image/png" }),
      "light",
      "potd",
      { name: "A fox in the snow", publishedDate: "2026-08-29" }
    );
    Assert.ok(
      !(await IOUtils.exists(appliedCopy)),
      "Yesterday's copy beside the library goes"
    );
    Assert.ok(
      await IOUtils.exists(picture),
      "Yesterday's picture is still saved"
    );

    Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
    await clearWallpaperDirForTest();
  }
);

add_task(async function test_startup_sweeps_the_directory() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Startup should clear leftovers without waiting for another upload");

  feed.wallpaperClient = {
    async get() {
      return [];
    },
  };

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  const saved = `v1-custom-light-center-1-${LEGACY_UUID}`;
  const orphanedCredit = `v1-custom-dark-center-1-${LEGACY_UUID_TWO}.txt`;
  await IOUtils.writeUTF8(PathUtils.join(dir, saved), "image");
  await IOUtils.writeUTF8(PathUtils.join(dir, orphanedCredit), "no image");
  await IOUtils.writeUTF8(PathUtils.join(dir, "interrupted.tmp"), "partial");

  await feed.updateWallpapers(true /* isStartup */);

  Assert.deepEqual(
    (await IOUtils.getChildren(dir)).map(path => PathUtils.filename(path)),
    ["library"],
    "The leftovers are gone and the saved wallpaper moved into the library"
  );
  Assert.deepEqual(
    (await IOUtils.getChildren(libraryDirForTest())).map(path =>
      PathUtils.filename(path)
    ),
    [saved],
    "The image is kept, the credit with no image is not"
  );

  info("An ordinary update should not sweep");
  await IOUtils.writeUTF8(PathUtils.join(dir, "interrupted.tmp"), "partial");
  await feed.updateWallpapers(false /* isStartup */);

  Assert.ok(
    await IOUtils.exists(PathUtils.join(dir, "interrupted.tmp")),
    "Only startup pays for the extra directory read"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_upload_replaces_when_the_library_is_off() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("With no library there is nowhere to manage old images, so they go");

  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    false
  );

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const second = await feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );

  Assert.ok(!(await IOUtils.exists(first)), "The replaced image is gone");
  Assert.ok(await IOUtils.exists(second), "The new one is kept");

  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    true
  );
  await clearWallpaperDirForTest();
});

add_task(async function test_upload_keeps_both_when_the_library_is_on() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The library is the whole point: an upload must not replace anything");

  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    true
  );

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const second = await feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );

  Assert.ok(await IOUtils.exists(first), "The earlier image is still there");
  Assert.ok(await IOUtils.exists(second), "So is the new one");

  const saved = await feed.getSavedWallpapers();
  Assert.equal(saved.length, 2, "Both are in the library");

  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    true
  );
  await clearWallpaperDirForTest();
});

// A real 4x4 PNG. The other tests upload text, which never decodes, so nothing
// else here exercises thumbnail generation at all.
const PNG_BYTES = () =>
  Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mP8z8Dwn4GB" +
        "gYGJgYGBAQAkBgHtG2AVaAAAAABJRU5ErkJggg=="
    ),
    c => c.charCodeAt(0)
  );

add_task(async function test_upload_clears_a_stale_crop() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A new wallpaper should not inherit the last one's crop");

  // What applying a rescued wallpaper leaves behind.
  Services.prefs.setStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_POSITION,
    "top right"
  );

  for (const type of ["custom", "potd"]) {
    feed.store.dispatch.resetHistory();
    await feed.wallpaperUpload(
      new Blob([`fresh ${type}`], { type: "image/png" }),
      "light",
      type
    );

    const positionCall = feed.store.dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(
        action =>
          action.data?.name === "newtabWallpapers.customWallpaper.position"
      );

    Assert.ok(positionCall, `A ${type} wallpaper sets the crop pref`);
    Assert.equal(
      positionCall.data.value,
      "center",
      `A ${type} wallpaper is centered, not left on the previous crop`
    );
  }

  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_POSITION);
  await clearWallpaperDirForTest();
});

add_task(async function test_upload_stores_the_thumbnail_it_is_given() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info(
    "Scaling happens in content, so the parent stores those bytes as they are"
  );

  const thumbnailBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02]);
  const written = await feed.wallpaperUpload(
    new Blob([PNG_BYTES()], { type: "image/png" }),
    "light",
    undefined,
    { thumbnail: new Blob([thumbnailBytes]) }
  );

  const thumbnailPath = `${written}.thumb`;
  Assert.ok(await IOUtils.exists(thumbnailPath), "The thumbnail is written");
  Assert.deepEqual(
    Array.from(await IOUtils.read(thumbnailPath)),
    Array.from(thumbnailBytes),
    "Byte for byte what content sent, unaltered"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_upload_without_a_thumbnail_still_saves() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info(
    "A save the parent starts has no page to scale for it, and must not fail"
  );

  const written = await feed.wallpaperUpload(
    new Blob([PNG_BYTES()], { type: "image/png" }),
    "light"
  );

  Assert.ok(written, "The image is saved");
  Assert.ok(await IOUtils.exists(written), "And it is on disk");
  Assert.ok(
    !(await IOUtils.exists(`${written}.thumb`)),
    "With no thumbnail beside it yet"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_pictureOfTheDay_is_kept_in_the_library() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A Picture of the Day someone sets is saved rather than dropped");

  const upload = await feed.wallpaperUpload(
    new Blob(["upload"], { type: "image/png" }),
    "light"
  );
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");

  const firstPicture = await feed.wallpaperUpload(
    new Blob(["picture"], { type: "image/png" }),
    "dark",
    "potd",
    { name: "A grey heron at dawn", publishedDate: "2026-08-28" }
  );

  Assert.equal(
    parseWallpaperFilename(PathUtils.filename(firstPicture)).type,
    "potd",
    "A kept Picture of the Day is a saved image of its own type"
  );

  const secondPicture = await feed.wallpaperUpload(
    new Blob(["tomorrow"], { type: "image/png" }),
    "light",
    "potd",
    { name: "A fox in the snow", publishedDate: "2026-08-29" }
  );

  Assert.ok(
    await IOUtils.exists(firstPicture),
    "Yesterday's picture is still there"
  );
  Assert.ok(await IOUtils.exists(secondPicture), "So is today's");
  Assert.ok(
    await IOUtils.exists(upload),
    "The uploaded wallpaper is untouched"
  );

  const saved = await feed.getSavedWallpapers();
  Assert.deepEqual(
    saved.map(wallpaper => wallpaper.filename).sort(),
    [firstPicture, secondPicture, upload]
      .map(p => PathUtils.filename(p))
      .sort(),
    "Both pictures and the upload are in the library"
  );

  Assert.equal(
    saved.find(w => PathUtils.filename(firstPicture) === w.filename)
      ?.fallbackName,
    "A grey heron at dawn",
    "The picture's title is what names it in the picker"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
});

add_task(async function test_an_upload_keeps_nothing_of_the_persons_file() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The image is named by its number, so their file name is not kept");

  const saved = await feed.wallpaperUpload(
    new File(["holiday"], "Beach holiday.png", { type: "image/png" }),
    "light"
  );

  const [entry] = await feed.getSavedWallpapers();

  Assert.equal(
    entry.filename,
    PathUtils.filename(saved),
    "The stored name is the generated one"
  );
  Assert.equal(entry.number, 1, "The first saved image is number one");
  Assert.ok(
    !PathUtils.filename(saved).includes("Beach"),
    "Nothing of their file name is in the stored name"
  );
  Assert.ok(
    !JSON.stringify(entry).includes("Beach"),
    "And nothing of it comes back with the image either"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_an_unscaled_image_is_sent_for_content_to_scale() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info(
    "The parent cannot scale, so an image with no thumbnail goes over whole"
  );

  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { ignoreExisting: true });
  const filename = `v1-custom-light-center-1-${LEGACY_UUID}`;
  await IOUtils.write(PathUtils.join(libraryDir, filename), PNG_BYTES());

  await feed.sendLibraryThumbnails("port-1");

  const sent = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .find(
      action => action.type === actionTypes.WALLPAPERS_CUSTOM_THUMBNAILS_SET
    )
    ?.data?.find(entry => entry.filename === filename);

  Assert.ok(sent, "The image is in the reply");
  Assert.ok(sent.needsThumbnail, "Marked so the picker knows to scale it");

  await clearWallpaperDirForTest();
});

add_task(async function test_storeThumbnail_keeps_what_content_scaled() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("What comes back from the picker is written beside its image");

  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { ignoreExisting: true });
  const filename = `v1-custom-light-center-1-${LEGACY_UUID}`;
  await IOUtils.write(PathUtils.join(libraryDir, filename), PNG_BYTES());

  const scaled = new Uint8Array([0xff, 0xd8, 0xff, 0x09]);
  await feed.storeThumbnail(filename, new Blob([scaled]));

  Assert.deepEqual(
    Array.from(
      await IOUtils.read(PathUtils.join(libraryDir, `${filename}.thumb`))
    ),
    Array.from(scaled),
    "Stored byte for byte"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_storeThumbnail_refuses_a_name_it_cannot_read() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The filename comes from content, so it has to be one of ours");

  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { ignoreExisting: true });

  await feed.storeThumbnail(
    "../../../etc/passwd",
    new Blob([new Uint8Array([1, 2, 3])])
  );

  const children = await IOUtils.getChildren(libraryDir, {
    ignoreAbsent: true,
  });
  Assert.equal(children.length, 0, "Nothing was written");

  await clearWallpaperDirForTest();
});

add_task(async function test_a_number_is_given_with_the_library_off() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The pref ships off and gets turned on later, so number it anyway");

  feed.store.getState = () => ({ Prefs: { values: {} } });

  await feed.wallpaperUpload(
    new Blob(["nameless"], { type: "image/png" }),
    "dark"
  );

  const [entry] = await feed.getSavedWallpapers();

  Assert.ok(!feed.libraryEnabled, "The library is off for this upload");
  Assert.equal(entry.number, 1, "It still has a number for later");

  await clearWallpaperDirForTest();
});

add_task(async function test_a_number_is_never_given_out_twice() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Removing an image must not hand its number to the next one");

  await feed.wallpaperUpload(new Blob(["one"], { type: "image/png" }), "light");
  await feed.wallpaperUpload(new Blob(["two"], { type: "image/png" }), "light");

  // The second upload is the applied one, so this removes number two.
  await feed.removeCustomWallpaper();

  await feed.wallpaperUpload(
    new Blob(["three"], { type: "image/png" }),
    "light"
  );

  const numbers = (await feed.getSavedWallpapers())
    .map(w => w.number)
    .sort((a, b) => a - b);

  Assert.deepEqual(
    numbers,
    [1, 3],
    "Number two is gone and not handed out again"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_migration_leaves_the_applied_copy_alone() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The copy up top must not be moved down over the library original");

  const dir = wallpaperDirForTest();
  const libraryDir = PathUtils.join(dir, "library");
  await IOUtils.makeDirectory(libraryDir, { createAncestors: true });

  const filename = `v1-custom-light-center-1-${LEGACY_UUID}`;
  // Different bytes in each so the test can tell which file survived.
  await IOUtils.writeUTF8(PathUtils.join(libraryDir, filename), "the original");
  await IOUtils.writeUTF8(PathUtils.join(dir, filename), "the copy up top");
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, filename);

  await feed.migrateWallpaperLibrary();

  Assert.equal(
    await IOUtils.readUTF8(PathUtils.join(libraryDir, filename)),
    "the original",
    "The library still holds its own file, not the copy from up top"
  );
  Assert.ok(
    await IOUtils.exists(PathUtils.join(dir, filename)),
    "And the copy up top is still where the page can load it"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_startup_sends_the_applied_wallpaper() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A restart has to put the wallpaper back without anyone uploading");

  feed.wallpaperClient = {
    async get() {
      return [];
    },
  };

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  const filename = `v1-custom-dark-topright-4-${LEGACY_UUID}`;
  await IOUtils.write(PathUtils.join(dir, filename), PNG_BYTES());
  Services.prefs.setStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, filename);
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");

  feed.store.dispatch.resetHistory();
  await feed.updateWallpapers(true /* isStartup */);

  const sent = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .find(
      action => action.type === actionTypes.WALLPAPERS_CUSTOM_SET && action.data
    );

  Assert.equal(
    sent?.data,
    `moz-newtab-wallpaper://${filename}`,
    "Startup tells the page which file to load"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);
  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
});

add_task(async function test_startup_sends_a_legacy_name_then_the_new_one() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A wallpaper from before the library stays visible while it is moved");

  feed.wallpaperClient = {
    async get() {
      return [];
    },
  };

  const wallpaperDir = wallpaperDirForTest();
  await IOUtils.makeDirectory(wallpaperDir, { ignoreExisting: true });
  await IOUtils.write(PathUtils.join(wallpaperDir, LEGACY_UUID), PNG_BYTES());
  Services.prefs.setStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    LEGACY_UUID
  );
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "custom");

  // Driven through startup, so losing the calls in updateWallpapers fails this.
  feed.store.dispatch.resetHistory();
  await feed.updateWallpapers(true /* isStartup */);

  const sent = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .filter(action => action.type === actionTypes.WALLPAPERS_CUSTOM_SET)
    .map(action => action.data);

  Assert.equal(
    sent[0],
    `moz-newtab-wallpaper://${LEGACY_UUID}`,
    "The old name is sent before anything moves"
  );
  Assert.ok(
    sent.at(-1)?.includes("v1-custom-"),
    "And the new name once it has"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);
  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
});

add_task(async function test_startup_sends_nothing_when_no_custom_is_chosen() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A shipped wallpaper must not be replaced by a stale custom one");

  Services.prefs.setStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    `v1-custom-light-center-1-${LEGACY_UUID}`
  );
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "celestial");

  feed.wallpaperClient = {
    async get() {
      return [];
    },
  };
  feed.store.dispatch.resetHistory();
  await feed.updateWallpapers(true /* isStartup */);

  const sent = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .find(action => action.type === actionTypes.WALLPAPERS_CUSTOM_SET);

  Assert.equal(
    sent?.data,
    null,
    "Content is told there is no custom wallpaper"
  );

  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);
  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
});

add_task(async function test_trainhop_config_can_enable_the_library() {
  let feed = getWallpaperFeedForTest();

  info("A trainhop rollout should turn the library on without the pref");

  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    false
  );

  feed.store.getState = () => ({
    Prefs: {
      values: {
        "newtabWallpapers.customWallpaper.library.enabled": false,
      },
    },
  });
  Assert.strictEqual(feed.libraryEnabled, false, "Off when nothing enables it");

  feed.store.getState = () => ({
    Prefs: {
      values: {
        "newtabWallpapers.customWallpaper.library.enabled": false,
        trainhopConfig: { customWallpaperLibrary: { enabled: true } },
      },
    },
  });
  Assert.ok(feed.libraryEnabled, "A trainhop rollout turns it on");

  Services.prefs.setBoolPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_LIBRARY_ENABLED,
    true
  );
});

add_task(async function test_storing_a_thumbnail_waits_for_the_file_lock() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A thumbnail coming back from the picker waits its turn to be written");

  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { ignoreExisting: true });
  const filename = `v1-custom-light-center-1-${LEGACY_UUID}`;
  const imagePath = PathUtils.join(libraryDir, filename);
  await IOUtils.write(imagePath, PNG_BYTES());
  const markerPath = `${imagePath}.marker`;

  // Order of writes, rather than a moment in time. The holder below sits on
  // the lock for many turns, so an unlocked writer gets in ahead of it.
  const order = [];
  const realWriteFile = feed.writeFile.bind(feed);
  sandbox.stub(feed, "writeFile").callsFake(async (path, ...rest) => {
    order.push(path.endsWith(".thumb") ? "thumbnail" : "marker");
    return realWriteFile(path, ...rest);
  });

  let release;
  const held = new Promise(resolve => {
    release = resolve;
  });

  const holder = locks.request(WALLPAPER_FILE_LOCK_FOR_TEST, async () => {
    for (let i = 0; i < 200; i++) {
      await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
    }
    await feed.writeFile(markerPath, new Uint8Array([1]), {
      tmpPath: `${markerPath}.tmp`,
    });
    await held;
  });

  const storing = feed.storeThumbnail(
    filename,
    new Blob([new Uint8Array([0xff, 0xd8, 0xff])])
  );
  release();
  await Promise.all([holder, storing]);

  Assert.deepEqual(
    order,
    ["marker", "thumbnail"],
    "The picker's write lands after the writer that already held the lock"
  );
  Assert.ok(
    await IOUtils.exists(`${imagePath}.thumb`),
    "The thumbnail is written once the lock is free"
  );

  sandbox.restore();
  await clearWallpaperDirForTest();
});

add_task(async function test_thumbnail_reply_carries_the_library() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A page from the startup cache gets replies but never broadcasts");

  await feed.wallpaperUpload(
    new File(["one"], "one.png", { type: "image/png" }),
    "light"
  );
  await feed.wallpaperUpload(
    new File(["two"], "two.png", { type: "image/png" }),
    "dark"
  );
  feed.store.dispatch.resetHistory();

  await feed.sendLibraryThumbnails("port-7");

  const library = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .find(a => a.type === actionTypes.WALLPAPERS_CUSTOM_LIBRARY_SET);

  Assert.ok(library, "The library goes out with the thumbnails");
  Assert.equal(library.data.length, 2, "Both saved images are in it");
  Assert.equal(
    library.meta.toTarget,
    "port-7",
    "Sent to the page that asked, not broadcast"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_thumbnails_stay_out_of_the_parent_state() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The parent should not keep thumbnail bytes it never renders");

  const saved = await feed.wallpaperUpload(
    new Blob(["image"], { type: "image/png" }),
    "light"
  );
  // A fake blob cannot be decoded, so no thumbnail is made for it. Write one
  // by hand: this test is about where the bytes end up, not how they are made.
  await IOUtils.writeUTF8(
    PathUtils.join(
      libraryDirForTest(),
      getThumbnailFilename(PathUtils.filename(saved))
    ),
    "thumbnail bytes"
  );
  feed.store.dispatch.resetHistory();

  await feed.sendLibraryThumbnails("port-1");

  const sent = feed.store.dispatch
    .getCalls()
    .map(call => call.args[0])
    .filter(
      action => action.type === actionTypes.WALLPAPERS_CUSTOM_THUMBNAILS_SET
    );

  Assert.equal(
    sent.length,
    2,
    "Content is sent the bytes, the parent is reset"
  );
  Assert.equal(sent[0].meta.toTarget, "port-1", "The asking tab gets them");
  Assert.equal(sent[0].data.length, 1, "The tab is sent one thumbnail");
  Assert.deepEqual(
    sent[1].data,
    [],
    "The parent clears its own copy, so the startup cache carries no bytes"
  );
  Assert.strictEqual(
    sent[1].meta,
    undefined,
    "That reset stays in the parent rather than reaching content"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_thumbnails_are_one_locked_snapshot() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A thumbnail reply must not broadcast a library older than an upload");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );

  // Hold the lock so both queue behind it, upload first. Reading the list
  // before asking for the lock, the reply would have captured the single
  // image it saw here and broadcast that after the upload had already landed.
  let release;
  const held = new Promise(resolve => {
    release = resolve;
  });
  const holder = locks.request(WALLPAPER_FILE_LOCK_FOR_TEST, () => held);

  const upload = feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );
  const reply = feed.sendLibraryThumbnails();

  release();
  await holder;
  const uploaded = await upload;
  await reply;

  const call = feed.store.dispatch
    .getCalls()
    .reverse()
    .find(c => c.args[0].type === actionTypes.WALLPAPERS_CUSTOM_LIBRARY_SET);
  Assert.equal(
    call.args[0].data.length,
    2,
    "The reply carries both images, not the list from before the upload"
  );
  Assert.ok(uploaded && first, "Both uploads wrote a file");

  await clearWallpaperDirForTest();
});

add_task(async function test_a_full_image_never_goes_to_every_tab() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("An unscaled image goes to the page that asked, never to all of them");

  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { ignoreExisting: true });
  const filename = `v1-custom-light-center-1-${LEGACY_UUID}`;
  await IOUtils.write(PathUtils.join(libraryDir, filename), PNG_BYTES());

  const entriesFrom = () =>
    feed.store.dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(
        action => action.type === actionTypes.WALLPAPERS_CUSTOM_THUMBNAILS_SET
      )?.data ?? [];

  feed.store.dispatch.resetHistory();
  await feed.sendLibraryThumbnails();
  Assert.equal(
    entriesFrom().length,
    0,
    "With nobody to reply to, the image stays where it is"
  );

  feed.store.dispatch.resetHistory();
  await feed.sendLibraryThumbnails("port-1");
  const [entry] = entriesFrom();
  Assert.ok(entry?.needsThumbnail, "The page that asked gets it, marked");

  await clearWallpaperDirForTest();
});

add_task(async function test_apply_tells_content_once() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Applying a saved image should reach content as a single update");

  const saved = await feed.wallpaperUpload(
    new Blob(["image"], { type: "image/png" }),
    "light"
  );
  const filename = PathUtils.filename(saved);

  // Stand in for the real store: PrefsFeed writes a SET_PREF straight through,
  // and the middleware then hands every action back to each feed. Both matter
  // here, because applying moves prefs this feed reacts to.
  const spy = feed.store.dispatch;
  feed.store.dispatch = action => {
    const result = spy(action);
    if (action.type === actionTypes.SET_PREF) {
      const { name, value } = action.data;
      const full = `browser.newtabpage.activity-stream.${name}`;
      if (typeof value === "boolean") {
        Services.prefs.setBoolPref(full, value);
      } else {
        Services.prefs.setStringPref(full, value);
      }
      // Not awaited, the same as the store's middleware.
      feed.onAction({
        type: actionTypes.PREF_CHANGED,
        data: { name, value },
      });
    }
    return result;
  };

  // The applied name is written straight to the pref rather than dispatched,
  // so in the browser it is a real observer that feeds PREF_CHANGED back.
  const observer = {
    observe: () =>
      feed.onAction({
        type: actionTypes.PREF_CHANGED,
        data: { name: "newtabWallpapers.customWallpaper.uuid" },
      }),
  };
  Services.prefs.addObserver(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, observer);

  // Picking while a shipped wallpaper is selected moves the most prefs, so it
  // is the case that used to reach the page twice over.
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "light-beach");
  spy.resetHistory();

  await feed.applySavedWallpaper(filename);

  const sent = spy
    .getCalls()
    .filter(call => call.args[0].type === actionTypes.WALLPAPERS_CUSTOM_SET);
  Assert.equal(
    sent.filter(call => call.args[0].data === null).length,
    0,
    "Content is never told there is no wallpaper"
  );
  Assert.equal(sent.length, 1, "And is told exactly once");
  Assert.ok(
    sent[0].args[0].data.endsWith(filename),
    "And it is told about the image that was picked"
  );

  Services.prefs.removeObserver(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    observer
  );
  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  Services.prefs.clearUserPref(
    "browser.newtabpage.activity-stream.newtabWallpapers.user.enabled"
  );
  await clearWallpaperDirForTest();
});

add_task(async function test_removeCustomWallpaper_one_of_several() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Removing a saved image should leave the rest of the library alone");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const applied = await feed.wallpaperUpload(
    new Blob(["applied"], { type: "image/png" }),
    "dark"
  );
  feed.store.dispatch.resetHistory();

  await feed.removeCustomWallpaper(PathUtils.filename(first));

  Assert.ok(!(await IOUtils.exists(first)), "The chosen image is deleted");
  Assert.ok(await IOUtils.exists(applied), "The applied image is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(applied),
    "The applied wallpaper is untouched"
  );
  Assert.ok(
    !feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WALLPAPERS_CUSTOM_SET,
        data: null,
      })
    ),
    "The wallpaper on the page is left where it is"
  );

  const library = feed.store.dispatch
    .getCalls()
    .find(c => c.args[0].type === actionTypes.WALLPAPERS_CUSTOM_LIBRARY_SET);
  Assert.deepEqual(
    library.args[0].data.map(wallpaper => wallpaper.filename),
    [PathUtils.filename(applied)],
    "Content is sent the library without the removed image"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_removeCustomWallpaper_clears_the_selection() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Removing the applied image should go back to the default background");

  const applied = await feed.wallpaperUpload(
    new Blob(["applied"], { type: "image/png" }),
    "light"
  );
  const credit = `${applied}.txt`;
  await IOUtils.writeUTF8(credit, "photographer");
  feed.store.dispatch.resetHistory();

  await feed.removeCustomWallpaper(PathUtils.filename(applied));

  Assert.ok(!(await IOUtils.exists(applied)), "The image is deleted");
  Assert.ok(!(await IOUtils.exists(credit)), "Its credit goes with it");
  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    "The applied wallpaper pref is cleared"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("newtabWallpapers.wallpaper", "")
    ),
    "The selection is cleared"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("newtabWallpapers.initialWallpaper", "")
    ),
    "An experiment's wallpaper cannot come back in its place"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.BroadcastToContent({
        type: actionTypes.WALLPAPERS_CUSTOM_SET,
        data: null,
      })
    ),
    "Content is told there is no custom wallpaper"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_removeCustomWallpaper_unknown_name() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A name the library does not recognize should not be removed");

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  const other = PathUtils.join(dir, "holiday-photo.jpg");
  await IOUtils.writeUTF8(other, "someone else's file");

  await feed.removeCustomWallpaper("holiday-photo.jpg");

  Assert.ok(await IOUtils.exists(other), "The file is left alone");

  await clearWallpaperDirForTest();
});

add_task(async function test_delete_only_takes_saved_wallpapers() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A filename from content can only ever name a saved image");

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  const stray = `potd-dark-${LEGACY_UUID}`;
  const credit = `v1-custom-light-center-${LEGACY_UUID_TWO}.txt`;
  await IOUtils.writeUTF8(PathUtils.join(dir, stray), "picture");
  await IOUtils.writeUTF8(PathUtils.join(dir, credit), "photographer");
  await IOUtils.writeUTF8(PathUtils.join(dir, LEGACY_UUID), "pre-library");

  for (const filename of [stray, credit, LEGACY_UUID, "holiday.jpg"]) {
    await feed.removeCustomWallpaper(filename);
  }

  Assert.deepEqual(
    (await IOUtils.getChildren(dir))
      .map(path => PathUtils.filename(path))
      .sort(),
    [LEGACY_UUID, stray, credit].sort(),
    "None of them are the library's to delete"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_delete_survives_a_failed_applied_copy() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A leftover rendering copy must not undo the deletion");

  const applied = await feed.wallpaperUpload(
    new Blob(["applied"], { type: "image/png" }),
    "light"
  );
  const filename = PathUtils.filename(applied);

  // The library image goes, then removing the flat copy fails. Before, that
  // left the pref pointing at it and migration moved the copy back in.
  const realRemoveFile = feed.removeFile.bind(feed);
  feed.removeFile = async (path, ...rest) => {
    if (path === PathUtils.join(wallpaperDirForTest(), filename)) {
      throw new Error("cannot remove the applied copy");
    }
    return realRemoveFile(path, ...rest);
  };

  await feed.removeCustomWallpaper(filename);

  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, ""),
    "",
    "The selection is cleared even though the copy is still there"
  );
  Assert.deepEqual(
    await feed.getSavedWallpapers(),
    [],
    "And the image is out of the library"
  );
  Assert.ok(
    feed.store.dispatch
      .getCalls()
      .some(c => c.args[0].type === actionTypes.WALLPAPERS_CUSTOM_LIBRARY_SET),
    "Content is told the library changed"
  );

  feed.removeFile = realRemoveFile;
  await clearWallpaperDirForTest();
});

add_task(async function test_delete_stops_when_the_image_cannot_go() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("If the image itself survives, nothing else may act as though it went");

  const applied = await feed.wallpaperUpload(
    new Blob(["applied"], { type: "image/png" }),
    "light"
  );
  const filename = PathUtils.filename(applied);

  const realRemoveFile = feed.removeFile.bind(feed);
  feed.removeFile = async (path, ...rest) => {
    if (path === PathUtils.join(libraryDirForTest(), filename)) {
      throw new Error("cannot remove the library image");
    }
    return realRemoveFile(path, ...rest);
  };

  await feed.removeCustomWallpaper(filename);

  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, ""),
    filename,
    "The selection is left alone"
  );
  Assert.deepEqual(
    (await feed.getSavedWallpapers()).map(w => w.filename),
    [filename],
    "And it is still in the library, rather than half removed"
  );

  feed.removeFile = realRemoveFile;
  await clearWallpaperDirForTest();
});

add_task(async function test_delete_keeps_a_selection_made_meanwhile() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Deleting the applied image must not clear a newer selection");

  const doomed = await feed.wallpaperUpload(
    new Blob(["doomed"], { type: "image/png" }),
    "light"
  );
  const keeper = await feed.wallpaperUpload(
    new Blob(["keeper"], { type: "image/png" }),
    "dark"
  );

  // "doomed" is applied when the delete is asked for.
  Services.prefs.setStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
    PathUtils.filename(doomed)
  );

  // Pick "keeper" while the removal is in flight, which is the only window in
  // which the guard can get this wrong.
  const realRemoveFile = feed.removeFile.bind(feed);
  let selected = false;
  feed.removeFile = async (...args) => {
    if (!selected) {
      selected = true;
      Services.prefs.setStringPref(
        PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID,
        PathUtils.filename(keeper)
      );
    }
    return realRemoveFile(...args);
  };

  await feed.removeCustomWallpaper(PathUtils.filename(doomed));

  Assert.ok(selected, "The selection landed while the removal was running");

  Assert.ok(!(await IOUtils.exists(doomed)), "The chosen image is deleted");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, ""),
    PathUtils.filename(keeper),
    "The newer selection survives the delete"
  );

  await clearWallpaperDirForTest();
});

const retiredRecordForTest = () => ({
  title: "dark-mountain",
  fluent_id: "newtab-wallpaper-dark-mountain",
  theme: "dark",
  background_position: "top right",
  attachment: { location: "dark-mountain.avif" },
  attribution: {
    name: { string: "A Photographer", url: "https://example.com/author" },
    webpage: { string: "Example", url: "https://example.com" },
  },
});

add_task(async function test_rescue_stores_the_localized_name() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The string can leave Firefox before the image does, so store the name");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: true,
    status: 200,
    headers: { get: () => "image/avif" },
    arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
  });
  const formatString = sandbox
    .stub(feed, "formatString")
    .resolves("Landscape mountain");

  await feed.rescueRetiredWallpaper([record]);

  const [entry] = await feed.getSavedWallpapers();

  Assert.ok(
    formatString.calledWith(record.fluent_id),
    "The name comes from the wallpaper's own string"
  );
  Assert.equal(entry.fallbackName, "Landscape mountain", "And is stored");
  Assert.ok(entry.attribution, "The credit still comes through");

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  sandbox.restore();
  await clearWallpaperDirForTest();
});

add_task(async function test_rescueRetiredWallpaper() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Retiring the wallpaper someone is using should keep it for them");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: true,
    status: 200,
    headers: { get: () => "image/avif" },
    arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
  });

  await feed.rescueRetiredWallpaper([record]);

  const filename = Services.prefs.getStringPref(
    PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID
  );
  Assert.deepEqual(
    {
      ...parseWallpaperFilename(filename),
      uuid: undefined,
    },
    {
      kind: "saved",
      type: "builtin",
      theme: "dark",
      position: "top right",
      number: 1,
      uuid: undefined,
    },
    "The rescued wallpaper keeps its theme and where it is cropped"
  );
  Assert.ok(
    feed.store.dispatch.calledWith(
      actionCreators.SetPref("newtabWallpapers.wallpaper", "custom")
    ),
    "It stays applied, now as one of their own images"
  );

  const [saved] = await feed.getSavedWallpapers();
  Assert.equal(saved.filename, filename, "It is in the library");
  Assert.deepEqual(
    saved.attribution,
    record.attribution,
    "The photographer credit is kept with it"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(async function test_rescued_wallpaper_keeps_its_own_name() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info(
    "A rescued wallpaper has no file name, so it keeps the one Firefox uses"
  );

  const record = retiredRecordForTest();
  sandbox.stub(feed, "formatString").rejects(new Error("no strings"));
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: true,
    status: 200,
    headers: { get: () => "image/avif" },
    arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
  });

  await feed.rescueRetiredWallpaper([record]);

  const [entry] = await feed.getSavedWallpapers();

  Assert.equal(
    entry.fallbackName,
    record.title,
    "With no string to read, the record's title names it"
  );
  Assert.equal(
    entry.number,
    1,
    "It is numbered like any other image in the folder"
  );
  Assert.deepEqual(
    entry.attribution,
    record.attribution,
    "Keeping the name does not disturb the photographer credit"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  sandbox.restore();
  await clearWallpaperDirForTest();
});

add_task(async function test_rescue_covers_a_wallpaper_an_experiment_set() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("With no choice made, the page shows initialWallpaper, so that counts");

  const record = retiredRecordForTest();
  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  Services.prefs.setStringPref(PREF_INITIAL_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: true,
    status: 200,
    headers: { get: () => "image/avif" },
    arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
  });

  await feed.rescueRetiredWallpaper([record]);

  Assert.equal(
    (await feed.getSavedWallpapers()).length,
    1,
    "The wallpaper is rescued"
  );
  Assert.ok(
    Services.prefs
      .getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, "")
      .startsWith("v1-builtin-"),
    "And applied"
  );
  const clearedInitial = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .find(
      a =>
        a.type === actionTypes.SET_PREF &&
        a.data.name === "newtabWallpapers.initialWallpaper"
    );
  Assert.equal(
    clearedInitial?.data.value,
    "",
    "The experiment's choice is cleared, as picking a wallpaper does"
  );

  Services.prefs.clearUserPref(PREF_INITIAL_WALLPAPER);
  sandbox.restore();
  await clearWallpaperDirForTest();
});

add_task(async function test_rescueRetiredWallpaper_leaves_others_alone() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Retiring a wallpaper nobody is using should not save anything");

  sandbox.stub(feed, "fetch").resolves({});
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "light-beach");

  await feed.rescueRetiredWallpaper([retiredRecordForTest()]);

  Assert.ok(feed.fetch.notCalled, "Nothing is downloaded");
  Assert.deepEqual(
    await feed.getSavedWallpapers(),
    [],
    "Nothing is added to the library"
  );

  info("Neither should a retired solid color, which has no file to keep");
  const solidColor = retiredRecordForTest();
  delete solidColor.attachment;
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, solidColor.title);

  await feed.rescueRetiredWallpaper([solidColor]);

  Assert.ok(feed.fetch.notCalled, "Still nothing is downloaded");

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(async function test_rescueRetiredWallpaper_bad_response() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A response that is not an image should leave the selection alone");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: false,
    status: 404,
    headers: { get: () => "text/html" },
    arrayBuffer: async () => new ArrayBuffer(0),
  });

  await feed.rescueRetiredWallpaper([record]);

  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    "No wallpaper is applied"
  );
  Assert.deepEqual(
    await feed.getSavedWallpapers(),
    [],
    "Nothing is added to the library"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(async function test_onSync_drives_the_rescue() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A sync that retires the applied wallpaper should keep it");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: true,
    status: 200,
    headers: { get: () => "image/avif" },
    arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
  });
  sandbox.stub(feed, "wallpaperSetup").resolves();

  await feed.onSync({ data: { deleted: [record], current: [] } });

  const [saved] = await feed.getSavedWallpapers();
  Assert.equal(saved?.type, "builtin", "The retired wallpaper is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    saved.filename,
    "It stays applied"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(async function test_rescue_sends_the_library_before_applying() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Content needs the crop and the credit before the wallpaper is applied");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").resolves({
    ok: true,
    status: 200,
    headers: { get: () => "image/avif" },
    arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
  });

  await feed.rescueRetiredWallpaper([record]);

  const calls = feed.store.dispatch.getCalls();
  const libraryAt = calls.findIndex(
    c => c.args[0].type === actionTypes.WALLPAPERS_CUSTOM_LIBRARY_SET
  );
  const appliedAt = calls.findIndex(
    c => c.args[0]?.data?.name === "newtabWallpapers.wallpaper"
  );

  Assert.greater(libraryAt, -1, "The library is sent");
  Assert.greater(appliedAt, -1, "The wallpaper is applied");
  Assert.less(
    libraryAt,
    appliedAt,
    "The library arrives before the wallpaper is applied"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(async function test_rescue_leaves_a_newer_choice_alone() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Choosing another wallpaper mid-download should win over the rescue");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox
    .stub(Utils, "baseAttachmentsURL")
    .returns("http://localhost:8888/base_url/");
  sandbox.stub(feed, "fetch").callsFake(async () => {
    // The person picks something else while the download is in flight.
    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, "light-beach");
    return {
      ok: true,
      status: 200,
      headers: { get: () => "image/avif" },
      arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
    };
  });

  await feed.rescueRetiredWallpaper([record]);

  Assert.equal(
    (await feed.getSavedWallpapers()).length,
    1,
    "The retired wallpaper is still saved for them"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    "But it does not take over the wallpaper they just chose"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(async function test_rescue_ignores_a_republished_record() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Republishing a collection is not a retirement");

  const record = retiredRecordForTest();
  Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, record.title);
  sandbox.stub(feed, "fetch").resolves({});

  await feed.rescueRetiredWallpaper([record], [retiredRecordForTest()]);

  Assert.ok(feed.fetch.notCalled, "Nothing is downloaded");
  Assert.deepEqual(
    await feed.getSavedWallpapers(),
    [],
    "Nothing is saved into the library"
  );

  Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
  await clearWallpaperDirForTest();
  sandbox.restore();
});

add_task(
  async function test_rescued_wallpaper_without_a_string_still_has_a_name() {
    let sandbox = sinon.createSandbox();
    let feed = getWallpaperFeedForTest();
    await clearWallpaperDirForTest();

    info(
      "Not every shipped wallpaper has a string, and two of them must differ"
    );

    const first = { ...retiredRecordForTest() };
    delete first.fluent_id;
    const second = { ...first, title: "light-beach", theme: "light" };

    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, first.title);
    sandbox
      .stub(Utils, "baseAttachmentsURL")
      .returns("http://localhost:8888/base_url/");
    sandbox.stub(feed, "fetch").resolves({
      ok: true,
      status: 200,
      headers: { get: () => "image/avif" },
      arrayBuffer: async () => new TextEncoder().encode("image bytes").buffer,
    });

    await feed.rescueRetiredWallpaper([first]);
    Services.prefs.setStringPref(PREF_SELECTED_WALLPAPER, second.title);
    await feed.rescueRetiredWallpaper([second]);

    const saved = await feed.getSavedWallpapers();
    const names = saved.map(entry => entry.fallbackName);

    Assert.equal(saved.length, 2, "Both were rescued");
    Assert.deepEqual(
      [...names].sort(),
      ["dark-mountain", "light-beach"],
      "Each falls back to its own short name rather than to nothing"
    );
    Assert.equal(
      new Set(names).size,
      2,
      "The two names differ, so their remove buttons are told apart"
    );

    Services.prefs.clearUserPref(PREF_SELECTED_WALLPAPER);
    sandbox.restore();
    await clearWallpaperDirForTest();
  }
);

add_task(async function test_potd_is_not_saved_twice_in_one_day() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Pressing Set wallpaper twice on one picture should keep one copy");

  const first = await feed.wallpaperUpload(
    new Blob(["today"], { type: "image/png" }),
    "light",
    "potd",
    { name: "Today's picture", publishedDate: "2026-07-02" }
  );
  const second = await feed.wallpaperUpload(
    new Blob(["today again"], { type: "image/png" }),
    "light",
    "potd",
    { name: "Today's picture", publishedDate: "2026-07-02" }
  );

  Assert.equal(first, second, "The second press applies the copy already kept");
  const saved = await feed.getSavedWallpapers();
  Assert.equal(saved.length, 1, "One copy in the library, not two");

  // A different day is a different picture, so that one is kept as well.
  await feed.wallpaperUpload(
    new Blob(["tomorrow"], { type: "image/png" }),
    "dark",
    "potd",
    { name: "Tomorrow's picture", publishedDate: "2026-07-03" }
  );
  Assert.equal(
    (await feed.getSavedWallpapers()).length,
    2,
    "The next day's picture is its own image"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_potd_is_saved_again_when_the_kept_copy_fails() {
  let sandbox = sinon.createSandbox();
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("A kept copy that cannot be applied is replaced by a fresh save");

  const first = await feed.wallpaperUpload(
    new Blob(["today"], { type: "image/png" }),
    "light",
    "potd",
    { name: "Today's picture", publishedDate: "2026-07-02" }
  );
  const copy = sandbox.stub(feed, "copyFile");
  copy.onFirstCall().rejects(new Error("disk"));
  copy.callThrough();

  const second = await feed.wallpaperUpload(
    new Blob(["today again"], { type: "image/png" }),
    "light",
    "potd",
    { name: "Today's picture", publishedDate: "2026-07-02" }
  );

  Assert.ok(second, "The second press still applies a wallpaper");
  Assert.notEqual(first, second, "A fresh copy, not the one that failed");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID, ""),
    PathUtils.filename(second),
    "The fresh copy is the applied one"
  );

  sandbox.restore();
  await clearWallpaperDirForTest();
});

add_task(async function test_a_second_delete_reports_nothing() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Two tabs confirming one dialog must not report two removals");

  const saved = await feed.wallpaperUpload(
    new Blob(["once"], { type: "image/png" }),
    "light"
  );
  const filename = PathUtils.filename(saved);

  await feed.removeCustomWallpaper(filename, "port-1");
  const afterFirst = feed.store.dispatch
    .getCalls()
    .filter(c => c.args[0].type === actionTypes.WALLPAPER_SAVED_REMOVED).length;

  await feed.removeCustomWallpaper(filename, "port-2");
  const afterSecond = feed.store.dispatch
    .getCalls()
    .filter(c => c.args[0].type === actionTypes.WALLPAPER_SAVED_REMOVED).length;

  Assert.equal(afterFirst, 1, "The tab that removed it reports a removal");
  Assert.equal(afterSecond, 1, "The second tab reports nothing");

  await clearWallpaperDirForTest();
});

add_task(async function test_saving_reports_where_the_image_came_from() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("An upload and a kept Picture of the Day report different sources");

  await feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: { file: new Blob(["mine"], { type: "image/png" }), theme: "light" },
    meta: { fromTarget: "port-1" },
  });

  await feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: {
      file: new Blob(["a picture"], { type: "image/png" }),
      theme: "light",
      type: "potd",
      name: "A grey heron at dawn",
      publishedDate: "2026-08-31",
    },
    meta: { fromTarget: "port-1" },
  });

  const added = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .filter(a => a.type === actionTypes.WALLPAPER_SAVED_ADDED);

  Assert.equal(added.length, 2, "Both saves are reported");
  Assert.equal(
    added[0].data.wallpaper_source,
    "custom",
    "The upload is custom"
  );
  Assert.equal(added[0].data.saved_wallpaper_count, 1, "One saved so far");
  Assert.equal(
    added[1].data.wallpaper_source,
    "potd",
    "The kept picture says so"
  );
  Assert.equal(added[1].data.saved_wallpaper_count, 2, "Now there are two");

  await clearWallpaperDirForTest();
});

add_task(async function test_a_refused_upload_reports_no_save() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Nothing was written, so nothing is reported");

  await feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: { file: null, theme: "light" },
    meta: { fromTarget: "port-1" },
  });

  const added = feed.store.dispatch
    .getCalls()
    .filter(c => c.args[0].type === actionTypes.WALLPAPER_SAVED_ADDED);

  Assert.equal(added.length, 0, "A refused upload is not counted as a save");

  await clearWallpaperDirForTest();
});

add_task(async function test_applying_reports_where_the_image_came_from() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Picking a saved image says which kind it was");

  const saved = await feed.wallpaperUpload(
    new Blob(["mine"], { type: "image/png" }),
    "light"
  );
  const filename = PathUtils.filename(saved);

  feed.store.dispatch.resetHistory();
  await feed.applySavedWallpaper(filename, "port-1");

  const [applied] = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .filter(a => a.type === actionTypes.WALLPAPER_SAVED_APPLIED);

  Assert.ok(applied, "The selection is reported");
  Assert.equal(
    applied.data.wallpaper_source,
    "custom",
    "And says it is custom"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_setting_the_same_picture_twice_is_not_two_saves() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Pressing Set wallpaper twice on one picture applies, it does not save");

  const upload = {
    type: actionTypes.WALLPAPER_UPLOAD,
    data: {
      file: new Blob(["a picture"], { type: "image/png" }),
      theme: "light",
      type: "potd",
      name: "A grey heron at dawn",
      publishedDate: "2026-08-31",
    },
    meta: { fromTarget: "port-1" },
  };

  await feed.onAction(upload);
  await feed.onAction(upload);

  const events = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0].type)
    .filter(
      t =>
        t === actionTypes.WALLPAPER_SAVED_ADDED ||
        t === actionTypes.WALLPAPER_SAVED_APPLIED
    );

  Assert.equal(
    events.filter(t => t === actionTypes.WALLPAPER_SAVED_ADDED).length,
    1,
    "Only the first one is a save"
  );
  Assert.equal(
    events.filter(t => t === actionTypes.WALLPAPER_SAVED_APPLIED).length,
    1,
    "The second is reported as applying the copy already saved"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_removal_reports_where_the_image_came_from() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Saves and selections carry the source, so removals have to as well");

  const libraryDir = libraryDirForTest();
  await IOUtils.makeDirectory(libraryDir, { ignoreExisting: true });

  for (const [type, expected] of [
    ["custom", "custom"],
    ["potd", "potd"],
    ["builtin", "builtin"],
  ]) {
    const filename = `v1-${type}-light-center-1-${LEGACY_UUID}`;
    await IOUtils.write(PathUtils.join(libraryDir, filename), PNG_BYTES());

    feed.store.dispatch.resetHistory();
    await feed.removeCustomWallpaper(filename, "port-1");

    const removed = feed.store.dispatch
      .getCalls()
      .map(call => call.args[0])
      .find(action => action.type === actionTypes.WALLPAPER_SAVED_REMOVED);

    Assert.equal(
      removed?.data?.wallpaper_source,
      expected,
      `A removed ${type} image is reported as ${expected}`
    );
  }

  await clearWallpaperDirForTest();
});
