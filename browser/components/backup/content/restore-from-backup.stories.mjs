/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { html } from "lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-card.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "./restore-from-backup.mjs";
// eslint-disable-next-line import/no-unassigned-import
import { ERRORS } from "chrome://browser/content/backup/backup-constants.mjs";

window.MozXULElement.insertFTLIfNeeded("locales-preview/backupSettings.ftl");
window.MozXULElement.insertFTLIfNeeded("branding/brand.ftl");

const SELECTABLE_ERRORS = {
  "(none)": 0,
  UNAUTHORIZED: ERRORS.UNAUTHORIZED,
};

export default {
  title: "Domain-specific UI Widgets/Backup/Restore from Backup",
  component: "restore-from-backup",
  argTypes: {
    backupFileToRestore: { control: "text" },
    recoveryInProgress: { control: "boolean" },
    recoveryErrorCode: {
      options: Object.keys(SELECTABLE_ERRORS),
      mapping: SELECTABLE_ERRORS,
      control: { type: "select" },
    },
    backupFileInfo: { control: "object" },
  },
};

const Template = ({
  backupFilePath,
  backupFileToRestore,
  backupFileInfo,
  recoveryInProgress,
  recoveryErrorCode,
}) => html`
  <moz-card style="width: fit-content;">
    <restore-from-backup
      .backupFilePath=${backupFilePath}
      .backupFileToRestore=${backupFileToRestore}
      .backupFileInfo=${backupFileInfo}
      .recoveryInProgress=${recoveryInProgress}
      .recoveryErrorCode=${recoveryErrorCode}
    ></restore-from-backup>
  </moz-card>
`;

export const BackupFound = Template.bind({});
BackupFound.args = {
  backupFilePath: "/Some/User/Documents",
  backupFileToRestore: "/Some/User/Documents/Firefox Backup/backup.html",
  backupFileInfo: { date: new Date(), isEncrypted: null },
  recoveryErrorCode: 0,
};

export const EncryptedBackupFound = Template.bind({});
EncryptedBackupFound.args = {
  backupFilePath: "/Some/User/Documents",
  backupFileToRestore: "/Some/User/Documents/Firefox Backup/backup.html",
  backupFileInfo: { date: new Date(), isEncrypted: true },
  recoveryErrorCode: 0,
};

export const IncorrectPasswordError = Template.bind({});
IncorrectPasswordError.args = {
  backupFileToRestore: "/Some/User/Documents/Firefox Backup/backup.html",
  backupFileInfo: { date: new Date(), isEncrypted: true },
  recoveryErrorCode: ERRORS.UNAUTHORIZED,
};

export const RecoveryInProgress = Template.bind({});
RecoveryInProgress.args = {
  backupFilePath: "/Some/User/Documents",
  backupFileToRestore: "/Some/User/Documents/Firefox Backup/backup.html",
  backupFileInfo: { date: new Date() },
  recoveryInProgress: true,
};

export const NoBackupFound = Template.bind({});
