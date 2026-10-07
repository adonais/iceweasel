/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    maxLogLevel: "Error",
    maxLogLevelPref: "app.backgroundNotifications.helper.loglevel",
    prefix: "PushNotificationHelper",
  })
);

/**
 * The registry record of the running push notification helpers, one value per
 * helper under HKCU, shared by every install of this user. Value names are
 * "<install directory>|<profile directory>", following the shape of the
 * Default Browser Agent key. The updater reads this record to restart the
 * helpers it stops before applying an update.
 */
class PushNotificationHelperRegistryClass {
  // Separates the install directory from the profile directory in a registry
  // value name. A Windows path cannot contain it
  static #SEPARATOR = "|";

  /**
   * Names this profile's helper in the registry.
   *
   * @returns {string} the registry value name.
   */
  get valueName() {
    return (
      Services.dirsvc.get("GreBinD", Ci.nsIFile).path +
      PushNotificationHelperRegistryClass.#SEPARATOR +
      Services.dirsvc.get("ProfD", Ci.nsIFile).path
    );
  }

  /**
   * Records this profile's helper.
   */
  add() {
    try {
      const key = this.#openKey(true);
      try {
        key.writeIntValue(this.valueName, 1);
      } finally {
        key.close();
      }
    } catch (e) {
      lazy.log.error("Failed to record the helper in the registry", e);
    }
  }

  /**
   * Removes this profile's helper. Safe to call when it was never recorded.
   */
  remove() {
    try {
      const key = this.#openKey(false);
      try {
        if (key.hasValue(this.valueName)) {
          key.removeValue(this.valueName);
        }
      } finally {
        key.close();
      }
    } catch (e) {
      // The key does not exist, so there is nothing to remove
    }
  }

  /**
   * Whether this profile's helper is recorded.
   *
   * @returns {boolean} whether the entry exists.
   */
  has() {
    try {
      const key = this.#openKey(false);
      try {
        return key.hasValue(this.valueName);
      } finally {
        key.close();
      }
    } catch (e) {
      return false;
    }
  }

  /**
   * Removes the entries of this install whose profile directory no longer
   * exists, so deleted profiles do not accumulate. Entries of other installs
   * are left alone.
   */
  prune() {
    const prefix = (
      Services.dirsvc.get("GreBinD", Ci.nsIFile).path +
      PushNotificationHelperRegistryClass.#SEPARATOR
    ).toLowerCase();

    try {
      const key = this.#openKey(false);
      try {
        // Backwards, because removing a value shifts the indexes after it
        for (let i = key.valueCount - 1; i >= 0; i--) {
          const name = key.getValueName(i);
          if (!name.toLowerCase().startsWith(prefix)) {
            continue;
          }
          if (!this.#directoryExists(name.slice(prefix.length))) {
            key.removeValue(name);
          }
        }
      } finally {
        key.close();
      }
    } catch (e) {
      // The key does not exist, so there is nothing to prune
    }
  }

  get #keyPath() {
    const vendor = Services.appinfo.vendor || "Mozilla";
    return `Software\\${vendor}\\${Services.appinfo.name}\\Notification Helper`;
  }

  /**
   * Opens the registry key for this user's running helpers.
   *
   * @param {boolean} create - whether to create the key when it is missing;
   *   otherwise a missing key throws.
   * @returns {nsIWindowsRegKey} the open key. The caller closes it.
   */
  #openKey(create) {
    const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
      Ci.nsIWindowsRegKey
    );
    const mode = key.ACCESS_READ | key.ACCESS_WRITE | key.WOW64_64;

    if (create) {
      key.create(key.ROOT_KEY_CURRENT_USER, this.#keyPath, mode);
    } else {
      key.open(key.ROOT_KEY_CURRENT_USER, this.#keyPath, mode);
    }

    return key;
  }

  /**
   * Whether a directory exists. An unparseable path counts as missing.
   *
   * @param {string} path - the directory path.
   * @returns {boolean} whether it exists.
   */
  #directoryExists(path) {
    try {
      const dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      dir.initWithPath(path);
      return dir.exists();
    } catch (e) {
      return false;
    }
  }
}

export const PushNotificationHelperRegistry =
  new PushNotificationHelperRegistryClass();
