/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const STATE_KEY = "pdfjs-embed-fallback-referrer";

function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-store", false);

  if (request.queryString === "result") {
    response.setHeader("Content-Type", "text/plain", false);
    response.write(getState(STATE_KEY) || "");
    return;
  }

  setState(
    STATE_KEY,
    request.hasHeader("Referer") ? request.getHeader("Referer") : ""
  );
  response.setHeader("Content-Type", "application/pdf", false);
  response.write("%PDF-1.7\n%%EOF\n");
}
