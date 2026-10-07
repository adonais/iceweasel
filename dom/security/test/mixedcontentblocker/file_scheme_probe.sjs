"use strict";

// Answers with an image over http and a 404 over https, so that a load of this
// file succeeds exactly when it was not upgraded.
function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-store", false);

  if (request.scheme === "https") {
    response.setStatusLine(request.httpVersion, 404, "Not Found");
    response.setHeader("Content-Type", "text/plain", false);
    response.write("request was upgraded to https");
    return;
  }

  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "image/svg+xml", false);
  response.write(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<rect width="100" height="100" fill="green"/></svg>'
  );
}
