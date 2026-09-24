"use strict";

function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 302, "Found");
  response.setHeader(
    "Location",
    "hackbotunknownprotocol://example.org/",
    false
  );
}
