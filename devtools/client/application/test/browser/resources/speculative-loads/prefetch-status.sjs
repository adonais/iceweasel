/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function handleRequest(request, response) {
  const mode = request.queryString.split("=")[0];
  response.setHeader("Content-Type", "text/html; charset=utf-8", false);
  response.setHeader(
    "Cache-Control",
    mode === "no-store" ? "no-store" : "public, max-age=300",
    false
  );
  if (mode === "failure") {
    response.setStatusLine(request.httpVersion, 404, "Not Found");
  }
  response.write(
    "<!DOCTYPE html><title>Prefetch status target</title><h1>Prefetch status target</h1>"
  );
}
