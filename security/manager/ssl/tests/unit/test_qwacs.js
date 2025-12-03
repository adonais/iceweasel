// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

"use strict";

do_get_profile(); // must be called before getting nsIX509CertDB
const certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
  Ci.nsIX509CertDB
);

async function verify_1_qwacs(filename, expectSuccess, extraCertNames = []) {
  let cert = constructCertFromFile(filename);
  let result = await certdb.asyncVerifyQWAC(
    Ci.nsIX509CertDB.OneQWAC,
    cert,
    "example.com",
    extraCertNames.map(filename => constructCertFromFile(filename))
  );
  equal(
    result,
    expectSuccess,
    `${filename} ${expectSuccess ? "should" : "should not"} verify as 1-QWAC`
  );
}

add_task(async function test_verify_1_qwacs() {
  Services.prefs.clearUserPref("security.qwacs.enable_test_trust_anchors");
  // By default, the QWACs test trust anchors are not used.
  await verify_1_qwacs("test_qwacs/1-qwac.pem", false);
  await verify_1_qwacs("test_qwacs/1-qwac-qevcpw.pem", false);

  Services.prefs.setBoolPref("security.qwacs.enable_test_trust_anchors", true);

  await verify_1_qwacs("test_qwacs/1-qwac.pem", true);
  await verify_1_qwacs("test_qwacs/1-qwac-qevcpw.pem", true);

  await verify_1_qwacs("test_qwacs/1-qwac-other-optional-qcs.pem", true);

  // One or more intermediates may be necessary for path building.
  await verify_1_qwacs("test_qwacs/1-qwac-via-intermediate.pem", false);
  await verify_1_qwacs("test_qwacs/1-qwac-via-intermediate.pem", true, [
    "test_qwacs/test-int.pem",
  ]);

  await verify_1_qwacs("test_qwacs/empty-qc-type-statement.pem", false);
  await verify_1_qwacs("test_qwacs/missing-qc-type-statement.pem", false);
  await verify_1_qwacs("test_qwacs/missing-qcs-compliance.pem", false);
  await verify_1_qwacs("test_qwacs/wrong-qc-type.pem", false);
  await verify_1_qwacs("test_qwacs/no-1-qwac-policies.pem", false);
  await verify_1_qwacs("test_qwacs/no-policies.pem", false);
  await verify_1_qwacs("test_qwacs/2-qwac.pem", false);
});

async function verify_2_qwacs(
  filename,
  expectSuccess,
  hostname = "example.com"
) {
  let cert = constructCertFromFile(filename);
  let result = await certdb.asyncVerifyQWAC(
    Ci.nsIX509CertDB.TwoQWAC,
    cert,
    hostname,
    []
  );
  equal(
    result,
    expectSuccess,
    `${filename} ${expectSuccess ? "should" : "should not"} verify as 2-QWAC`
  );
}

add_task(async function test_verify_2_qwacs() {
  Services.prefs.clearUserPref("security.qwacs.enable_test_trust_anchors");
  // By default, the QWACs test trust anchors are not used.
  await verify_2_qwacs("test_qwacs/2-qwac.pem", false);

  Services.prefs.setBoolPref("security.qwacs.enable_test_trust_anchors", true);

  await verify_2_qwacs("test_qwacs/2-qwac.pem", true);

  await verify_2_qwacs("test_qwacs/1-qwac.pem", false);
  await verify_2_qwacs("test_qwacs/2-qwac-no-eku.pem", false);
  await verify_2_qwacs("test_qwacs/2-qwac-tls-server-eku.pem", false);
  await verify_2_qwacs("test_qwacs/2-qwac-multiple-key-purpose-eku.pem", false);
  await verify_2_qwacs("test_qwacs/2-qwac.pem", false, "example.org");
});
