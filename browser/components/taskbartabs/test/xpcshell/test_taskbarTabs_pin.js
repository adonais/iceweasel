/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  FileTestUtils: "resource://testing-common/FileTestUtils.sys.mjs",
  MockRegistrar: "resource://testing-common/MockRegistrar.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  ShellService: "moz-src:///browser/components/shell/ShellService.sys.mjs",
  TaskbarTabsPin: "resource:///modules/taskbartabs/TaskbarTabsPin.sys.mjs",
  TaskbarTabsRegistry:
    "resource:///modules/taskbartabs/TaskbarTabsRegistry.sys.mjs",
  XPCOMUtils: "resource://gre/modules/XPCOMUtils.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetters(this, {
  imgTools: ["@mozilla.org/image/tools;1", Ci.imgITools],
});

// We want to mock the native XPCOM interfaces of the initialized
// `ShellService.shellService`, but those interfaces are frozen. Instead we
// proxy `ShellService.shellService` and mock it.
let gCreateWindowsIcon = ShellService.shellService.createWindowsIcon;
let gOverrideWindowsIconFileOnce;
const kMockNativeShellService = {
  ...ShellService.shellService,
  createWindowsIcon: sinon
    .stub()
    .callsFake(async (aIconFile, aImgContainer) => {
      if (gOverrideWindowsIconFileOnce) {
        await gCreateWindowsIcon(gOverrideWindowsIconFileOnce, aImgContainer);
        gOverrideWindowsIconFileOnce = null;
      }
    }),
  createShortcut: sinon.stub().resolves("dummy_path"),
  deleteShortcut: sinon.stub().resolves("dummy_path"),
  pinShortcutToTaskbar: sinon.stub().resolves(),
  getTaskbarTabShortcutPath: sinon
    .stub()
    .returns(FileTestUtils.getTempFile().parent.path),
  unpinShortcutFromTaskbar: sinon.stub(),
};

sinon.stub(ShellService, "shellService").value(kMockNativeShellService);

sinon.stub(TaskbarTabsPin, "_getLocalization").returns({
  formatValue(msg) {
    // Slash must also be sanitized, so it should appear as '_' in paths.
    return `[formatValue/${msg}]`;
  },
});

registerCleanupFunction(() => {
  sinon.restore();
});

// Favicons are written to the profile directory, ensure it exists.
do_get_profile();

const kFaviconService = Cc[
  "@mozilla.org/browser/favicon-service;1"
].createInstance(Ci.nsIFaviconService);

let gPngFavicon;
let gSvgFavicon;
add_setup(async () => {
  const pngFile = do_get_file("favicon-normal16.png");
  const pngData = await IOUtils.read(pngFile.path);
  gPngFavicon = { rawData: pngData.buffer, mimeType: "image/png" };

  const svgFile = do_get_file("icon.svg");
  gSvgFavicon = {
    dataURI: Services.io.newFileURI(svgFile),
    mimeType: "image/svg+xml",
  };
});

let gFavicon;

const kMockFaviconService = {
  QueryInterface: ChromeUtils.generateQI(["nsIFaviconService"]),
  getFaviconForPage: sinon.stub().callsFake(async () => {
    return gFavicon;
  }),
  get defaultFavicon() {
    return kFaviconService.defaultFavicon;
  },
};
const kDefaultIconSpy = sinon.spy(kMockFaviconService, "defaultFavicon", [
  "get",
]);

function shellPinCalled(aTaskbarTab) {
  ok(
    kMockNativeShellService.createWindowsIcon.calledOnce,
    `Icon creation should have been called.`
  );
  ok(
    kMockNativeShellService.createShortcut.calledOnce,
    `Shortcut creation should have been called.`
  );
  ok(
    kMockNativeShellService.pinShortcutToTaskbar.calledOnce,
    `Pin to taskbar should have been called.`
  );
  Assert.equal(
    kMockNativeShellService.pinShortcutToTaskbar.firstCall.args[1],
    kMockNativeShellService.createShortcut.firstCall.args[6],
    `The created and pinned shortcuts should be in the same folder.`
  );
  Assert.equal(
    kMockNativeShellService.pinShortcutToTaskbar.firstCall.args[2],
    kMockNativeShellService.createShortcut.firstCall.args[7],
    `The created and pinned shortcuts should be the same file.`
  );
  Assert.equal(
    kMockNativeShellService.pinShortcutToTaskbar.firstCall.args[2],
    aTaskbarTab.shortcutRelativePath,
    `The pinned shortcut should be the saved shortcut.`
  );
}

function shellUnpinCalled() {
  ok(
    kMockNativeShellService.deleteShortcut.calledOnce,
    `Unpin from taskbar should have been called.`
  );
  ok(
    kMockNativeShellService.unpinShortcutFromTaskbar.calledOnce,
    `Unpin from taskbar should have been called.`
  );
}

MockRegistrar.register(
  "@mozilla.org/browser/favicon-service;1",
  kMockFaviconService
);

async function testWrittenIconFile(aIconFile) {
  const data = await IOUtils.read(aIconFile.path);
  const imgContainer = imgTools.decodeImageFromArrayBuffer(
    data.buffer,
    "image/vnd.microsoft.icon"
  );
  equal(
    imgContainer.width,
    256,
    "Image written to disk should be 256px width."
  );
  equal(
    imgContainer.height,
    256,
    "Image written to disk should be 256px height."
  );
}

const url = Services.io.newURI("https://www.test.com");
const userContextId = 0;

const registry = new TaskbarTabsRegistry();
const taskbarTab = registry.findOrCreateTaskbarTab(url, userContextId);

const patchedSpy = sinon.stub();
registry.on(TaskbarTabsRegistry.events.patched, patchedSpy);

function getTempFile() {
  let path = do_get_tempdir();
  let filename = Services.uuid.generateUUID().toString().slice(1, -1);
  path.append(filename + ".ico");
  return path;
}

add_task(async function test_pin_existing_favicon_raster() {
  sinon.resetHistory();
  gFavicon = gPngFavicon;

  let iconFile = getTempFile();
  gOverrideWindowsIconFileOnce = iconFile;

  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);

  ok(
    kMockFaviconService.getFaviconForPage.calledOnce,
    "The favicon for the page should have attempted to be retrieved."
  );
  const imgContainer =
    kMockNativeShellService.createWindowsIcon.firstCall.args[1];
  equal(imgContainer.width, 256, "Image should be scaled to 256px width.");
  equal(imgContainer.height, 256, "Image should be scaled to 256px height.");
  ok(
    kDefaultIconSpy.get.notCalled,
    "The default icon should not be used when a favicon exists for the page."
  );

  await testWrittenIconFile(iconFile);

  shellPinCalled(taskbarTab);
});

add_task(async function test_pin_existing_favicon_vector() {
  sinon.resetHistory();
  gFavicon = gSvgFavicon;

  let iconFile = getTempFile();
  gOverrideWindowsIconFileOnce = iconFile;

  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);

  ok(
    kDefaultIconSpy.get.notCalled,
    "The default icon should not be used when a vector favicon exists for the page."
  );

  await testWrittenIconFile(iconFile);

  shellPinCalled(taskbarTab);
});

add_task(async function test_pin_missing_favicon() {
  sinon.resetHistory();
  gFavicon = null;
  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);

  ok(
    kMockFaviconService.getFaviconForPage.calledOnce,
    "The favicon for the page should have attempted to be retrieved."
  );
  ok(
    kDefaultIconSpy.get.called,
    "The default icon should be used when a favicon does not exist for the page."
  );

  shellPinCalled(taskbarTab);
});

add_task(async function test_pin_location() {
  sinon.resetHistory();

  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);
  const spy = kMockNativeShellService.createShortcut;
  ok(spy.calledOnce, "A shortcut was created");
  Assert.equal(
    spy.firstCall.args[6],
    "Programs",
    "The shortcut went into the Start Menu folder"
  );
  Assert.equal(
    spy.firstCall.args[7],
    `[formatValue_taskbar-tab-shortcut-folder]\\${taskbarTab.name}.lnk`,
    "The shortcut should be in a subdirectory and have a default name"
  );

  Assert.equal(
    taskbarTab.shortcutRelativePath,
    spy.firstCall.args[7],
    "Correct relative path was saved to the taskbar tab"
  );
  Assert.equal(patchedSpy.callCount, 1, "A single patched event was emitted");
});

add_task(async function test_pin_location_dos_name() {
  const parsedURI = Services.io.newURI("https://aux.test");
  const invalidTaskbarTab = registry.findOrCreateTaskbarTab(parsedURI, 0);
  sinon.resetHistory();

  await TaskbarTabsPin.pinTaskbarTab(invalidTaskbarTab, registry);
  const spy = kMockNativeShellService.createShortcut;
  ok(spy.calledOnce, "A shortcut was created");
  Assert.equal(
    spy.firstCall.args[6],
    "Programs",
    "The shortcut went into the Start Menu folder"
  );
  // 'Untitled' is the default selected by the MIME code, since
  // AUX is a reserved name on Windows.
  Assert.equal(
    spy.firstCall.args[7],
    "[formatValue_taskbar-tab-shortcut-folder]\\Untitled.lnk",
    "The shortcut should be in a subdirectory and have a default name"
  );
  Assert.equal(
    invalidTaskbarTab.shortcutRelativePath,
    spy.firstCall.args[7],
    "Correct relative path was saved to the taskbar tab"
  );
  Assert.equal(patchedSpy.callCount, 1, "A single patched event was emitted");

  registry.removeTaskbarTab(invalidTaskbarTab.id);
});

add_task(async function test_pin_location_bad_characters() {
  const parsedURI = Services.io.newURI("https://another.test");
  const invalidTaskbarTab = registry.findOrCreateTaskbarTab(parsedURI, 0, {
    manifest: {
      name: "** :\t\r\n \\\\ >> Not a valid. filename??! << // |||: **.",
    },
  });
  sinon.resetHistory();

  await TaskbarTabsPin.pinTaskbarTab(invalidTaskbarTab);
  const spy = kMockNativeShellService.createShortcut;
  ok(spy.calledOnce, "A shortcut was created");
  Assert.equal(
    spy.firstCall.args[6],
    "Programs",
    "The shortcut went into the Start Menu folder"
  );
  Assert.equal(
    spy.firstCall.args[7],
    "[formatValue_taskbar-tab-shortcut-folder]\\__ ____ __ __ Not a valid. filename__! __ __ ____ __..lnk",
    "The shortcut should have invalid characters filtered out."
  );
  registry.removeTaskbarTab(invalidTaskbarTab.id);
});

add_task(async function test_pin_location_lnk_extension() {
  const parsedURI = Services.io.newURI("https://another.test");
  const invalidTaskbarTab = registry.findOrCreateTaskbarTab(parsedURI, 0, {
    manifest: {
      name: "coolstartup.lnk",
    },
  });
  sinon.resetHistory();

  await TaskbarTabsPin.pinTaskbarTab(invalidTaskbarTab);
  const spy = kMockNativeShellService.createShortcut;
  ok(spy.calledOnce, "A shortcut was created");
  Assert.equal(
    spy.firstCall.args[6],
    "Programs",
    "The shortcut went into the Start Menu folder"
  );
  Assert.equal(
    spy.firstCall.args[7],
    "[formatValue_taskbar-tab-shortcut-folder]\\coolstartup.lnk.lnk",
    "The shortcut should keep the .lnk intact."
  );

  registry.removeTaskbarTab(invalidTaskbarTab.id);
});

add_task(async function test_unpin() {
  sinon.resetHistory();
  await TaskbarTabsPin.unpinTaskbarTab(taskbarTab, registry);

  shellUnpinCalled();
  Assert.equal(
    taskbarTab.shortcutRelativePath,
    null,
    "Shortcut relative path was removed from the taskbar tab"
  );
  Assert.equal(patchedSpy.callCount, 1, "A single patched event was emitted");
});
