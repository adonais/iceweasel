// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Tests that starting a profile with a preexisting CRLite filter and stash
// works correctly.

"use strict";

const CHECK_AT_TIME = new Date("2020-01-01T00:00:00Z").getTime() / 1000;

add_task(async function () {
  Services.prefs.setIntPref(
    "security.pki.crlite_mode",
    CRLiteModeEnforcePrefValue
  );

  let securityStateDirectory = do_get_profile();
  securityStateDirectory.append("security_state");

  // For simplicity, re-use the filters from test_crlite_filters.js.
  do_get_file("test_crlite_filters/20200101-0-filter").copyTo(
    securityStateDirectory,
    "crlite.filter"
  );

  do_get_file("test_crlite_filters/20200101-1-filter.delta").copyTo(
    securityStateDirectory,
    "20201017-1-filter.delta"
  );

  let certStorage = Cc["@mozilla.org/security/certstorage;1"].getService(
    Ci.nsICertStorage
  );

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );

  // These need to be available for path building.
  let ca = addCertFromFile(certdb, "test_crlite_filters/ca.pem", "C,C,");
  ok(ca, "ca certificate should decode successfully");

  let issuerCert = constructCertFromFile("test_crlite_filters/int.pem");
  ok(issuerCert, "issuer certificate should decode successfully");

  // Mark CRLite filter as fresh
  await new Promise(resolve => {
    certStorage.testNoteCRLiteUpdateTime((rv, _) => {
      Assert.equal(rv, Cr.NS_OK, "marked filter as fresh");
      resolve();
    });
  });

  let validCert = constructCertFromFile(
    "test_crlite_filters/valid.example.com.pem"
  );
  await checkCertErrorGenericAtTime(
    certdb,
    validCert,
    PRErrorCodeSuccess,
    Ci.nsIX509CertDB.verifyUsageTLSServer,
    CHECK_AT_TIME,
    false,
    "valid.example.com",
    0
  );

  let revokedCert = constructCertFromFile(
    "test_crlite_filters/revoked.example.com.pem"
  );
  await checkCertErrorGenericAtTime(
    certdb,
    revokedCert,
    SEC_ERROR_REVOKED_CERTIFICATE,
    Ci.nsIX509CertDB.verifyUsageTLSServer,
    CHECK_AT_TIME,
    false,
    "revoked.example.com",
    0
  );

  let revokedInDeltaCert = constructCertFromFile(
    "test_crlite_filters/revoked-in-delta.example.com.pem"
  );
  await checkCertErrorGenericAtTime(
    certdb,
    revokedInDeltaCert,
    SEC_ERROR_REVOKED_CERTIFICATE,
    Ci.nsIX509CertDB.verifyUsageTLSServer,
    CHECK_AT_TIME,
    false,
    "revoked-in-delta.example.com",
    0
  );
});
