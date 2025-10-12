/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BackupResource,
  bytesToFuzzyKilobytes,
} from "resource:///modules/backup/BackupResource.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
});

/**
 * Class representing Session store related files within a user profile.
 */
export class SessionStoreBackupResource extends BackupResource {
  static get key() {
    return "sessionstore";
  }

  static get requiresEncryption() {
    // Session store data does not require encryption, but if encryption is
    // disabled, then session cookies will be cleared from the backup before
    // writing it to the disk.
    return false;
  }

  async backup(
    stagingPath,
    profilePath = PathUtils.profileDir,
    _isEncrypting = false
  ) {
    let sessionStoreState = lazy.SessionStore.getCurrentState(true);
    let sessionStorePath = PathUtils.join(stagingPath, "sessionstore.jsonlz4");

    // Preserving session cookies in a backup used on a different machine
    // may break behavior for websites. So we leave them out of the backup.

    sessionStoreState.cookies = [];

    await IOUtils.writeJSON(sessionStorePath, sessionStoreState, {
      compress: true,
    });
    await BackupResource.copyFiles(profilePath, stagingPath, [
      "sessionstore-backups",
    ]);

    return null;
  }

  async recover(_manifestEntry, recoveryPath, destProfilePath) {
    await BackupResource.copyFiles(recoveryPath, destProfilePath, [
      "sessionstore.jsonlz4",
      "sessionstore-backups",
    ]);

    return null;
  }

  async measure(profilePath = PathUtils.profileDir) {
    // Get the current state of the session store JSON and
    // measure it's uncompressed size.
    let sessionStoreJson = lazy.SessionStore.getCurrentState(true);
    let sessionStoreSize = new TextEncoder().encode(
      JSON.stringify(sessionStoreJson)
    ).byteLength;
    let sessionStoreNearestTenKb = bytesToFuzzyKilobytes(sessionStoreSize);

    Glean.browserBackup.sessionStoreSize.set(sessionStoreNearestTenKb);

    let sessionStoreBackupsDirectoryPath = PathUtils.join(
      profilePath,
      "sessionstore-backups"
    );
    let sessionStoreBackupsDirectorySize =
      await BackupResource.getDirectorySize(sessionStoreBackupsDirectoryPath);

    Glean.browserBackup.sessionStoreBackupsDirectorySize.set(
      sessionStoreBackupsDirectorySize
    );
  }
}
