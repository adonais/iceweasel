/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests the DownloadStore object.
 */

"use strict";

// Globals

ChromeUtils.defineESModuleGetters(this, {
  DownloadError: "resource://gre/modules/DownloadCore.sys.mjs",
  DownloadSource: "resource://gre/modules/DownloadCore.sys.mjs",
  DownloadStore: "resource://gre/modules/DownloadStore.sys.mjs",
});

/**
 * Returns a new DownloadList object with an associated DownloadStore.
 *
 * @param aStorePath
 *        String pointing to the file to be associated with the DownloadStore,
 *        or undefined to use a non-existing temporary file.  In this case, the
 *        temporary file is deleted when the test file execution finishes.
 *
 * @returns {Promise<[DownloadList, DownloadStore]>}
 * @rejects JavaScript exception.
 */
function promiseNewListAndStore(aStorePath) {
  return promiseNewList().then(function (aList) {
    let path = aStorePath || getTempFile(TEST_STORE_FILE_NAME).path;
    let store = new DownloadStore(aList, path);
    return [aList, store];
  });
}

// Tests

/**
 * Saves downloads to a file, then reloads them.
 */
add_task(async function test_save_reload() {
  let [listForSave, storeForSave] = await promiseNewListAndStore();
  let [listForLoad, storeForLoad] = await promiseNewListAndStore(
    storeForSave.path
  );
  let referrerInfo = new ReferrerInfo(
    Ci.nsIReferrerInfo.EMPTY,
    true,
    NetUtil.newURI(TEST_REFERRER_URL)
  );

  listForSave.add(await promiseNewDownload(httpUrl("source.txt")));
  listForSave.add(
    await Downloads.createDownload({
      source: { url: httpUrl("empty.txt"), referrerInfo },
      target: getTempFile(TEST_TARGET_FILE_NAME),
    })
  );

  // If we used a callback to adjust the channel, the download should
  // not be serialized because we can't recreate it across sessions.
  let adjustedDownload = await Downloads.createDownload({
    source: {
      url: httpUrl("empty.txt"),
      adjustChannel: () => Promise.resolve(),
    },
    target: getTempFile(TEST_TARGET_FILE_NAME),
  });
  listForSave.add(adjustedDownload);

  let legacyDownload = await promiseStartLegacyDownload();
  await legacyDownload.cancel();
  listForSave.add(legacyDownload);

  await storeForSave.save();
  await storeForLoad.load();

  // Remove the adjusted download because it should not appear here.
  listForSave.remove(adjustedDownload);

  let itemsForSave = await listForSave.getAll();
  let itemsForLoad = await listForLoad.getAll();

  Assert.equal(itemsForSave.length, itemsForLoad.length);

  // Downloads should be reloaded in the same order.
  for (let i = 0; i < itemsForSave.length; i++) {
    // The reloaded downloads are different objects.
    Assert.notEqual(itemsForSave[i], itemsForLoad[i]);

    // The reloaded downloads have the same properties.
    Assert.equal(itemsForSave[i].source.url, itemsForLoad[i].source.url);
    Assert.equal(
      !!itemsForSave[i].source.referrerInfo,
      !!itemsForLoad[i].source.referrerInfo
    );
    if (
      itemsForSave[i].source.referrerInfo &&
      itemsForLoad[i].source.referrerInfo
    ) {
      Assert.ok(
        itemsForSave[i].source.referrerInfo.equals(
          itemsForLoad[i].source.referrerInfo
        )
      );
    }
    Assert.equal(itemsForSave[i].target.path, itemsForLoad[i].target.path);
    Assert.equal(
      itemsForSave[i].saver.toSerializable(),
      itemsForLoad[i].saver.toSerializable()
    );
  }
});

/**
 * Checks that saving an empty list deletes any existing file.
 */
add_task(async function test_save_empty() {
  let [, store] = await promiseNewListAndStore();

  await IOUtils.write(store.path, new Uint8Array());

  await store.save();

  let successful;
  try {
    await IOUtils.read(store.path);
    successful = true;
  } catch (ex) {
    successful = ex.name != "NotFoundError";
  }

  ok(!successful, "File should not exist");

  // If the file does not exist, saving should not generate exceptions.
  await store.save();
});

/**
 * Checks that loading from a missing file results in an empty list.
 */
add_task(async function test_load_empty() {
  let [list, store] = await promiseNewListAndStore();

  let succeesful;
  try {
    await IOUtils.read(store.path);
    succeesful = true;
  } catch (ex) {
    succeesful = ex.name != "NotFoundError";
  }

  ok(!succeesful, "File should not exist");

  let items = await list.getAll();
  Assert.equal(items.length, 0);
});

/**
 * Loads downloads from a string in a predefined format.  The purpose of this
 * test is to verify that the JSON format used in previous versions can be
 * loaded, assuming the file is reloaded on the same platform.
 */
add_task(async function test_load_string_predefined() {
  let [list, store] = await promiseNewListAndStore();

  // The platform-dependent file name should be generated dynamically.
  let targetPath = getTempFile(TEST_TARGET_FILE_NAME).path;
  let filePathLiteral = JSON.stringify(targetPath);
  let sourceUriLiteral = JSON.stringify(httpUrl("source.txt"));
  let emptyUriLiteral = JSON.stringify(httpUrl("empty.txt"));
  let referrerInfo = new ReferrerInfo(
    Ci.nsIReferrerInfo.EMPTY,
    true,
    NetUtil.newURI(TEST_REFERRER_URL)
  );
  let referrerInfoLiteral = JSON.stringify(
    E10SUtils.serializeReferrerInfo(referrerInfo)
  );

  let string =
    '{"list":[{"source":' +
    sourceUriLiteral +
    "," +
    '"target":' +
    filePathLiteral +
    "}," +
    '{"source":{"url":' +
    emptyUriLiteral +
    "," +
    '"referrerInfo":' +
    referrerInfoLiteral +
    "}," +
    '"target":' +
    filePathLiteral +
    "}]}";

  await IOUtils.write(store.path, new TextEncoder().encode(string), {
    tmpPath: store.path + ".tmp",
  });

  await store.load();

  let items = await list.getAll();

  Assert.equal(items.length, 2);

  Assert.equal(items[0].source.url, httpUrl("source.txt"));
  Assert.equal(items[0].target.path, targetPath);

  Assert.equal(items[1].source.url, httpUrl("empty.txt"));

  checkEqualReferrerInfos(items[1].source.referrerInfo, referrerInfo);
  Assert.equal(items[1].target.path, targetPath);
});

/**
 * Loads downloads from a well-formed JSON string containing unrecognized data.
 */
add_task(async function test_load_string_unrecognized() {
  let [list, store] = await promiseNewListAndStore();

  // The platform-dependent file name should be generated dynamically.
  let targetPath = getTempFile(TEST_TARGET_FILE_NAME).path;
  let filePathLiteral = JSON.stringify(targetPath);
  let sourceUriLiteral = JSON.stringify(httpUrl("source.txt"));

  let string =
    '{"list":[{"source":null,' +
    '"target":null},' +
    '{"source":{"url":' +
    sourceUriLiteral +
    "}," +
    '"target":{"path":' +
    filePathLiteral +
    "}," +
    '"saver":{"type":"copy"}}]}';

  await IOUtils.write(store.path, new TextEncoder().encode(string), {
    tmpPath: store.path + ".tmp",
  });

  await store.load();

  let items = await list.getAll();

  Assert.equal(items.length, 1);

  Assert.equal(items[0].source.url, httpUrl("source.txt"));
  Assert.equal(items[0].target.path, targetPath);
});

/**
 * Loads downloads from a malformed JSON string.
 */
add_task(async function test_load_string_malformed() {
  let [list, store] = await promiseNewListAndStore();

  let string =
    '{"list":[{"source":null,"target":null},' +
    '{"source":{"url":"about:blank"}}}';

  await IOUtils.write(store.path, new TextEncoder().encode(string), {
    tmpPath: store.path + ".tmp",
  });

  try {
    await store.load();
    do_throw("Exception expected when JSON data is malformed.");
  } catch (ex) {
    if (ex.name != "SyntaxError") {
      throw ex;
    }
    info("The expected SyntaxError exception was thrown.");
  }

  let items = await list.getAll();

  Assert.equal(items.length, 0);
});

/**
 * Saves downloads with unknown properties to a file and then reloads
 * them to ensure that these properties are preserved.
 */
add_task(async function test_save_reload_unknownProperties() {
  let [listForSave, storeForSave] = await promiseNewListAndStore();
  let [listForLoad, storeForLoad] = await promiseNewListAndStore(
    storeForSave.path
  );

  let download1 = await promiseNewDownload(httpUrl("source.txt"));
  // startTime should be ignored as it is a known property, and error
  // is ignored by serialization
  download1._unknownProperties = {
    peanut: "butter",
    orange: "marmalade",
    startTime: 77,
    error: { message: "Passed" },
  };
  listForSave.add(download1);

  let download2 = await promiseStartLegacyDownload();
  await download2.cancel();
  download2._unknownProperties = { number: 5, object: { test: "string" } };
  listForSave.add(download2);

  let referrerInfo = new ReferrerInfo(
    Ci.nsIReferrerInfo.EMPTY,
    true,
    NetUtil.newURI(TEST_REFERRER_URL)
  );
  let download3 = await Downloads.createDownload({
    source: {
      url: httpUrl("empty.txt"),
      referrerInfo,
      source1: "download3source1",
      source2: "download3source2",
    },
    target: {
      path: getTempFile(TEST_TARGET_FILE_NAME).path,
      target1: "download3target1",
      target2: "download3target2",
    },
    saver: {
      type: "copy",
      saver1: "download3saver1",
      saver2: "download3saver2",
    },
  });
  listForSave.add(download3);

  await storeForSave.save();
  await storeForLoad.load();

  let itemsForSave = await listForSave.getAll();
  let itemsForLoad = await listForLoad.getAll();

  Assert.equal(itemsForSave.length, itemsForLoad.length);

  Assert.equal(Object.keys(itemsForLoad[0]._unknownProperties).length, 2);
  Assert.equal(itemsForLoad[0]._unknownProperties.peanut, "butter");
  Assert.equal(itemsForLoad[0]._unknownProperties.orange, "marmalade");
  Assert.equal(false, "startTime" in itemsForLoad[0]._unknownProperties);
  Assert.equal(false, "error" in itemsForLoad[0]._unknownProperties);

  Assert.equal(Object.keys(itemsForLoad[1]._unknownProperties).length, 2);
  Assert.equal(itemsForLoad[1]._unknownProperties.number, 5);
  Assert.equal(itemsForLoad[1]._unknownProperties.object.test, "string");

  Assert.equal(
    Object.keys(itemsForLoad[2].source._unknownProperties).length,
    2
  );
  Assert.equal(
    itemsForLoad[2].source._unknownProperties.source1,
    "download3source1"
  );
  Assert.equal(
    itemsForLoad[2].source._unknownProperties.source2,
    "download3source2"
  );

  Assert.equal(
    Object.keys(itemsForLoad[2].target._unknownProperties).length,
    2
  );
  Assert.equal(
    itemsForLoad[2].target._unknownProperties.target1,
    "download3target1"
  );
  Assert.equal(
    itemsForLoad[2].target._unknownProperties.target2,
    "download3target2"
  );

  Assert.equal(Object.keys(itemsForLoad[2].saver._unknownProperties).length, 2);
  Assert.equal(
    itemsForLoad[2].saver._unknownProperties.saver1,
    "download3saver1"
  );
  Assert.equal(
    itemsForLoad[2].saver._unknownProperties.saver2,
    "download3saver2"
  );
});

/**
 * Saves insecure and malware downloads to a file, then reloads the file and
 * checks if they are still there.
 */
add_task(async function test_blocked_download_deletion() {
  let referrerInfo = new ReferrerInfo(
    Ci.nsIReferrerInfo.EMPTY,
    true,
    NetUtil.newURI(TEST_REFERRER_URL)
  );

  const createTestDownload = async (startTime, reputationCheckVerdict) => {
    let [listForSave, storeForSave] = await promiseNewListAndStore();
    let [listForLoad, storeForLoad] = await promiseNewListAndStore(
      storeForSave.path
    );
    // Create a valid test download and start it so it creates a file
    let targetFile = getTempFile(TEST_TARGET_FILE_NAME);
    let download = await Downloads.createDownload({
      source: { url: httpUrl("empty.txt"), referrerInfo },
      target: targetFile.path,
      startTime: new Date().toISOString(),
      contentType: "application/zip",
    });
    await download.start();

    // Add an "Insecure Download" error and overwrite the start time for
    // serialization
    download.hasBlockedData = true;
    download.error = DownloadError.fromSerializable({
      becauseBlockedByReputationCheck: true,
      reputationCheckVerdict,
    });
    download.startTime = startTime;

    let targetPath = download.target.path;

    // Add download to store, save, load and retrieve deserialized download list
    listForSave.add(download);
    await storeForSave.save();
    await storeForLoad.load();
    let loadedDownloadList = await listForLoad.getAll();

    return [loadedDownloadList, targetPath];
  };

  for (let { old, verdict } of [
    {
      old: true,
      verdict: "Insecure",
    },
    {
      old: false,
      verdict: "Insecure",
    },
    {
      old: true,
      verdict: "Malware",
    },
    {
      old: false,
      verdict: "Malware",
    },
  ]) {
    let date = old ? new Date(Date.now() - 660000) : new Date();
    let expectRemoval = old;
    let desc = `${old ? "Old" : "New"} ${verdict} download`;
    let [loadedDownloadList, targetPath] = await createTestDownload(
      date,
      verdict
    );

    Assert.equal(
      loadedDownloadList.length,
      expectRemoval ? 0 : 1,
      `${desc} should ${expectRemoval ? "be removed" : "be kept"}`
    );
    Assert.equal(
      await IOUtils.exists(targetPath),
      !expectRemoval,
      `${desc} file should ${expectRemoval ? "have been deleted" : "be kept"}.`
    );
  }
});

/**
 * Tests that a DownloadSource with a cleared URL (null) is not serializable,
 * which prevents it from being written to the store.
 */
add_task(async function test_source_cleared_data_uri_not_serializable() {
  let source = new DownloadSource();
  source.url = "data:,";
  source.isDataURICleared = true;
  Assert.strictEqual(
    source.toSerializable(),
    null,
    "DownloadSource.toSerializable() should return null when isDataURICleared is set"
  );
});
