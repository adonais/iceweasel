/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  Utils: "resource://services-settings/Utils.sys.mjs",
  reducers: "resource://newtab/common/Reducers.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  WallpaperFeed: "resource://newtab/lib/Wallpapers/WallpaperFeed.sys.mjs",
});

const PREF_WALLPAPERS_ENABLED =
  "browser.newtabpage.activity-stream.newtabWallpapers.enabled";

const PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID =
  "browser.newtabpage.activity-stream.newtabWallpapers.customWallpaper.uuid";

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
  };

  return feed;
}

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
  let feed = new WallpaperFeed();
  const fileData = {};

  Services.prefs.setBoolPref(PREF_WALLPAPERS_ENABLED, true);
  sandbox.stub(feed, "wallpaperUpload").returns();

  info("WallpaperFeed.onAction WALLPAPER_UPLOAD should call wallpaperUpload");

  feed.onAction({
    type: actionTypes.WALLPAPER_UPLOAD,
    data: { file: fileData, theme: "light" },
  });

  Assert.ok(feed.wallpaperUpload.calledOnce);
  Assert.ok(feed.wallpaperUpload.calledWith(fileData, "light"));

  Services.prefs.clearUserPref(PREF_WALLPAPERS_ENABLED);

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

const wallpaperDirForTest = () =>
  PathUtils.join(PathUtils.profileDir, "wallpaper");

const clearWallpaperDirForTest = async () => {
  await IOUtils.remove(wallpaperDirForTest(), {
    recursive: true,
    ignoreAbsent: true,
  });
  Services.prefs.clearUserPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID);
};

add_task(async function test_upload_sweeps_before_writing() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Every upload should clear orphans before writing its own file");

  const dir = wallpaperDirForTest();
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  await IOUtils.writeUTF8(PathUtils.join(dir, "pre-existing-orphan"), "junk");
  // A .tmp left by a write that was interrupted partway through.
  await IOUtils.writeUTF8(
    PathUtils.join(dir, "orphan-uuid.tmp"),
    "interrupted"
  );

  const written = await feed.wallpaperUpload(
    new Blob(["fresh"], { type: "image/png" }),
    "light"
  );

  Assert.deepEqual(
    await IOUtils.getChildren(dir),
    [written],
    "Orphans and leftover .tmp files are gone, only the new upload remains"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_upload_sweep_keeps_directories() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("The sweep an upload runs should only remove regular files");

  const dir = wallpaperDirForTest();
  const nested = PathUtils.join(dir, "nested");
  await IOUtils.makeDirectory(nested, { createAncestors: true });
  // Orphans either side of the directory, so a sweep that trips over it leaves
  // one of them behind whichever order the children come back in.
  await IOUtils.writeUTF8(PathUtils.join(dir, "aaa-orphan"), "before");
  await IOUtils.writeUTF8(PathUtils.join(dir, "zzz-orphan"), "after");

  const written = await feed.wallpaperUpload(
    new Blob(["fresh"], { type: "image/png" }),
    "light"
  );

  const children = await IOUtils.getChildren(dir);
  Assert.ok(children.includes(nested), "A directory is left alone");
  Assert.ok(children.includes(written), "The new upload is written");
  Assert.equal(children.length, 2, "Both orphaned files are removed");

  await clearWallpaperDirForTest();
});

add_task(async function test_concurrent_uploads_are_serialized() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Two uploads at once should leave exactly one file");

  const [first, second] = await Promise.all([
    feed.wallpaperUpload(new Blob(["one"], { type: "image/png" }), "light"),
    feed.wallpaperUpload(new Blob(["two"], { type: "image/png" }), "dark"),
  ]);

  Assert.notEqual(first, second, "Each upload wrote its own file");
  Assert.deepEqual(
    await IOUtils.getChildren(wallpaperDirForTest()),
    [second],
    "Only the second upload is left on disk"
  );
  Assert.ok(!(await IOUtils.exists(first)), "The first upload was deleted");
  Assert.ok(await IOUtils.exists(second), "The second upload is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(second),
    "The uuid pref names the second upload"
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
    await IOUtils.getChildren(wallpaperDirForTest()),
    [written],
    "Only the newest upload is on disk"
  );
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(written),
    "The uuid pref names the newest upload"
  );

  await clearWallpaperDirForTest();
});

add_task(async function test_wallpaperUpload_removes_replaced_file() {
  let feed = getWallpaperFeedForTest();
  await clearWallpaperDirForTest();

  info("Replacing a custom wallpaper should delete the file it replaced");

  const first = await feed.wallpaperUpload(
    new Blob(["first"], { type: "image/png" }),
    "light"
  );
  const second = await feed.wallpaperUpload(
    new Blob(["second"], { type: "image/png" }),
    "dark"
  );

  Assert.notEqual(first, second, "A replacement gets its own file");
  Assert.ok(
    !(await IOUtils.exists(first)),
    "The replaced wallpaper file is deleted"
  );
  Assert.ok(await IOUtils.exists(second), "The new wallpaper file is kept");
  Assert.equal(
    Services.prefs.getStringPref(PREF_WALLPAPERS_CUSTOM_WALLPAPER_UUID),
    PathUtils.filename(second),
    "The uuid pref names the new file"
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
    await IOUtils.getChildren(wallpaperDirForTest()),
    [first],
    "Nothing new is left behind by the failed write"
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
