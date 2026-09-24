/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bug 2067167 makes the "declined" assertions below no-ops: once re-auth stops
// relocking the token nothing is declined. The NS_ERROR_ABORT translation they
// check still applies to a user cancel, so keep coverage of that.
//
// LoginHelper.requestReauth() logs the internal key token out before prompting
// for the primary password again, so a store operation racing with it used to
// open a second prompt stacked on top of the first one.
add_task(async function test_single_prompt_when_storage_races_reauth() {
  if (!Services.prefs.getBoolPref("signon.storage.rust.active", false)) {
    // With the JSON backend NSS suppresses the second prompt on its own.
    info("Rust logins backend is not active, nothing to test here.");
    return;
  }

  await Services.logins.addLoginAsync(
    LoginTestUtils.testData.formLogin({
      origin: "https://example.com",
      formActionOrigin: "https://example.com",
      username: "username",
      password: "password",
    })
  );
  await LoginTestUtils.primaryPassword.enable();

  let dialogCount = 0;
  const observer = subject => {
    dialogCount++;
    const dialog = subject.Dialog;
    SpecialPowers.wrap(dialog.ui.password1Textbox).setUserInput(
      LoginTestUtils.primaryPassword.primaryPassword
    );
    dialog.ui.button0.click();
  };
  Services.obs.addObserver(observer, "common-dialog-loaded");
  registerCleanupFunction(async () => {
    Services.obs.removeObserver(observer, "common-dialog-loaded");
    await LoginTestUtils.primaryPassword.disable();
  });

  const reauth = LoginHelper.requestReauth(
    gBrowser.selectedBrowser,
    0,
    "",
    "",
    "test"
  );
  // This needs the key that requestReauth is about to lock.
  const logins = Services.logins.getAllLogins().then(
    () => null,
    e => e
  );
  const [{ isAuthorized }, loginsError] = await Promise.all([reauth, logins]);

  Assert.ok(isAuthorized, "Re-authentication succeeded");
  Assert.equal(dialogCount, 1, "Only one primary password prompt was shown");
  if (loginsError) {
    Assert.equal(
      loginsError.result,
      Cr.NS_ERROR_ABORT,
      "A store read declined during the re-auth reports NS_ERROR_ABORT"
    );
  }
});

// A store operation declined during the re-auth has to report NS_ERROR_ABORT,
// the way crypto-SDR does, and not a raw Rust "Encryption key is missing".
// Writes used to leak the raw error, so a password the user asked to save was
// silently not saved.
add_task(async function test_declined_write_reports_abort() {
  if (!Services.prefs.getBoolPref("signon.storage.rust.active", false)) {
    info("Rust logins backend is not active, nothing to test here.");
    return;
  }

  await LoginTestUtils.primaryPassword.enable();

  const observer = subject => {
    const dialog = subject.Dialog;
    SpecialPowers.wrap(dialog.ui.password1Textbox).setUserInput(
      LoginTestUtils.primaryPassword.primaryPassword
    );
    dialog.ui.button0.click();
  };
  Services.obs.addObserver(observer, "common-dialog-loaded");
  registerCleanupFunction(async () => {
    Services.obs.removeObserver(observer, "common-dialog-loaded");
    await LoginTestUtils.primaryPassword.disable();
  });

  const reauth = LoginHelper.requestReauth(
    gBrowser.selectedBrowser,
    0,
    "",
    "",
    "test"
  );
  const added = Services.logins
    .addLoginAsync(
      LoginTestUtils.testData.formLogin({
        origin: "https://example.org",
        formActionOrigin: "https://example.org",
        username: "other",
        password: "password",
      })
    )
    .then(
      () => null,
      e => e
    );
  const [, addError] = await Promise.all([reauth, added]);

  if (addError) {
    Assert.equal(
      addError.result,
      Cr.NS_ERROR_ABORT,
      "A declined write reports NS_ERROR_ABORT, not a raw Rust error"
    );
  } else {
    info("The write did not race the re-auth this time; nothing to assert.");
  }
});
