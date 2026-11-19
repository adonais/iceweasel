/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function handleRequest(request, response) {
  const [mode, key] = request.queryString.split("=");
  response.setHeader("Content-Type", "text/html", false);
  response.setHeader("Cache-Control", "no-store", false);

  if (mode === "hold") {
    response.processAsync();
    response.write("<!DOCTYPE html><title>Pending prefetch</title>");
    setObjectState(key, response);
  } else if (mode === "release") {
    getObjectState(key, pending => pending?.finish());
    setObjectState(key, null);
    response.write("Released");
  } else {
    if (mode === "failure") {
      response.setStatusLine(request.httpVersion, 404, "Not Found");
    }
    response.write("<!DOCTYPE html><title>Prefetch target</title>");
  }
}
