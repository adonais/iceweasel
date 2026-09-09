"use strict";

// Return an empty PDF to exercise worker cleanup.
function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Cache-Control", "no-cache", false);
  response.setHeader("Content-Encoding", "identity", false);
  response.setHeader("Content-Type", "application/pdf", false);
  response.setHeader("Content-Length", "0", false);
}
