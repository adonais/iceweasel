/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Serves a document which never finishes loading until this file is requested
// again with the "release" query.
function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-cache", false);

  if (request.queryString == "release") {
    getObjectState("stalledLoad", stalledResponse => {
      stalledResponse?.finish();
    });
    setObjectState("stalledLoad", null);
    response.write("OK");
    return;
  }

  response.processAsync();
  response.setHeader("Content-Type", "text/html", false);
  response.write("<!DOCTYPE html><html><body>");
  setObjectState("stalledLoad", response);
}
