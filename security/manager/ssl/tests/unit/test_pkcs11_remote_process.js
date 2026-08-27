// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/
"use strict";

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

var gWindowWatcher = installWindowWatcherForProtectedAuth(gPrompt);

// Ensure that the appropriate initialization has happened.
do_get_profile();

add_task(async function test_pkcs11_remote_process() {
  let libraryFile = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
  libraryFile.append("pkcs11testmodule");
  libraryFile.append(ctypes.libraryName("pkcs11testmodule"));
  ok(libraryFile.exists(), "The pkcs11testmodule file should exist");

  let moduleDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].getService(
    Ci.nsIPKCS11ModuleDB
  );

  await moduleDB.addModule("PKCS11 Test Module", libraryFile.path, 0, 0);

  let testModule = await findModuleByName(moduleDB, "PKCS11 Test Module");
  notEqual(testModule, null, "should be able to find test module");
  let testSlot = findSlotByName(testModule, "Test PKCS11 Slot");
  notEqual(testSlot, null, "should be able to find 'Test PKCS11 Slot'");

  equal(
    testSlot.name,
    "Test PKCS11 Slot",
    "Actual and expected name should match"
  );
  equal(
    testSlot.desc,
    "Test PKCS11 Slot",
    "Actual and expected description should match"
  );
  equal(
    testSlot.manID,
    "Test PKCS11 Manufacturer ID",
    "Actual and expected manufacturer ID should match"
  );
  equal(
    testSlot.HWVersion,
    "0.0",
    "Actual and expected hardware version should match"
  );
  equal(
    testSlot.FWVersion,
    "0.0",
    "Actual and expected firmware version should match"
  );
  equal(
    testSlot.status,
    Ci.nsIPKCS11Slot.SLOT_NOT_LOGGED_IN,
    "Actual and expected status should match"
  );
  equal(
    testSlot.tokenName,
    "Test PKCS11 Tokeñ Label",
    "Actual and expected token name should match"
  );

  let testToken = testSlot.getToken();
  ok(testToken, "should be able to get remote token from remote slot");
  ok(
    !testToken.isInternalKeyToken,
    "the remote test token is not the internal key token"
  );
  equal(
    testToken.tokenName,
    "Test PKCS11 Tokeñ Label",
    "remote test token name should be correct"
  );
  equal(
    testToken.tokenManID,
    "Test PKCS11 Manufacturer ID",
    "remote test token manufacturer ID should be correct"
  );
  equal(
    testToken.tokenHWVersion,
    "0.0",
    "remote test token hw version should be correct"
  );
  equal(
    testToken.tokenFWVersion,
    "0.0",
    "remote test token fw version should be correct"
  );
  equal(
    testToken.tokenSerialNumber,
    "0000000000000000",
    "remote test token serial number should be correct"
  );
  ok(!testToken.isLoggedIn, "remote test token should not be logged in");
  ok(
    testToken.canHavePassword,
    "remote test token should be able to have a password"
  );
  ok(testToken.hasPassword, "remote test token should have a password");

  let emptySlot = findSlotByName(testModule, "Empty PKCS11 Slot");
  notEqual(emptySlot, null, "should be able to find 'Empty PKCS11 Slot'");
  equal(emptySlot.tokenName, null, "Empty slot is empty");
  equal(
    emptySlot.status,
    Ci.nsIPKCS11Slot.SLOT_NOT_PRESENT,
    "Actual and expected status should match"
  );
  throws(
    () => emptySlot.getToken(),
    /NS_ERROR_NOT_AVAILABLE/,
    "Attempting to get a token when it isn't present should throw."
  );

  // There's not much to test here in terms of resetting a token, but this
  // should at least succeed without crashing or raising exceptions.
  await testToken.reset();

  await testToken.changePassword("", "password");
  ok(
    testToken.isLoggedIn,
    "changing password should cause the remote token to be logged in"
  );
  await testToken.logout();
  ok(
    !testToken.isLoggedIn,
    "logging out should cause the remote token to be logged out"
  );
  gPrompt.passwordToTry = "password";
  await testToken.login();
  ok(
    testToken.isLoggedIn,
    "logging in should cause the remote token to be logged in"
  );

  let threw = false;
  try {
    await testToken.changePassword("wrongpassword", "somethingelse");
  } catch (e) {
    equal(
      e.result,
      getXPCOMStatusFromNSS(SEC_ERROR_BAD_PASSWORD),
      "should get bad password error"
    );
    threw = true;
  }
  ok(
    threw,
    "attempting to change the password with an incorrect password should throw"
  );

  let protectedAuthSlot = findSlotByName(testModule, "Test PKCS11 Slot 二");
  notEqual(
    protectedAuthSlot,
    null,
    "should be able to find 'Test PKCS11 Slot 二'"
  );
  let protectedAuthToken = protectedAuthSlot.getToken();
  notEqual(
    protectedAuthToken,
    null,
    "should be able to get token from protected auth slot"
  );
  ok(
    !protectedAuthToken.isLoggedIn,
    "initially, the protected auth token should not be logged in"
  );
  await protectedAuthToken.login();
  ok(
    protectedAuthToken.isLoggedIn,
    "logging in should cause the protected auth token to be logged in"
  );
  equal(
    gWindowWatcher.protectedAuthPromptsSeen,
    1,
    "should have seen one protected auth prompt"
  );

  await moduleDB.deleteModule("PKCS11 Test Module");
  testModule = await findModuleByName(moduleDB, "PKCS11 Test Module");
  equal(
    testModule,
    null,
    "should not be able to find test module after unloading it"
  );

  // Ensure that listing the remote modules also lists modules loaded by
  // default in the main process (namely, the internal NSS modules).
  let internalModule = await findModuleByName(
    moduleDB,
    "NSS Internal PKCS #11 Module"
  );
  notEqual(internalModule, null, "internal module should be listed");
  let internalKeySlot = findSlotByName(
    internalModule,
    "Software Security Device"
  );
  notEqual(internalKeySlot, null, "internal key slot should be present");
  let internalKeyToken = internalKeySlot.getToken();
  notEqual(internalKeyToken, null, "should be able to get internal key token");
  ok(
    internalKeyToken.isInternalKeyToken,
    "internal key token should that it's the internal key token"
  );
});
