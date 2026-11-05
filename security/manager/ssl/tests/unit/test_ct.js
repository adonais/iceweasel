// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

"use strict";

do_get_profile(); // must be called before getting nsIX509CertDB
let gCertDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
  Ci.nsIX509CertDB
);

async function run_tests_in_mode(mode) {
  info(`setting CT to mode ${mode}`);
  Services.prefs.setIntPref("security.pki.certificate_transparency.mode", mode);

  // Test that certificate transparency is not checked for certificates issued
  // by roots that are not built-in.
  await ctTest(
    "ct-unknown-log.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_NOT_APPLICABLE,
    true
  );

  // Make the test root appear to be a built-in root, so that certificate
  // transparency is checked.
  let rootCert = constructCertFromFile("test_ct/test-ca.pem");
  Services.prefs.setCharPref(
    "security.test.built_in_root_hash",
    rootCert.sha256Fingerprint
  );

  // These certificates have a validity period of 800 days, which is greater
  // than 180 days. Our policy requires 3 embedded SCTs for certificates with a
  // validity period greater than 180 days.
  await ctTest(
    "ct-valid.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_COMPLIANT,
    true
  );

  // This certificate has an embedded SCT from a tiled log.
  await ctTest(
    "ct-tiled-valid.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_COMPLIANT,
    true
  );

  // This certificate has only 2 embedded SCTs, and so is not policy-compliant.
  await ctTest(
    "ct-insufficient-scts.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  // Test that SCTs with timestamps from the future are not valid.
  await ctTest(
    "ct-future-timestamp.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  // Test that additional SCTs from the same log do not contribute to meeting
  // the requirements.
  await ctTest(
    "ct-multiple-from-same-log.example.com",
    Ci.nsITransportSecurityInfo
      .CERTIFICATE_TRANSPARENCY_POLICY_NOT_DIVERSE_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  // Test that SCTs from an unknown log do not contribute to meeting the
  // requirements.
  await ctTest(
    "ct-unknown-log.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  await ctTest(
    "no-ct.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  // Disable CT enforcement for exactly 'ct-unknown-log.example.com' as well
  // as 'sub.example.com' and all subdomains under 'sub.example.com'.
  // CT will still be checked, and the security info of the connection will say
  // the information is insufficient, but the connection will still succeed
  // (essentially, it behaves like telemetry-only mode).
  Services.prefs.setCharPref(
    "security.pki.certificate_transparency.disable_for_hosts",
    ".ct-unknown-log.example.com,no-ct.example.com"
  );
  clearSessionCache();
  await ctTest(
    "ct-unknown-log.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    true
  );
  await ctTest(
    "sub.ct-unknown-log.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );
  await ctTest(
    "no-ct.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    true
  );
  await ctTest(
    "sub.no-ct.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    true
  );
  await ctTest(
    "ct-insufficient-scts.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  Services.prefs.clearUserPref(
    "security.pki.certificate_transparency.disable_for_hosts"
  );

  // Disable CT enforcement for two SPKIs we don't actually have the private
  // key for.
  Services.prefs.setCharPref(
    "security.pki.certificate_transparency.disable_for_spki_hashes",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=,BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
  );
  clearSessionCache();
  await ctTest(
    "ct-insufficient-scts.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  // Disable CT enforcement for the default test key's SPKI.
  // Again, the behavior will be that of telemetry-only mode.
  Services.prefs.setCharPref(
    "security.pki.certificate_transparency.disable_for_spki_hashes",
    "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=,VCIlmPM9NkgFQtrs4Oa5TeFcDu6MWRTKSNdePEhOgD8="
  );
  await ctTest(
    "ct-insufficient-scts.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    true
  );

  // Disable CT enforcement for the alternate test key's SPKI.
  Services.prefs.setCharPref(
    "security.pki.certificate_transparency.disable_for_spki_hashes",
    "MQj2tt1yGAfwFpWETYUCVrZxk2CD2705NKBQUlAaKJI=,DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="
  );
  clearSessionCache();
  await ctTest(
    "no-ct.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    true
  );

  Services.prefs.clearUserPref(
    "security.pki.certificate_transparency.disable_for_spki_hashes"
  );
  clearSessionCache();

  // Test that if an end-entity is marked as a trust anchor, CT verification
  // returns a "not enough SCTs" result.
  let cert = addCertFromFile(
    gCertDB,
    "test_ct/ct-valid.example.com.pem",
    "CTu,,"
  );
  Services.prefs.setCharPref(
    "security.test.built_in_root_hash",
    cert.sha256Fingerprint
  );
  clearSessionCache();
  await ctTest(
    "ct-valid.example.com",
    Ci.nsITransportSecurityInfo.CERTIFICATE_TRANSPARENCY_POLICY_NOT_ENOUGH_SCTS,
    mode == CT_MODE_COLLECT_TELEMETRY
  );

  Services.prefs.clearUserPref("security.test.built_in_root_hash");
  setCertTrust(cert, ",,");
  clearSessionCache();
}

add_task(async function run_test() {
  await asyncStartTLSTestServer("BadCertAndPinningServer", "test_ct", true);
  await run_tests_in_mode(CT_MODE_COLLECT_TELEMETRY);
  await run_tests_in_mode(CT_MODE_ENFORCE);
});
