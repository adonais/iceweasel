/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NavigationError } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/RemoteError.sys.mjs"
);

const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
  Ci.nsINSSErrorsService
);

const SEC_ERROR_EXPIRED_CERTIFICATE = nssErrorsService.getXPCOMFromNSSError(
  Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE + 11
);

const SSL_ERROR_NO_CYPHER_OVERLAP = nssErrorsService.getXPCOMFromNSSError(
  Ci.nsINSSErrorsService.NSS_SSL_ERROR_BASE + 2
);

add_task(async function test_fixtures() {
  equal(
    nssErrorsService.getErrorClass(SEC_ERROR_EXPIRED_CERTIFICATE),
    Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT,
    "SEC_ERROR_EXPIRED_CERTIFICATE is a certificate error"
  );
  equal(
    nssErrorsService.getErrorClass(SSL_ERROR_NO_CYPHER_OVERLAP),
    Ci.nsINSSErrorsService.ERROR_CLASS_SSL_PROTOCOL,
    "SSL_ERROR_NO_CYPHER_OVERLAP is a SSL protocol error"
  );
});

add_task(async function test_NavigationError_basics() {
  const error = new NavigationError(
    "NS_ERROR_UNKNOWN_HOST",
    Cr.NS_ERROR_UNKNOWN_HOST
  );

  // Cannot use `instanceof` because the module is loaded in a different realm.
  ok(Error.isError(error), "NavigationError is an Error");
  ok(error.isNavigationError, "Is flagged as a navigation error");
  equal(error.message, "NS_ERROR_UNKNOWN_HOST", "Expected message is set");
});

add_task(async function test_NavigationError_isBindingAborted() {
  const aborted = new NavigationError(
    "NS_BINDING_ABORTED",
    Cr.NS_BINDING_ABORTED
  );
  ok(aborted.isBindingAborted, "NS_BINDING_ABORTED is detected");

  for (const status of [
    Cr.NS_OK,
    Cr.NS_ERROR_ABORT,
    Cr.NS_ERROR_UNKNOWN_HOST,
    SEC_ERROR_EXPIRED_CERTIFICATE,
  ]) {
    const error = new NavigationError("errorName", status);
    ok(
      !error.isBindingAborted,
      `Status 0x${status.toString(16)} is not detected as aborted`
    );
  }
});

add_task(async function test_NavigationError_isCertError() {
  const certError = new NavigationError(
    "SEC_ERROR_EXPIRED_CERTIFICATE",
    SEC_ERROR_EXPIRED_CERTIFICATE
  );
  ok(certError.isCertError, "Certificate error is detected");

  const sslError = new NavigationError(
    "SSL_ERROR_NO_CYPHER_OVERLAP",
    SSL_ERROR_NO_CYPHER_OVERLAP
  );
  ok(!sslError.isCertError, "SSL protocol error is not a certificate error");
});

add_task(async function test_NavigationError_isCertError_nonNSSStatus() {
  for (const status of [
    undefined,
    null,
    Cr.NS_OK,
    Cr.NS_BINDING_ABORTED,
    Cr.NS_ERROR_UNKNOWN_HOST,
  ]) {
    const error = new NavigationError("errorName", status);
    ok(!error.isCertError, `Status ${status} is not a certificate error`);
  }
});
