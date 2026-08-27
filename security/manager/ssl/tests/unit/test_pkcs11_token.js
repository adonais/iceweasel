// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/
"use strict";

// Tests the methods and attributes for interfacing with a PKCS #11 token, using
// the internal key token.
// We don't use either of the test tokens in the test PKCS #11 module because:
//   1. Test token 1 cyclically inserts and removes itself in a tight loop.
//      Using token 1 would complicate the test and introduce intermittent
//      failures.
//   2. Neither test token implements login or password related functionality.
//      We want to test such functionality.
//   3. Using the internal token lets us actually test the internal token works
//      as expected.

// Ensure that the appropriate initialization has happened.
do_get_profile();

var gPrompt = {
  QueryInterface: ChromeUtils.generateQI(["nsIPrompt"]),

  passwordToTry: "",
  numPrompts: 0,

  // This intentionally does not use arrow function syntax to avoid an issue
  // where in the context of the arrow function, |this != gPrompt| due to
  // how objects get wrapped when going across xpcom boundaries.
  promptPassword(dialogTitle, text, password, checkMsg) {
    this.numPrompts++;
    if (this.numPrompts > 1) {
      // don't keep retrying a bad password
      return false;
    }
    equal(
      text,
      "Please authenticate to the security device (Test PKCS11 Tokeñ Label).",
      "password prompt text should be as expected"
    );
    equal(checkMsg, null, "checkMsg should be null");
    ok(this.passwordToTry, "passwordToTry should be non-null");
    password.value = this.passwordToTry;
    return true;
  },
};

const gPromptFactory = {
  QueryInterface: ChromeUtils.generateQI(["nsIPromptFactory"]),
  getPrompt: () => gPrompt,
};

function checkBasicAttributes(token) {
  let bundle = Services.strings.createBundle(
    "chrome://pipnss/locale/pipnss.properties"
  );

  let expectedTokenName = bundle.GetStringFromName("PrivateTokenDescription");
  equal(
    token.tokenName,
    expectedTokenName,
    "Actual and expected name should match"
  );
  equal(
    token.tokenManID,
    bundle.GetStringFromName("ManufacturerID"),
    "Actual and expected manufacturer ID should match"
  );
  equal(
    token.tokenHWVersion,
    "0.0",
    "Actual and expected hardware version should match"
  );
  equal(
    token.tokenFWVersion,
    "0.0",
    "Actual and expected firmware version should match"
  );
  equal(
    token.tokenSerialNumber,
    "0000000000000000",
    "Actual and expected serial number should match"
  );
}

add_task(async function test_internal_token() {
  let token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
  notEqual(token, null, "The internal token should be present");
  ok(
    token.isInternalKeyToken,
    "The internal token should be represented as such"
  );

  checkBasicAttributes(token);

  ok(!token.isLoggedIn, "Token should not be logged into yet");
  // Test that attempting to log out even when the token was not logged into
  // does not result in an error.
  await token.logout();
  ok(!token.isLoggedIn, "Token should still not be logged into");
  ok(
    !token.hasPassword,
    "Token should not have a password before it has been set"
  );

  let initialPW = "foo 1234567890`~!@#$%^&*()-_=+{[}]|\\:;'\",<.>/? 一二三";
  await token.changePassword("", initialPW);
  await token.login();
  ok(token.isLoggedIn, "Token should now be logged into");

  await token.logout();
  ok(!token.isLoggedIn, "Token should be logged out after calling logout()");

  ok(
    token.canHavePassword,
    "The internal token should always be able to have a password"
  );
});

add_task(async function test_external_token() {
  MockRegistrar.register("@mozilla.org/prompter;1", gPromptFactory);

  let libraryFile = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
  libraryFile.append("pkcs11testmodule");
  libraryFile.append(ctypes.libraryName("pkcs11testmodule"));
  await loadPKCS11Module(libraryFile, "PKCS11 Test Module", false);

  let moduleDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].getService(
    Ci.nsIPKCS11ModuleDB
  );
  let testModule = await findModuleByName(moduleDB, "PKCS11 Test Module");
  notEqual(testModule, null, "should be able to find test module");
  let testSlot = findSlotByName(testModule, "Test PKCS11 Slot");
  notEqual(testSlot, null, "should be able to find 'Test PKCS11 Slot'");
  let testToken = testSlot.getToken();
  notEqual(testToken, null, "should be able to get token from slot");
  await testToken.logout();

  let threw = false;
  try {
    await testToken.changePassword("wrong password", "password");
  } catch (e) {
    threw = true;
  }
  ok(
    threw,
    "trying to change the password with the wrong password should fail"
  );

  await testToken.changePassword("", "password");
  ok(
    testToken.isLoggedIn,
    "changing the password successfully logs the token in"
  );
  await testToken.logout();

  gPrompt.passwordToTry = "wrong password";
  threw = false;
  try {
    await testToken.login();
  } catch (e) {
    threw = true;
  }
  ok(threw, "trying to log in with the wrong password should fail");

  gPrompt.numPrompts = 0;
  gPrompt.passwordToTry = "password";
  await testToken.login();
  ok(testToken.isLoggedIn, "should have logged in successfully");
});
