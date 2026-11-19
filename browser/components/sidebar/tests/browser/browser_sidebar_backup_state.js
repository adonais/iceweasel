/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SidebarManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sidebar/SidebarManager.sys.mjs"
);

const BACKUP_STATE_PREF = "sidebar.backupState";

add_task(async function test_invalid_backup_state() {
  const defaultValue = Services.prefs
    .getDefaultBranch("")
    .getStringPref(BACKUP_STATE_PREF);
  const originalState = SidebarController.getUIState();

  for (const value of ["null", "", "{invalid", "[]", "42", '"string"']) {
    info(`Testing backup state pref value: ${JSON.stringify(value)}`);
    Services.prefs.setStringPref(BACKUP_STATE_PREF, value);

    const state = SidebarManager.getBackupState();
    Assert.deepEqual(state, {}, "Invalid backup state yields an empty object");
    Assert.ok(
      !Services.prefs.prefHasUserValue(BACKUP_STATE_PREF),
      "Invalid backup state pref is reset"
    );
    Assert.equal(
      Services.prefs.getStringPref(BACKUP_STATE_PREF),
      defaultValue,
      "Backup state pref is back to its default value"
    );

    // This is what startDelayedLoad does with the backup state.
    await SidebarController.updateUIState(state);
    Assert.ok(true, "updateUIState handled the backup state without throwing");
  }

  Services.prefs.setStringPref(BACKUP_STATE_PREF, '{"command":""}');
  Assert.deepEqual(
    SidebarManager.getBackupState(),
    { command: "" },
    "Valid backup state is returned as is"
  );

  Services.prefs.clearUserPref(BACKUP_STATE_PREF);
  await SidebarController.updateUIState(originalState);
});
