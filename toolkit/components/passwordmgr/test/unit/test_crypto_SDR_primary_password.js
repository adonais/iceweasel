/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 *
 * Tests the primary password prompt telemetry of the SDR crypto used by the
 * JSON storage back-end. NSS puts the dialog up itself, so the prompt is
 * mocked at the nsIPrompt level.
 */

"use strict";

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

// Fetched in the setup, because instantiating them before the head file has
// set up the profile would initialize NSS without a key database.
let cryptoSDR;
let token;

const mockPrompter = {
  // The password to fill in, or null to dismiss the dialog instead.
  passwordToTry: null,
  numPrompts: 0,

  // Deliberately not an arrow function: `this` would not be the prompter when
  // called across the XPCOM boundary.
  promptPassword(dialogTitle, text, password) {
    this.numPrompts++;
    if (this.passwordToTry == null) {
      return false;
    }
    password.value = this.passwordToTry;
    return true;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIPrompt"]),
};

// PSM asks the window watcher for an nsIPrompt to call promptPassword on.
const mockWindowWatcher = {
  getNewPrompter: () => mockPrompter,
  QueryInterface: ChromeUtils.generateQI(["nsIWindowWatcher"]),
};

let cipherText;

function promptEvents() {
  return (Glean.pwmgr.primaryPasswordPrompt.testGetValue() ?? []).map(
    event => event.extra
  );
}

/**
 * Locks the token so that the next operation has to prompt.
 *
 * @param {?string} passwordToTry
 *        The password the prompt should answer with, or null to dismiss it.
 */
async function lockToken(passwordToTry) {
  await token.logout();
  mockPrompter.passwordToTry = passwordToTry;
  mockPrompter.numPrompts = 0;
  Services.fog.testResetFOG();
}

add_setup(async function () {
  cryptoSDR = Cc["@mozilla.org/login-manager/crypto/SDR;1"].getService(
    Ci.nsILoginManagerCrypto
  );
  token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );

  Services.fog.initializeFOG();
  await LoginTestUtils.primaryPassword.enable();
  Assert.ok(token.hasPassword, "A primary password is set");

  let cid = MockRegistrar.register(
    "@mozilla.org/embedcomp/window-watcher;1",
    mockWindowWatcher
  );

  registerCleanupFunction(async () => {
    mockPrompter.passwordToTry = LoginTestUtils.primaryPassword.primaryPassword;
    await LoginTestUtils.primaryPassword.disable();
    MockRegistrar.unregister(cid);
  });
});

add_task(async function test_encrypt_success() {
  await lockToken(LoginTestUtils.primaryPassword.primaryPassword);

  cipherText = cryptoSDR.encrypt("secret");

  Assert.equal(mockPrompter.numPrompts, 1, "The user was prompted once");
  Assert.deepEqual(
    promptEvents(),
    [{ source: "crypto_sdr", trigger: "encrypt", result: "success" }],
    "Unlocking to encrypt is recorded"
  );
});

add_task(async function test_decrypt_cancel() {
  await lockToken(null);

  Assert.throws(
    () => cryptoSDR.decrypt(cipherText),
    /NS_ERROR_ABORT/,
    "Dismissing the prompt aborts the decryption"
  );

  Assert.equal(mockPrompter.numPrompts, 1, "The user was prompted once");
  Assert.deepEqual(
    promptEvents(),
    [{ source: "crypto_sdr", trigger: "decrypt", result: "cancel" }],
    "Dismissing the prompt is recorded"
  );
});

add_task(async function test_decrypt_many_success() {
  await lockToken(LoginTestUtils.primaryPassword.primaryPassword);

  Assert.deepEqual(
    await cryptoSDR.decryptMany([cipherText]),
    ["secret"],
    "The ciphertext is decrypted after unlocking"
  );

  Assert.equal(mockPrompter.numPrompts, 1, "The user was prompted once");
  Assert.deepEqual(
    promptEvents(),
    [{ source: "crypto_sdr", trigger: "decrypt", result: "success" }],
    "Unlocking to decrypt is recorded"
  );
});

add_task(async function test_no_prompt_while_unlocked() {
  Assert.ok(token.isLoggedIn, "The token is still unlocked");
  Services.fog.testResetFOG();
  mockPrompter.numPrompts = 0;

  cryptoSDR.decrypt(cipherText);

  Assert.equal(mockPrompter.numPrompts, 0, "The user was not prompted");
  Assert.deepEqual(promptEvents(), [], "Nothing is recorded without a prompt");
});
