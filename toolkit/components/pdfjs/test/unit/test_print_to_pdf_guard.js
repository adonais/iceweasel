/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { hasPDFHeaderAndEOF } = ChromeUtils.importESModule(
  "resource://pdf.js/PdfJsPrint.sys.mjs"
);

// Test the boundary-marker check applied to generated PDF data.

function makePDFLikeBuffer({ body = "", eof = "%%EOF", after = "" } = {}) {
  return new TextEncoder().encode("%PDF-1.7\n" + body + eof + after).buffer;
}

add_task(function test_rejects_no_buffer() {
  Assert.equal(hasPDFHeaderAndEOF(null), false, "null");
  Assert.equal(hasPDFHeaderAndEOF(undefined), false, "undefined");
  Assert.equal(hasPDFHeaderAndEOF(new ArrayBuffer(0)), false, "empty buffer");
});

add_task(function test_rejects_header_only() {
  const buffer = new TextEncoder().encode("%PDF-").buffer;
  Assert.equal(
    hasPDFHeaderAndEOF(buffer),
    false,
    "header with nothing after it"
  );
});

add_task(function test_rejects_non_pdf() {
  const buffer = new TextEncoder().encode("<html></html>%%EOF").buffer;
  Assert.equal(hasPDFHeaderAndEOF(buffer), false, "EOF but no PDF header");
});

add_task(function test_rejects_missing_or_partial_eof() {
  Assert.equal(
    hasPDFHeaderAndEOF(makePDFLikeBuffer({ body: "1 0 obj\n", eof: "" })),
    false,
    "header and some content, no EOF marker"
  );
  Assert.equal(
    hasPDFHeaderAndEOF(makePDFLikeBuffer({ eof: "%%EO" })),
    false,
    "partial EOF marker"
  );
});

add_task(function test_accepts_header_and_eof() {
  Assert.equal(
    hasPDFHeaderAndEOF(makePDFLikeBuffer()),
    true,
    "header and EOF marker"
  );
  Assert.equal(
    hasPDFHeaderAndEOF(
      makePDFLikeBuffer({ body: "1 0 obj\nendobj\ntrailer\n" })
    ),
    true,
    "header, body, and EOF marker"
  );
});

add_task(function test_eof_search_window() {
  Assert.equal(
    hasPDFHeaderAndEOF(makePDFLikeBuffer({ after: "\n" })),
    true,
    "trailing EOL"
  );
  Assert.equal(
    hasPDFHeaderAndEOF(makePDFLikeBuffer({ after: "\0".repeat(1000) })),
    true,
    "EOF marker still within the search window"
  );
  Assert.equal(
    hasPDFHeaderAndEOF(makePDFLikeBuffer({ after: "\0".repeat(1024) })),
    false,
    "EOF marker pushed out of the search window"
  );
});
