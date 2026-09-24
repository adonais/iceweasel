/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 *
 * Looking for autofill candidates for a site the user has nothing saved for
 * must not ask for the primary password: there is no candidate that would have
 * to be decrypted to be filled in.
 */

"use strict";

const FORM_URL = `https://example.org${DIRECTORY_PATH}form_basic.html`;

add_setup(async function () {
  // The login is saved for another origin than the form below, and adding it
  // initializes the storage while it is still unlocked, so that enabling the
  // primary password cannot prompt from a migration running on first use.
  await LoginTestUtils.addLogin({
    origin: "https://example.com",
    username: "user",
    password: "pass",
  });
  await LoginTestUtils.primaryPassword.enable();

  registerCleanupFunction(() => LoginTestUtils.primaryPassword.disable());
});

add_task(async function test_no_prompt_without_candidates() {
  Assert.ok(!Services.logins.isLoggedIn, "The storage is locked");

  let prompted = false;
  const observer = {
    observe(subject) {
      prompted = true;
      // Cancel, so that a prompt this test does not expect fails it instead of
      // blocking the form from ever being processed.
      subject.Dialog.ui.button1.click();
    },
  };
  Services.obs.addObserver(observer, "common-dialog-loaded");

  const formProcessed = listenForTestNotification("FormProcessed");
  await BrowserTestUtils.withNewTab(FORM_URL, async function () {
    const { data } = await formProcessed;
    Assert.equal(
      data.autofillResult,
      "no_saved_logins",
      "The form has no candidate to be filled with"
    );
    Assert.ok(!prompted, "The primary password was not prompted for");
  });

  Services.obs.removeObserver(observer, "common-dialog-loaded");
});
