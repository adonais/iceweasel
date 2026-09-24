/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function handleRequest(request, response) {
  response.setHeader("Content-Type", "text/javascript", false);
  response.setHeader("Cache-Control", "no-cache", false);
  if (request.queryString.includes("allowOrigin")) {
    response.setHeader("Access-Control-Allow-Origin", "*", false);
  }
  response.write(`export const value = "http-dep";`);
}
