/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-store", false);
  response.setHeader("Content-Type", "application/pdf", false);
  response.setHeader(
    "Content-Disposition",
    'attachment; filename="file_pdfjs_attachment.pdf"',
    false
  );
  response.write("%PDF-1.7\n%%EOF\n");
}
