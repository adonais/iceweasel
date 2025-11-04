/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ERRORS } = ChromeUtils.importESModule(
  "chrome://browser/content/backup/backup-constants.mjs"
);

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
  let bs = getAndMaybeInitBackupService();
  bs.resetLastBackupInternalState();

  registerCleanupFunction(async () => {
    MockFilePicker.cleanup();
  });
});

/**
 * Tests that the a backup file can be restored from the settings page.
 */
add_task(async function test_restore_from_backup() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
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

    let quitObservedPromise = TestUtils.topicObserved(
      "quit-application-requested",
      subject => {
        let cancelQuit = subject.QueryInterface(Ci.nsISupportsPRBool);
        cancelQuit.data = true;
        return true;
      }
    );

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
      "BackupUI:GetBackupFileInfo"
    );

    restoreFromBackup.chooseButtonEl.click();

    await filePickerShownPromise;
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileToRestore: mockBackupFilePath,
    };
    await restoreFromBackup.updateComplete;

    // Dispatch the event that would normally be sent by BackupUIChild
    // after a file is selected
    restoreFromBackup.dispatchEvent(
      new CustomEvent("BackupUI:SelectNewFilepickerPath", {
        bubbles: true,
        composed: true,
        detail: {
          path: mockBackupFilePath,
          filename: mockBackupFile.leafName,
          iconURL: "",
        },
      })
    );

    await infoPromise;
    // Set mock file info
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileInfo: {
        date: new Date(),
        deviceName: "test-device",
        isEncrypted: true,
      },
    };
    await restoreFromBackup.updateComplete;

    // Set password for file
    restoreFromBackup.passwordInput.value = "h-*@Vfge3_hGxdpwqr@w";

    let restorePromise = BrowserTestUtils.waitForEvent(
      window,
      "BackupUI:RestoreFromBackupFile"
    );

    Assert.ok(
      restoreFromBackup.confirmButtonEl,
      "Confirm button should be found"
    );
    Assert.ok(
      !restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should not be disabled"
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

    await quitObservedPromise;

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
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    let sandbox = sinon.createSandbox();
    let bs = getAndMaybeInitBackupService();

    let { promise: recoverPromise, resolve: recoverResolve } =
      Promise.withResolvers();
    let recoverFromBackupArchiveStub = sandbox
      .stub(bs, "recoverFromBackupArchive")
      .returns(recoverPromise);

    let quitObservedPromise = TestUtils.topicObserved(
      "quit-application-requested",
      subject => {
        let cancelQuit = subject.QueryInterface(Ci.nsISupportsPRBool);
        cancelQuit.data = true;
        return true;
      }
    );

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

    Assert.equal(
      restoreFromBackup.filePicker.tagName.toLowerCase(),
      "input",
      "File picker should be an input when aboutWelcomeEmbedded is false"
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

    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileToRestore: mockBackupFilePath,
    };
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
      "BackupUI:RestoreFromBackupFile"
    );

    restoreFromBackup.confirmButtonEl.click();
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      recoveryInProgress: true,
    };
    // Re-render since we've manually changed the component's state
    await restoreFromBackup.requestUpdate();

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

    await quitObservedPromise;

    sandbox.restore();
  });
});

/**
 * Tests that the restore component uses a textarea when aboutWelcomeEmbedded is true
 * as well as the associated functionality for said textarea
 */
add_task(
  async function test_restore_from_backup_aboutwelcome_embedded_textarea() {
    await BrowserTestUtils.withNewTab(
      "about:preferences#sync",
      async browser => {
        let sandbox = sinon.createSandbox();
        let settings = browser.contentDocument.querySelector("backup-settings");
        await settings.updateComplete;

        Assert.ok(
          settings.restoreFromBackupButtonEl,
          "Restore button should exist"
        );

        settings.restoreFromBackupButtonEl.click();
        await settings.updateComplete;
        let restoreFromBackup = settings.restoreFromBackupEl;
        Assert.ok(restoreFromBackup, "restore-from-backup should be found");

        // When aboutWelcomeEmbedded is false, the file picker should be an input
        Assert.equal(
          restoreFromBackup.filePicker.tagName.toLowerCase(),
          "input",
          "File picker should be an input when aboutWelcomeEmbedded is false"
        );

        restoreFromBackup.aboutWelcomeEmbedded = true;
        await restoreFromBackup.updateComplete;
        let resizeTextareaSpy = sandbox.spy(
          restoreFromBackup,
          "resizeTextarea"
        );

        const textarea = restoreFromBackup.shadowRoot.querySelector(
          "#backup-filepicker-input"
        );

        Assert.ok(
          textarea,
          "textarea should be present after setting aboutWelcomeEmbedded to true"
        );
        Assert.equal(
          textarea.tagName.toLowerCase(),
          "textarea",
          "File picker should be a textarea when aboutWelcomeEmbedded is true"
        );
        Assert.equal(
          textarea.getAttribute("rows"),
          "1",
          "Textarea should have rows=1"
        );

        // Test resize functionality when content changes
        const initialHeight = textarea.style.height;
        Assert.ok(initialHeight, "Textarea should have an initial height set");

        const longPath =
          "/a/very/long/path/to/a/backup/file/that/would/wrap/multiple/lines.html";
        textarea.value = longPath;
        restoreFromBackup.resizeTextarea();

        const newHeight = textarea.style.height;
        Assert.notEqual(
          newHeight,
          initialHeight,
          "Textarea height should change when content is added"
        );

        // The text area resize function should also be called
        // when the resize event occurs on the window
        window.dispatchEvent(new Event("resize"));

        Assert.ok(
          resizeTextareaSpy.calledOnce,
          "resizeTextarea should be called when window resize event is fired"
        );

        sandbox.restore();
      }
    );
  }
);

/**
 * Tests that the backup file info is displayed when backupFileInfo is present
 */
add_task(async function test_restore_backup_file_info_display() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    let settings = browser.contentDocument.querySelector("backup-settings");
    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupButtonEl,
      "Restore button should exist"
    );

    settings.restoreFromBackupButtonEl.click();
    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;
    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    // Initially, backup file info should not be displayed underneath the input
    let fileInfoSpan = restoreFromBackup.shadowRoot.querySelector(
      "#restore-from-backup-backup-found-info"
    );
    Assert.ok(
      !fileInfoSpan,
      "Backup file info should not be displayed when backupFileInfo is null"
    );

    // Set backup file info with device name and date
    const mockDate = new Date("2025-10-07T21:27:56.844Z");
    const mockDeviceName = "test-device";
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileInfo: {
        date: mockDate,
        deviceName: mockDeviceName,
        isEncrypted: false,
      },
    };
    await restoreFromBackup.updateComplete;

    fileInfoSpan = restoreFromBackup.shadowRoot.querySelector(
      "#restore-from-backup-backup-found-info"
    );
    Assert.ok(
      fileInfoSpan,
      "Backup file info should be displayed when backupFileInfo is set"
    );

    Assert.equal(
      fileInfoSpan.getAttribute("data-l10n-id"),
      "backup-file-creation-date-and-device",
      "Should have the correct l10n id"
    );

    const l10nArgs = JSON.parse(fileInfoSpan.getAttribute("data-l10n-args"));
    Assert.equal(
      l10nArgs.machineName,
      mockDeviceName,
      "l10n args should contain the correct device name"
    );
    Assert.equal(
      l10nArgs.date,
      mockDate.getTime(),
      "l10n args should contain the correct date"
    );
  });
});

/**
 * Helper function to test that a support link has the appropriate attributes
 *
 * @param {Element} link - The support link element to test
 * @param {string} linkName - The name of the link to test
 */

function assertNonEmbeddedSupportLink(link, linkName) {
  Assert.ok(link, `${linkName} should be present`);
  Assert.equal(
    link.getAttribute("is"),
    "moz-support-link",
    `${linkName} should use moz-support-link when not embedded`
  );
  Assert.equal(
    link.getAttribute("support-page"),
    "firefox-backup",
    `${linkName} should have support-page attribute`
  );
  Assert.ok(
    !link.href.includes("utm_source"),
    `${linkName} should not have UTM params when not embedded`
  );
}

/**
 * Tests that support links use moz-support-link when aboutWelcomeEmbedded is falsy
 */
add_task(async function test_support_links_non_embedded() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    let settings = browser.contentDocument.querySelector("backup-settings");
    await settings.updateComplete;

    settings.restoreFromBackupButtonEl.click();
    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;
    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    Assert.ok(
      !restoreFromBackup.aboutWelcomeEmbedded,
      "aboutWelcomeEmbedded should be falsy"
    );

    // Test the 'no backup file' link
    let noBackupFileLink = restoreFromBackup.shadowRoot.querySelector(
      "#restore-from-backup-no-backup-file-link"
    );
    assertNonEmbeddedSupportLink(noBackupFileLink, "'No backup file' link");

    // Test the description link
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileInfo: {
        date: new Date(),
        deviceName: "test-device",
        isEncrypted: false,
      },
    };
    await restoreFromBackup.updateComplete;

    let descriptionLink = restoreFromBackup.shadowRoot.querySelector(
      "#restore-from-backup-learn-more-link"
    );
    assertNonEmbeddedSupportLink(descriptionLink, "Description link");

    // Test the incorrect password link
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileInfo: {
        date: new Date(),
        deviceName: "test-device",
        isEncrypted: true,
      },
      recoveryErrorCode: ERRORS.UNAUTHORIZED,
    };
    await restoreFromBackup.updateComplete;

    let passwordErrorLink = restoreFromBackup.shadowRoot.querySelector(
      "#backup-incorrect-password-support-link"
    );
    assertNonEmbeddedSupportLink(passwordErrorLink, "Password error link");
  });
});
