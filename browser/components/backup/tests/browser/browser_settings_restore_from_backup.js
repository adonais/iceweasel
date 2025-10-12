/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let TEST_PROFILE_PATH;

add_setup(async () => {
  MockFilePicker.init(window.browsingContext);
  TEST_PROFILE_PATH = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testBackup"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.backup.location", TEST_PROFILE_PATH]],
  });

  // It's possible for other tests to change the internal state of the BackupService
  // which can lead to complications with the auto detection behaviour. Let's just reset
  // these states before testing
  let bs = BackupService.get();
  bs.resetLastBackupInternalState();

  registerCleanupFunction(async () => {
    MockFilePicker.cleanup();
  });
});

/**
 * Tests that the a backup file can be restored from the settings page.
 */
add_task(async function test_restore_from_backup() {
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    let sandbox = sinon.createSandbox();
    let recoverFromBackupArchiveStub = sandbox
      .stub(BackupService.prototype, "recoverFromBackupArchive")
      .resolves();

    const mockBackupFilePath = await IOUtils.createUniqueFile(
      TEST_PROFILE_PATH,
      "backup.html"
    );

    const mockBackupFile = Cc["@mozilla.org/file/local;1"].createInstance(
      Ci.nsIFile
    );
    mockBackupFile.initWithPath(mockBackupFilePath);

    let filePickerShownPromise = new Promise(resolve => {
      MockFilePicker.showCallback = async () => {
        Assert.ok(true, "Filepicker shown");
        MockFilePicker.setFiles([mockBackupFile]);
        resolve();
      };
    });
    MockFilePicker.returnValue = MockFilePicker.returnOK;

    let settings = browser.contentDocument.querySelector("backup-settings");

    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupButtonEl,
      "Button to restore backups should be found"
    );

    settings.restoreFromBackupButtonEl.click();

    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;

    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    let infoPromise = BrowserTestUtils.waitForEvent(
      window,
      "getBackupFileInfo"
    );

    restoreFromBackup.chooseButtonEl.click();
    await filePickerShownPromise;

    await infoPromise;
    // Set mock file info
    restoreFromBackup.backupFileInfo = {
      date: new Date(),
      isEncrypted: true,
    };
    await restoreFromBackup.updateComplete;

    // Set password for file
    restoreFromBackup.passwordInput.value = "h-*@Vfge3_hGxdpwqr@w";

    let restorePromise = BrowserTestUtils.waitForEvent(
      window,
      "restoreFromBackupConfirm"
    );

    Assert.ok(
      restoreFromBackup.confirmButtonEl,
      "Confirm button should be found"
    );

    await restoreFromBackup.updateComplete;
    restoreFromBackup.confirmButtonEl.click();

    await restorePromise.then(e => {
      let mockEvent = {
        backupFile: mockBackupFile.path,
        backupPassword: "h-*@Vfge3_hGxdpwqr@w",
      };
      Assert.deepEqual(
        e.detail,
        mockEvent,
        "Event should contain the file and password"
      );
    });

    Assert.ok(
      recoverFromBackupArchiveStub.calledOnce,
      "BackupService was called to start a recovery from a backup archive."
    );

    sandbox.restore();
  });
});

/**
 * Tests that the dialog stays open while restoring from the settings page.
 */
add_task(async function test_restore_in_progress() {
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    let sandbox = sinon.createSandbox();
    let bs = BackupService.get();

    let { promise: recoverPromise, resolve: recoverResolve } =
      Promise.withResolvers();
    let recoverFromBackupArchiveStub = sandbox
      .stub(bs, "recoverFromBackupArchive")
      .returns(recoverPromise);

    let settings = browser.contentDocument.querySelector("backup-settings");

    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupButtonEl,
      "Button to restore backups should be found"
    );

    settings.restoreFromBackupButtonEl.click();

    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;

    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    Assert.equal(
      restoreFromBackup.filePicker.value,
      "",
      "File picker has no value assigned automatically"
    );

    // There is a backup file, but it is not a valid one
    // we don't automatically pick it
    Assert.ok(
      restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should be disabled."
    );

    const mockBackupFilePath = await IOUtils.createUniqueFile(
      PathUtils.tempDir,
      "backup.html"
    );

    // Set mock file
    restoreFromBackup.backupFileToRestore = mockBackupFilePath;
    await restoreFromBackup.updateComplete;

    Assert.ok(
      !restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should not be disabled."
    );
    Assert.equal(
      restoreFromBackup.confirmButtonEl.getAttribute("data-l10n-id"),
      "restore-from-backup-confirm-button",
      "Confirm button should show confirm message."
    );

    let restorePromise = BrowserTestUtils.waitForEvent(
      window,
      "restoreFromBackupConfirm"
    );

    restoreFromBackup.confirmButtonEl.click();
    let currentState = bs.state;
    let recoveryInProgressState = Object.assign(
      { recoveryInProgress: true },
      currentState
    );
    sandbox.stub(BackupService.prototype, "state").get(() => {
      return recoveryInProgressState;
    });
    bs.stateUpdate();

    await restorePromise;

    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupDialogEl.open,
      "Restore dialog should still be open."
    );

    Assert.ok(
      restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should be disabled."
    );

    Assert.equal(
      restoreFromBackup.confirmButtonEl.getAttribute("data-l10n-id"),
      "restore-from-backup-restoring-button",
      "Confirm button should show restoring message."
    );

    Assert.ok(
      recoverFromBackupArchiveStub.calledOnce,
      "BackupService was called to start a recovery from a backup archive."
    );

    // Now cause recovery to resolve.
    recoverResolve();
    // Wait a tick of the event loop to let the BackupUIParent respond to
    // the promise resolution, and to send its message to the BackupUIChild.
    await new Promise(resolve => SimpleTest.executeSoon(resolve));
    // Wait a second tick to let the BackupUIChild respond to the message
    // from BackupUIParent.
    await new Promise(resolve => SimpleTest.executeSoon(resolve));

    await settings.updateComplete;

    Assert.ok(
      !settings.restoreFromBackupDialogEl.open,
      "Restore dialog should now be closed."
    );

    sandbox.restore();
  });
});

/**
 * Tests the backup autodetect feature for the file picker
 */
add_task(async function test_finding_a_valid_backup() {
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    let sandbox = sinon.createSandbox();
    let bs = BackupService.get();

    let { archivePath } = await bs.createBackup();

    Assert.stringContains(
      archivePath,
      TEST_PROFILE_PATH,
      "archive is in our test dir"
    );

    let settings = browser.contentDocument.querySelector("backup-settings");

    // To test the behaviour of this function, we want to reset the last backup states
    // so we can see if the function can find a valid backup from the default directory
    bs.resetLastBackupInternalState();

    await settings.updateComplete;

    registerCleanupFunction(async () => {
      // we'll make sure to clean this whole dir up after the test
      await IOUtils.remove(TEST_PROFILE_PATH, { recursive: true });
    });

    settings.restoreFromBackupButtonEl.click();
    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;
    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    let infoPromise = BrowserTestUtils.waitForEvent(
      window,
      "getBackupFileInfo"
    );
    let infoEvent = await infoPromise;

    // it should be asking about the same path we created.
    Assert.equal(
      infoEvent.detail.backupFile,
      archivePath,
      "Component asked for info for the detected archive"
    );

    await restoreFromBackup.updateComplete;

    Assert.ok(
      settings.restoreFromBackupDialogEl.open,
      "Restore dialog should be open."
    );

    Assert.equal(
      restoreFromBackup.backupFileToRestore,
      archivePath,
      "backupFileToRestore was updated to the detected archive path"
    );

    Assert.equal(
      restoreFromBackup.filePicker.value,
      archivePath,
      "Text input reflects the detected archive path"
    );

    sandbox.restore();
  });
});
