/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Classes exported here are registered as a resource that can be
 * backed up and restored in the BackupService.
 *
 * They must extend the BackupResource base class.
 */

import { AddonsBackupResource } from "moz-src:///browser/components/backup/resources/AddonsBackupResource.sys.mjs";
import { BookmarksBackupResource } from "moz-src:///browser/components/backup/resources/BookmarksBackupResource.sys.mjs";
import { CredentialsAndSecurityBackupResource } from "moz-src:///browser/components/backup/resources/CredentialsAndSecurityBackupResource.sys.mjs";
import { FormHistoryBackupResource } from "moz-src:///browser/components/backup/resources/FormHistoryBackupResource.sys.mjs";
import { MiscDataBackupResource } from "moz-src:///browser/components/backup/resources/MiscDataBackupResource.sys.mjs";
import { PlacesBackupResource } from "moz-src:///browser/components/backup/resources/PlacesBackupResource.sys.mjs";
import { PreferencesBackupResource } from "moz-src:///browser/components/backup/resources/PreferencesBackupResource.sys.mjs";
import { SessionStoreBackupResource } from "moz-src:///browser/components/backup/resources/SessionStoreBackupResource.sys.mjs";
import { SelectableProfileBackupResource } from "moz-src:///browser/components/backup/resources/SelectableProfileBackupResource.sys.mjs";
import { SiteSettingsBackupResource } from "moz-src:///browser/components/backup/resources/SiteSettingsBackupResource.sys.mjs";

export {
  AddonsBackupResource,
  BookmarksBackupResource,
  CredentialsAndSecurityBackupResource,
  FormHistoryBackupResource,
  MiscDataBackupResource,
  PlacesBackupResource,
  PreferencesBackupResource,
  SessionStoreBackupResource,
  SelectableProfileBackupResource,
  SiteSettingsBackupResource,
};
