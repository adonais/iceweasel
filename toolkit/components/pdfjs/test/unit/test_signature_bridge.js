/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { validateVerifyPdfSignatureArgs, filterCertsForView } =
  ChromeUtils.importESModule("resource://pdf.js/PdfjsParent.sys.mjs");

// ---------------------------------------------------------------------
// validateVerifyPdfSignatureArgs — guards `_verifyPdfSignature` before
// forwarding bytes to NSS. Must reject every malformed shape and accept
// only the documented `{pkcs7, data, signatureType}` triple.
// ---------------------------------------------------------------------

add_task(function test_verifyArgs_rejects_missing_payload() {
  Assert.equal(validateVerifyPdfSignatureArgs(null), false);
  Assert.equal(validateVerifyPdfSignatureArgs(undefined), false);
  Assert.equal(validateVerifyPdfSignatureArgs({}), false);
});

add_task(function test_verifyArgs_rejects_bad_pkcs7() {
  const detached = [new Uint8Array(1)];
  // Missing / wrong type pkcs7.
  Assert.equal(
    validateVerifyPdfSignatureArgs({ data: detached, signatureType: 0 }),
    false,
    "missing pkcs7"
  );
  Assert.equal(
    validateVerifyPdfSignatureArgs({
      pkcs7: "string-not-bytes",
      data: detached,
      signatureType: 0,
    }),
    false,
    "pkcs7 must be Uint8Array, not string"
  );
  Assert.equal(
    validateVerifyPdfSignatureArgs({
      pkcs7: new ArrayBuffer(4),
      data: detached,
      signatureType: 0,
    }),
    false,
    "pkcs7 must be Uint8Array, not ArrayBuffer"
  );
});

add_task(function test_verifyArgs_rejects_bad_detached() {
  const pkcs7 = new Uint8Array(4);
  Assert.equal(
    validateVerifyPdfSignatureArgs({ pkcs7, signatureType: 0 }),
    false,
    "missing data array"
  );
  Assert.equal(
    validateVerifyPdfSignatureArgs({ pkcs7, data: "abc", signatureType: 0 }),
    false,
    "data must be an Array"
  );
  Assert.equal(
    validateVerifyPdfSignatureArgs({ pkcs7, data: [], signatureType: 0 }),
    false,
    "data must be non-empty (`[].every` returns true)"
  );
  Assert.equal(
    validateVerifyPdfSignatureArgs({
      pkcs7,
      data: [new Uint8Array(1), "not-bytes"],
      signatureType: 0,
    }),
    false,
    "every entry of data must be Uint8Array"
  );
});

add_task(function test_verifyArgs_rejects_bad_signatureType() {
  const pkcs7 = new Uint8Array(4);
  const data = [new Uint8Array(1)];
  for (const signatureType of [-1, 2, 1.5, NaN, "0", true, null, undefined]) {
    Assert.equal(
      validateVerifyPdfSignatureArgs({ pkcs7, data, signatureType }),
      false,
      `signatureType ${JSON.stringify(signatureType)} must be rejected`
    );
  }
});

add_task(function test_verifyArgs_accepts_well_formed() {
  Assert.equal(
    validateVerifyPdfSignatureArgs({
      pkcs7: new Uint8Array([0x30, 0x82]),
      data: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      signatureType: 0,
    }),
    true,
    "adbe.pkcs7.detached payload (signatureType 0)"
  );
  Assert.equal(
    validateVerifyPdfSignatureArgs({
      pkcs7: new Uint8Array([0x30, 0x82]),
      data: [new Uint8Array(0)], // a single empty span is still well-formed
      signatureType: 1,
    }),
    true,
    "adbe.pkcs7.sha1 payload (signatureType 1)"
  );
});

// ---------------------------------------------------------------------
// filterCertsForView — guards `_viewPdfCertificate` so that what gets
// embedded into the `about:certificate` URL is bounded base64.
// ---------------------------------------------------------------------

// 16 ASCII chars, valid base64.
const VALID_CERT = "MIIBIjANBgkqhk==";

add_task(function test_filterCerts_rejects_bad_input_shape() {
  Assert.equal(filterCertsForView(null), null, "null payload");
  Assert.equal(filterCertsForView({}), null, "no certs key");
  Assert.equal(
    filterCertsForView({ certs: VALID_CERT }),
    null,
    "certs must be array"
  );
  Assert.equal(filterCertsForView({ certs: [] }), null, "empty cert list");
});

add_task(function test_filterCerts_rejects_too_many() {
  // 16 is the documented cap; 17 must be rejected wholesale (no partial
  // truncation) so a malicious caller can't slip in past the cap.
  const justUnderCap = Array.from({ length: 16 }, () => VALID_CERT);
  Assert.deepEqual(
    filterCertsForView({ certs: justUnderCap }),
    justUnderCap,
    "exactly 16 certs are allowed through"
  );
  const overCap = Array.from({ length: 17 }, () => VALID_CERT);
  Assert.equal(
    filterCertsForView({ certs: overCap }),
    null,
    "17 certs must be rejected"
  );
});

add_task(function test_filterCerts_drops_non_base64_entries() {
  Assert.equal(
    filterCertsForView({ certs: ["!@#$%^"] }),
    null,
    "non-base64 only -> null"
  );
  Assert.equal(
    filterCertsForView({ certs: [""] }),
    null,
    "empty string -> null"
  );
  Assert.deepEqual(
    filterCertsForView({
      certs: [VALID_CERT, "!@#$%^", VALID_CERT, 42, null],
    }),
    [VALID_CERT, VALID_CERT],
    "valid entries kept, non-base64 / non-string entries dropped"
  );
});

add_task(function test_filterCerts_rejects_oversized_entry() {
  const tooLong = "A".repeat(64 * 1024 + 1);
  Assert.equal(
    filterCertsForView({ certs: [tooLong] }),
    null,
    "entry over 64 KiB cap is rejected and result is null"
  );
  Assert.deepEqual(
    filterCertsForView({ certs: [tooLong, VALID_CERT] }),
    [VALID_CERT],
    "oversized entry filtered out, valid one survives"
  );
});

add_task(function test_filterCerts_accepts_well_formed() {
  Assert.deepEqual(
    filterCertsForView({ certs: [VALID_CERT] }),
    [VALID_CERT],
    "single valid cert"
  );
  Assert.deepEqual(
    filterCertsForView({ certs: [VALID_CERT, VALID_CERT] }),
    [VALID_CERT, VALID_CERT],
    "two valid certs preserve order"
  );
});
