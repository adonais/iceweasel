// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/
"use strict";

const { PromptTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromptTestUtils.sys.mjs"
);

async function openResetPasswordDialog() {
  let win = window.openDialog("chrome://pippki/content/resetpassword.xhtml");
  return new Promise(resolve => {
    win.addEventListener(
      "load",
      function () {
        executeSoon(() => {
          resolve(win);
        });
      },
      { once: true }
    );
  });
}

add_task(async function test_cancel() {
  let token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
  ok(!token.hasPassword, "internal key token should start without password");
  await token.changePassword("", "password");
  ok(
    token.hasPassword,
    "internal key token should have password after setting it"
  );
  let win = await openResetPasswordDialog();
  // Cancel the dialog.
  win.document.getElementById("reset_password").cancelDialog();
  await BrowserTestUtils.windowClosed(win);

  await token.changePassword("password", "");
});

add_task(async function test_reset() {
  let token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
  ok(!token.hasPassword, "internal key token should start without password");
  await token.changePassword("", "password");
  ok(
    token.hasPassword,
    "internal key token should have password after setting it"
  );
  let win = await openResetPasswordDialog();
  let alertPromise = PromptTestUtils.waitForPrompt(win, {
    modalType: Services.prompt.MODAL_TYPE_WINDOW,
    promptType: "alert",
  });
  // Clicking the reset button opens up an alert prompt that says all passwords
  // have been deleted.
  win.document.getElementById("reset_password").acceptDialog();
  let alertPrompt = await alertPromise;
  await PromptTestUtils.handlePrompt(alertPrompt);

  ok(
    !token.hasPassword,
    "internal key token should not have password after resetting it"
  );

  await BrowserTestUtils.windowClosed(win);
});
