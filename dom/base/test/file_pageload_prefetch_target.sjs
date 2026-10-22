"use strict";

function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);

  // A no-store target is only reused by a navigation activated from its prefetch.
  const noStore = request.queryString.includes("nostore");
  response.setHeader(
    "Cache-Control",
    noStore ? "no-store" : "private, max-age=600",
    false
  );

  response.write("<!DOCTYPE html><title>prefetch target</title>");
}
