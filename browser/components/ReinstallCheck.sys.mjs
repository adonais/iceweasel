/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  WindowsRegistry: "resource://gre/modules/WindowsRegistry.sys.mjs",
});

// Reads and clears the registry value the Windows uninstaller writes
function readAndClearUninstalledValue() {
  if (AppConstants.platform != "win") {
    return false;
  }

  if (Services.prefs.getBoolPref("browser.disableResetPrompt", false)) {
    return false;
  }

  let updateChannel;
  try {
    updateChannel = ChromeUtils.importESModule(
      "resource://gre/modules/UpdateUtils.sys.mjs"
    ).UpdateUtils.UpdateChannel;
  } catch (ex) {}
  if (updateChannel) {
    let uninstalledValue = lazy.WindowsRegistry.readRegKey(
      Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
      "Software\\Mozilla\\Firefox",
      `Uninstalled-${updateChannel}`
    );
    let removalSuccessful = lazy.WindowsRegistry.removeRegKey(
      Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
      "Software\\Mozilla\\Firefox",
      `Uninstalled-${updateChannel}`
    );
    return removalSuccessful && uninstalledValue == "True";
  }
  return false;
}

export const ReinstallCheck = {
  _wasReinstalled: null,

  /**
   * @returns {boolean} whether Firefox was reinstalled since the previous run.
   */
  get wasReinstalled() {
    if (this._wasReinstalled === null) {
      this._wasReinstalled = readAndClearUninstalledValue();
    }
    return this._wasReinstalled;
  },
};
