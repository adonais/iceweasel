"use strict";

function handleRequest(request, response) {
  response.setHeader("Content-Type", "text/html", false);
  response.setHeader("Cache-Control", "no-cache", false);
  if (request.queryString == "csp") {
    response.setHeader("Content-Security-Policy", "img-src 'none'", false);
  }
  response.write(
    `<img src="http://example.com/tests/image/test/mochitest/blue.png">`
  );
}
