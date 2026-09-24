// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/
"use strict";

// Tests using a client authentication certificate via a PKCS#11 module.

// Ensure that the appropriate initialization has happened.
do_get_profile();

var gPrompt = {
  QueryInterface: ChromeUtils.generateQI(["nsIPrompt"]),

  promptPassword(_dialogTitle, _text, password, _checkMsg) {
    // The first token in the test module has a blank password by default.
    password.value = "";
    return true;
  },
};

var gWindowWatcher = installWindowWatcherForProtectedAuth(gPrompt);

// Replace the UI dialog that prompts the user to pick a client certificate.
const gClientAuthDialogService = {
  set certificateNameToUse(name) {
    this._certificateNameToUse = name;
  },

  chooseCertificate(hostname, certArray, loadContext, caNames, callback) {
    for (let cert of certArray) {
      if (cert.subjectName == this._certificateNameToUse) {
        callback.certificateChosen(cert, false);
        return;
      }
    }
    callback.certificateChosen(null, false);
  },

  QueryInterface: ChromeUtils.generateQI([Ci.nsIClientAuthDialogService]),
};

MockRegistrar.register(
  "@mozilla.org/security/ClientAuthDialogService;1",
  gClientAuthDialogService
);

add_task(async function run_test() {
  let libraryFile = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
  libraryFile.append("pkcs11testmodule");
  libraryFile.append(ctypes.libraryName("pkcs11testmodule"));
  await loadPKCS11Module(libraryFile, "PKCS11 Test Module", false);

  Services.prefs.setCharPref(
    "network.dns.localDomains",
    "requireclientauth.example.com"
  );

  await asyncStartTLSTestServer("BadCertAndPinningServer", "bad_certs");
  gClientAuthDialogService.certificateNameToUse = "CN=client cert rsa";
  await asyncConnectTo("requireclientauth.example.com", PRErrorCodeSuccess);
  equal(
    gWindowWatcher.protectedAuthPromptsSeen,
    1,
    "should have seen one protected auth prompt"
  );

  gClientAuthDialogService.certificateNameToUse = "CN=client cert ecdsa";
  await asyncConnectTo("requireclientauth.example.com", PRErrorCodeSuccess);
  equal(
    gWindowWatcher.protectedAuthPromptsSeen,
    1,
    "should have still seen only one protected auth prompt"
  );
});
