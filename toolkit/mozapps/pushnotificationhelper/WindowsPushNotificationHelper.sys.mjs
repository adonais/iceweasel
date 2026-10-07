/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const BINARY_NAME = "notification-helper.exe";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PushNotificationHelperRegistry:
    "resource://gre/modules/PushNotificationHelperRegistry.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    maxLogLevel: "Error",
    maxLogLevelPref: "app.backgroundNotifications.helper.loglevel",
    prefix: "PushNotificationHelper",
  })
);

/**
 * Launches the helper.
 *
 * @param {string[]} args - full argument list for the helper.
 * @returns {boolean} whether the helper was launched.
 */
function launch(args) {
  const exe = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  exe.append(BINARY_NAME);

  if (!exe.exists()) {
    lazy.log.error(`${BINARY_NAME} is not installed`);
    return false;
  }

  const process = Cc["@mozilla.org/process/util;1"].createInstance(
    Ci.nsIProcess
  );

  process.init(exe);
  process.startHidden = true;
  process.noShell = true;
  process.runw(false, args, args.length);

  return true;
}

/**
 * Windows implementation of the push notification helper. Whether a helper
 * should be running is decided by PushNotificationHelper.sys.mjs; this module
 * only knows how to act on that decision.
 */
export const WindowsPushNotificationHelper = {
  /**
   * Names the profile a helper serves. A helper is per profile, so this is the
   * whole of its identity.
   *
   * @returns {string[]} arguments naming the profile.
   */
  get profileArgs() {
    return ["--profile", Services.dirsvc.get("ProfD", Ci.nsIFile).path];
  },

  /**
   * Starts the push notification helper for the current running profile and
   * records it in the registry.
   */
  start() {
    if (launch(this.profileArgs)) {
      lazy.PushNotificationHelperRegistry.add();
    }
    lazy.PushNotificationHelperRegistry.prune();
  },

  /**
   * Asks this profile's helper to exit, including one left behind by an
   * earlier Firefox session, and removes it from the registry. Does nothing
   * when no helper was recorded, so a profile that never had one does not
   * launch a --stop process on every startup.
   */
  stop() {
    if (lazy.PushNotificationHelperRegistry.has()) {
      launch(["--stop", ...this.profileArgs]);
      lazy.PushNotificationHelperRegistry.remove();
    }
    lazy.PushNotificationHelperRegistry.prune();
  },
};
