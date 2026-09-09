/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "Registrar", () =>
  Cc["@mozilla.org/win-background-task-registrar;1"].createInstance(
    Ci.nsIWinBackgroundTaskRegistrar
  )
);

/**
 * Task generation and management for Windows MSIX (packaged) installs, using the
 * WinRT Windows.ApplicationModel.Background APIs via the Rust
 * nsIWinBackgroundTaskRegistrar component.
 *
 * Implements the API exposed in TaskScheduler.sys.mjs.
 *
 * Not intended for external use; this is in a separate module to ship the code
 * only on Windows, and to expose for testing.
 */
export const WinMSIXImpl = {
  registerTask(id, command, intervalSeconds) {
    const intervalMinutes = Math.floor(intervalSeconds / 60);
    lazy.Registrar.registerTask(id, intervalMinutes);
  },

  deleteTask(id) {
    lazy.Registrar.deleteTask(id);
  },

  deleteAllTasks() {
    lazy.Registrar.deleteAllTasks();
  },

  taskExists(id) {
    return lazy.Registrar.taskExists(id);
  },
};
