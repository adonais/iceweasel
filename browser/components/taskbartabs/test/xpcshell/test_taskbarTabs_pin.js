/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  FileTestUtils: "resource://testing-common/FileTestUtils.sys.mjs",
  MockRegistrar: "resource://testing-common/MockRegistrar.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  ShellService: "resource:///modules/ShellService.sys.mjs",
  TaskbarTabsPin: "resource:///modules/taskbartabs/TaskbarTabsPin.sys.mjs",
  TaskbarTabsRegistry:
    "resource:///modules/taskbartabs/TaskbarTabsRegistry.sys.mjs",
});

// We want to mock the native XPCOM interfaces of the initialized
// `ShellService.shellService`, but those interfaces are frozen. Instead we
// proxy `ShellService.shellService` and mock it.
const mockNativeShellService = {
  ...ShellService.shellService,
  createWindowsIcon: sinon.stub().resolves(),
  createShortcut: sinon.stub().resolves("dummy_path"),
  deleteShortcut: sinon.stub().resolves("dummy_path"),
  pinShortcutToTaskbar: sinon.stub().resolves(),
  getTaskbarTabShortcutPath: sinon
    .stub()
    .returns(FileTestUtils.getTempFile().parent.path),
  unpinShortcutFromTaskbar: sinon.stub(),
};

sinon.stub(ShellService, "shellService").value(mockNativeShellService);

registerCleanupFunction(() => {
  sinon.restore();
});

// Favicons are written to the profile directory, ensure it exists.
do_get_profile();

const faviconService = Cc[
  "@mozilla.org/browser/favicon-service;1"
].createInstance(Ci.nsIFaviconService);

const kFaviconUri = Services.io.newFileURI(do_get_file("favicon-normal16.png"));
let faviconThrows = false;

let mockFaviconService = {
  QueryInterface: ChromeUtils.generateQI(["nsIFaviconService"]),
  getFaviconForPage: sinon.stub().callsFake(async () => {
    if (faviconThrows) {
      return null;
    }
    return { dataURI: kFaviconUri };
  }),
  get defaultFavicon() {
    return faviconService.defaultFavicon;
  },
};
let defaultIconSpy = sinon.spy(mockFaviconService, "defaultFavicon", ["get"]);

function shellPinCalled(aTaskbarTab) {
  ok(
    mockNativeShellService.createWindowsIcon.calledOnce,
    `Icon creation should have been called.`
  );
  ok(
    mockNativeShellService.createShortcut.calledOnce,
    `Shortcut creation should have been called.`
  );
  ok(
    mockNativeShellService.pinShortcutToTaskbar.calledOnce,
    `Pin to taskbar should have been called.`
  );
  Assert.equal(
    mockNativeShellService.pinShortcutToTaskbar.firstCall.args[1],
    mockNativeShellService.createShortcut.firstCall.args[6],
    `The created and pinned shortcuts should be in the same folder.`
  );
  Assert.equal(
    mockNativeShellService.pinShortcutToTaskbar.firstCall.args[2],
    mockNativeShellService.createShortcut.firstCall.args[7],
    `The created and pinned shortcuts should be the same file.`
  );
  Assert.equal(
    mockNativeShellService.pinShortcutToTaskbar.firstCall.args[2],
    aTaskbarTab.shortcutRelativePath,
    `The pinned shortcut should be the saved shortcut.`
  );
}

function shellUnpinCalled() {
  ok(
    mockNativeShellService.deleteShortcut.calledOnce,
    `Unpin from taskbar should have been called.`
  );
  ok(
    mockNativeShellService.unpinShortcutFromTaskbar.calledOnce,
    `Unpin from taskbar should have been called.`
  );
}

MockRegistrar.register(
  "@mozilla.org/browser/favicon-service;1",
  mockFaviconService
);

const url = Services.io.newURI("https://www.test.com");
const userContextId = 0;

const registry = new TaskbarTabsRegistry();
const taskbarTab = registry.findOrCreateTaskbarTab(url, userContextId);

const patchedSpy = sinon.stub();
registry.on(TaskbarTabsRegistry.events.patched, patchedSpy);

add_task(async function test_pin_existing_favicon() {
  sinon.resetHistory();
  faviconThrows = false;
  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);

  ok(
    mockFaviconService.getFaviconForPage.calledOnce,
    "The favicon for the page should have attempted to be retrieved."
  );
  ok(
    defaultIconSpy.get.notCalled,
    "The default icon should not be used when a favicon exists for the page."
  );

  shellPinCalled(taskbarTab);
});

add_task(async function test_pin_missing_favicon() {
  sinon.resetHistory();
  faviconThrows = true;
  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);

  ok(
    mockFaviconService.getFaviconForPage.calledOnce,
    "The favicon for the page should have attempted to be retrieved."
  );
  ok(
    defaultIconSpy.get.called,
    "The default icon should be used when a favicon does not exist for the page."
  );

  shellPinCalled(taskbarTab);
});

add_task(async function test_pin_location() {
  sinon.resetHistory();

  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, registry);
  const spy = mockNativeShellService.createShortcut;
  ok(spy.calledOnce, "A shortcut was created");
  Assert.equal(
    spy.firstCall.args[6],
    "Programs",
    "The shortcut went into the Start Menu folder"
  );
  Assert.equal(
    spy.firstCall.args[7].split("\\", 2)[1],
    "Test.lnk",
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
  const spy = mockNativeShellService.createShortcut;
  ok(spy.calledOnce, "A shortcut was created");
  Assert.equal(
    spy.firstCall.args[6],
    "Programs",
    "The shortcut went into the Start Menu folder"
  );
  // 'Untitled' is the default selected by the MIME code, since
  // AUX is a reserved name on Windows.
  Assert.equal(
    spy.firstCall.args[7].split("\\", 2)[1],
    "Untitled.lnk",
    "The shortcut should be in a subdirectory and have a default name"
  );

  Assert.equal(
    invalidTaskbarTab.shortcutRelativePath,
    spy.firstCall.args[7],
    "Correct relative path was saved to the taskbar tab"
  );
  Assert.equal(patchedSpy.callCount, 1, "A single patched event was emitted");

  registry.removeTaskbarTab(invalidTaskbarTab);
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
