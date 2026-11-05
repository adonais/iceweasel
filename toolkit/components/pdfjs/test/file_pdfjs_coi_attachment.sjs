/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function handleRequest(request, response) {
  const mode = request.queryString;
  response.setHeader("Cache-Control", "no-store", false);
  response.setHeader("Content-Type", "application/pdf", false);
  if (mode != "coi_inline") {
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="file_pdfjs_coi_attachment.pdf"',
      false
    );
  }
  if (mode != "nocoi") {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin", false);
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp", false);
  }
  response.write("%PDF-1.7\n%%EOF\n");
}
