/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// dom/console/tests/ is in extraMochitestTestPaths, which shadows the
// auto-detected browser-test config for browser_* files in this directory.
/* global BrowserTestUtils */

// Bug 2030481 - Console messages from system modules can leak chrome windows.
//
// A system module's console.error stores messages under a filename key.
// inner-window-destroyed only clears numeric window ID keys, so the message
// persists. If the message arguments include an object whose global is a
// chrome window, that window leaks.
//
// The fix derives the storage key from the argument's window global (like
// bug 2020070 did for nsScriptErrorWithStack), so inner-window-destroyed
// can clear it.

const HELPER_MODULE =
  "chrome://mochitests/content/browser/dom/console/tests/ConsoleStorageLeakHelper.sys.mjs";

// When a system module logs an object from a window global, the message
// should be keyed by that window's ID so inner-window-destroyed clears it.
add_task(async function test_argument_global_is_window() {
  let storage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(
    Ci.nsIConsoleAPIStorage
  );

  let win = await BrowserTestUtils.openNewBrowserWindow();
  let winId = String(win.windowGlobalChild.innerWindowId);

  win.leak = function () {
    ChromeUtils.importESModule(HELPER_MODULE).logError(
      new this.TypeError("leak test")
    );
  };
  win.leak();

  let byWindow = storage.getEvents(winId);
  ok(
    byWindow.some(e => e.level === "error"),
    "Console event stored under window ID, not module filename"
  );

  is(
    storage.getEvents(HELPER_MODULE).length,
    0,
    "No events stored under module filename key"
  );

  await BrowserTestUtils.closeWindow(win);

  is(
    storage.getEvents(winId).length,
    0,
    "Console events cleared on window destruction"
  );
});

// When a system module logs an error created inside a Sandbox whose
// prototype is a window, the message should still be keyed by that
// window's ID.
add_task(async function test_argument_global_is_sandbox() {
  let storage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(
    Ci.nsIConsoleAPIStorage
  );

  let win = await BrowserTestUtils.openNewBrowserWindow();
  let winId = String(win.windowGlobalChild.innerWindowId);

  ChromeUtils.importESModule(HELPER_MODULE).logSandboxError(win);

  let byWindow = storage.getEvents(winId);
  ok(
    byWindow.some(e => e.level === "error"),
    "Sandbox error stored under window ID"
  );

  is(
    storage.getEvents(HELPER_MODULE).length,
    0,
    "No events stored under module filename key"
  );

  await BrowserTestUtils.closeWindow(win);

  is(
    storage.getEvents(winId).length,
    0,
    "Sandbox error cleared on window destruction"
  );
});
