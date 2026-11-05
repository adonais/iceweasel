/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

let { nsUnknownContentTypeDialog } = ChromeUtils.importESModule(
  "resource://gre/modules/HelperAppDlg.sys.mjs"
);

let MockFilePicker = SpecialPowers.MockFilePicker;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.download.useDownloadDir", false],
      ["browser.download.lastDir", ""],
      ["browser.download.lastDir.savePerSite", true],
    ],
  });
  MockFilePicker.init();
  registerCleanupFunction(() => MockFilePicker.cleanup());
});

function createSaveDirectory() {
  let directory = Services.dirsvc.get("TmpD", Ci.nsIFile);
  directory.append("download-save-directory");
  directory.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
  registerCleanupFunction(() => directory.remove(true));
  return directory;
}

function fileInDirectory(directory, name) {
  let file = directory.clone();
  file.append(name);
  return file;
}

async function openSaveWindow(isPrivate = false) {
  let win = await BrowserTestUtils.openNewBrowserWindow({
    private: isPrivate,
  });
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await BrowserTestUtils.closeWindow(win);
    }
  });
  return win;
}

async function rememberDirectory(win, source, directory) {
  let lastDir = new DownloadLastDir(win);
  lastDir.setFile(source, directory);
  registerCleanupFunction(() => lastDir.setFile(source, null));
  Assert.equal((await lastDir.getFileAsync(source)).path, directory.path);
}

function promptToSave(win, source, name) {
  let { promise, resolve } = Promise.withResolvers();
  let calls = 0;
  let launcher = {
    source,
    MIMEInfo: { description: "Text", primaryExtension: "txt" },
    saveDestinationAvailable(file) {
      Assert.equal(++calls, 1, "The download receives exactly one result");
      resolve(file);
    },
  };
  new nsUnknownContentTypeDialog().promptForSaveToFileAsync(
    launcher,
    win.docShell.QueryInterface(Ci.nsIInterfaceRequestor),
    name,
    ".txt",
    true
  );
  return {
    result: promise,
    get calls() {
      return calls;
    },
  };
}

async function checkDirectoryReuse(isPrivate) {
  let win = await openSaveWindow(isPrivate);
  let initialDir = createSaveDirectory();
  let firstDir = createSaveDirectory();
  let secondDir = createSaveDirectory();
  let source = Services.io.newURI("https://directory.example.com/file.txt");
  await rememberDirectory(win, source, initialDir);
  let lastDirPref = Services.prefs.getStringPref("browser.download.lastDir");
  let expected = [initialDir, firstDir, secondDir];
  let selected = [firstDir, secondDir, secondDir];
  let shown = 0;
  MockFilePicker.showCallback = picker => {
    Assert.equal(
      picker.displayDirectory.path,
      expected[shown].path,
      "The next picker uses the directory selected by the preceding save"
    );
    MockFilePicker.setFiles([
      fileInDirectory(selected[shown], picker.defaultString),
    ]);
    ++shown;
    return MockFilePicker.returnOK;
  };

  let requests = ["first.txt", "second.txt", "third.txt"].map(name =>
    promptToSave(win, source, name)
  );
  let files = await Promise.all(requests.map(request => request.result));
  Assert.equal(shown, 3, "Every download gets a picker");
  Assert.deepEqual(
    files.map(file => file.parent.path),
    selected.map(directory => directory.path),
    "Every file uses its selected directory"
  );
  if (isPrivate) {
    Assert.equal(
      Services.prefs.getStringPref("browser.download.lastDir"),
      lastDirPref,
      "Private saves do not change the persisted directory"
    );
  }
  await BrowserTestUtils.closeWindow(win);
}

add_task(async function test_directory_reuse() {
  await checkDirectoryReuse(false);
});

add_task(async function test_private_directory_reuse() {
  await checkDirectoryReuse(true);
});

add_task(async function test_site_directories_remain_separate() {
  let win = await openSaveWindow();
  let firstDir = createSaveDirectory();
  let otherDir = createSaveDirectory();
  let chosenDir = createSaveDirectory();
  let firstSource = Services.io.newURI("https://first.example.com/file.txt");
  let otherSource = Services.io.newURI("https://other.example.com/file.txt");
  await rememberDirectory(win, firstSource, firstDir);
  await rememberDirectory(win, otherSource, otherDir);
  let expected = [firstDir, otherDir];
  let shown = 0;
  MockFilePicker.showCallback = picker => {
    Assert.equal(picker.displayDirectory.path, expected[shown].path);
    ++shown;
    MockFilePicker.setFiles([fileInDirectory(chosenDir, picker.defaultString)]);
    return MockFilePicker.returnOK;
  };
  let first = promptToSave(win, firstSource, "first.txt");
  let other = promptToSave(win, otherSource, "other.txt");
  await Promise.all([first.result, other.result]);
  Assert.equal(shown, 2);
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_other_windows_remain_independent() {
  let firstWindow = await openSaveWindow();
  let otherWindow = await openSaveWindow();
  let source = Services.io.newURI("https://independent.example.com/file.txt");
  let firstShown = Promise.withResolvers();
  let finishFirst = Promise.withResolvers();
  registerCleanupFunction(() =>
    finishFirst.resolve(MockFilePicker.returnCancel)
  );
  MockFilePicker.showCallback = async picker => {
    if (picker.defaultString == "first.txt") {
      firstShown.resolve();
      return finishFirst.promise;
    }
    return MockFilePicker.returnCancel;
  };
  let first = promptToSave(firstWindow, source, "first.txt");
  await firstShown.promise;
  let other = promptToSave(otherWindow, source, "other.txt");
  Assert.equal(
    await other.result,
    null,
    "Another window can finish independently"
  );
  Assert.equal(first.calls, 0, "The first window is still waiting");
  finishFirst.resolve(MockFilePicker.returnCancel);
  await first.result;
  await BrowserTestUtils.closeWindow(firstWindow);
  await BrowserTestUtils.closeWindow(otherWindow);
});

add_task(async function test_close_window_cancels_active_and_queued_requests() {
  let win = await openSaveWindow();
  let source = Services.io.newURI("https://closed.example.com/file.txt");
  let firstShown = Promise.withResolvers();
  let finishPicker = Promise.withResolvers();
  let pickerFinished = Promise.withResolvers();
  MockFilePicker.setFiles([]);
  registerCleanupFunction(() =>
    finishPicker.resolve(MockFilePicker.returnCancel)
  );
  let shown = 0;
  MockFilePicker.showCallback = () => {
    ++shown;
    firstShown.resolve();
    return finishPicker.promise;
  };
  let requests = ["first.txt", "second.txt", "third.txt"].map(name =>
    promptToSave(win, source, name)
  );
  await firstShown.promise;
  await BrowserTestUtils.closeWindow(win);
  Assert.deepEqual(
    await Promise.all(requests.map(request => request.result)),
    [null, null, null],
    "Closing the window cancels every request before the native callback arrives"
  );
  Assert.equal(shown, 1, "Queued pickers are not opened after window closure");

  MockFilePicker.afterOpenCallback = () => pickerFinished.resolve();
  finishPicker.resolve(MockFilePicker.returnCancel);
  await pickerFinished.promise;
  MockFilePicker.afterOpenCallback = null;
  Assert.deepEqual(
    requests.map(request => request.calls),
    [1, 1, 1],
    "The late native callback does not complete any download twice"
  );
});

add_task(async function test_close_window_during_directory_lookup() {
  let win = await openSaveWindow();
  let source = Services.io.newURI("https://lookup.example.com/file.txt");
  let lookupStarted = Promise.withResolvers();
  let finishLookup = Promise.withResolvers();
  let originalGetFileAsync = DownloadLastDir.prototype.getFileAsync;
  DownloadLastDir.prototype.getFileAsync = () => {
    lookupStarted.resolve();
    return finishLookup.promise;
  };
  registerCleanupFunction(() => {
    DownloadLastDir.prototype.getFileAsync = originalGetFileAsync;
    finishLookup.resolve(null);
  });
  let shown = 0;
  MockFilePicker.setFiles([]);
  MockFilePicker.showCallback = () => {
    ++shown;
    return MockFilePicker.returnCancel;
  };
  try {
    let request = promptToSave(win, source, "lookup.txt");
    await lookupStarted.promise;
    await BrowserTestUtils.closeWindow(win);
    Assert.equal(
      await request.result,
      null,
      "Window closure cancels a request while its directory lookup is pending"
    );
  } finally {
    DownloadLastDir.prototype.getFileAsync = originalGetFileAsync;
    finishLookup.resolve(null);
  }
  await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
  Assert.equal(shown, 0, "Finishing the lookup does not open a picker");
});

add_task(async function test_location_only_downloads() {
  let { HttpServer } = ChromeUtils.importESModule(
    "resource://testing-common/httpd.sys.mjs"
  );
  let { Downloads } = ChromeUtils.importESModule(
    "resource://gre/modules/Downloads.sys.mjs"
  );
  let server = new HttpServer();
  server.registerPathHandler("/download", (request, response) => {
    response.setHeader("Content-Type", "application/x-save-directory-test");
    response.setHeader(
      "Content-Disposition",
      "attachment; filename=download.txt"
    );
    response.write("Download directory test");
  });
  server.start(-1);
  registerCleanupFunction(() => new Promise(resolve => server.stop(resolve)));
  let source = Services.io.newURI(
    `http://localhost:${server.identity.primaryPort}/download`
  );
  let mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  let handlerService = Cc[
    "@mozilla.org/uriloader/handler-service;1"
  ].getService(Ci.nsIHandlerService);
  let handler = mimeService.getFromTypeAndExtension(
    "application/x-save-directory-test",
    "txt"
  );
  handler.preferredAction = Ci.nsIHandlerInfo.saveToDisk;
  handler.alwaysAskBeforeHandling = false;
  handlerService.store(handler);
  registerCleanupFunction(() => handlerService.remove(handler));

  let win = await openSaveWindow();
  let initialDir = createSaveDirectory();
  let chosenDir = createSaveDirectory();
  await rememberDirectory(win, source, initialDir);
  let shown = 0;
  MockFilePicker.showCallback = picker => {
    Assert.equal(
      picker.displayDirectory.path,
      shown ? chosenDir.path : initialDir.path,
      "Location-only downloads reuse the directory selected by the previous save"
    );
    ++shown;
    MockFilePicker.setFiles([
      fileInDirectory(chosenDir, `location-only-${shown}.txt`),
    ]);
    return MockFilePicker.returnOK;
  };

  let list = await Downloads.getList(Downloads.ALL);
  let completed = Promise.withResolvers();
  let downloads = new Set();
  let view = {
    onDownloadChanged(download) {
      if (download.source.url != source.spec) {
        return;
      }
      downloads.add(download);
      if (downloads.size == 3 && [...downloads].every(item => item.succeeded)) {
        completed.resolve();
      }
    },
  };
  list.addView(view);
  registerCleanupFunction(async () => {
    list.removeView(view);
    for (let download of downloads) {
      await download.finalize(true);
      await list.remove(download);
    }
  });
  for (let i = 0; i < 3; ++i) {
    win.gBrowser.addTab(source.spec, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  }
  await completed.promise;
  Assert.equal(shown, 3, "All three downloads show a location picker");
  Assert.ok(
    [...downloads].every(download =>
      download.target.path.startsWith(chosenDir.path)
    ),
    "All three downloads finish in the selected directory"
  );
  await BrowserTestUtils.closeWindow(win);
});
