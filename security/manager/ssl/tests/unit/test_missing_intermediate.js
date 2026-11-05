// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

"use strict";

// Tests that if a server does not send a complete certificate chain, we can
// make use of cached intermediates to build a trust path.

do_get_profile(); // must be called before getting nsIX509CertDB

function run_test() {
  add_tls_server_setup("BadCertAndPinningServer", "bad_certs");
  // If we don't know about the intermediate, we'll get an unknown issuer error.
  add_connection_test(
    "ee-from-missing-intermediate.example.com",
    SEC_ERROR_UNKNOWN_ISSUER
  );

  // Make BadCertAndPinningServer aware of the intermediate.
  add_test(() => {
    let args = [
      "-A",
      "-n",
      "manually-added-missing-intermediate",
      "-i",
      "test_missing_intermediate/missing-intermediate.pem",
      "-a",
      "-t",
      ",,",
    ];
    run_certutil_on_directory(getCertDirCopy("bad_certs").path, args);
    run_next_test();
  });

  // BadCertAndPinningServer should send the intermediate now, so the
  // connection should succeed.
  add_connection_test(
    "ee-from-missing-intermediate.example.com",
    PRErrorCodeSuccess
  );

  run_next_test();
}
