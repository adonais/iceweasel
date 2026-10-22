/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Redirects to the absolute URL passed as the query string.
function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, "302", "Found");
  response.setHeader("Location", request.queryString, false);
}
