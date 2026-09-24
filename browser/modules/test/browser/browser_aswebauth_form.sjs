/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function handleRequest(request, response) {
  response.setHeader("Content-Type", "text/html", false);

  let params = new URLSearchParams(request.queryString);

  let redirectTo = params.get("redirect_to");
  if (redirectTo) {
    response.setStatusLine(request.httpVersion, 302, "Found");
    response.setHeader("Location", redirectTo, false);
    return;
  }

  let jsRedirectTo = params.get("js_redirect_to");
  if (jsRedirectTo) {
    response.write(
      "<!DOCTYPE html><html><body><script>location.href = " +
        JSON.stringify(jsRedirectTo) +
        ";</script></body></html>"
    );
    return;
  }

  let metaRefreshTo = params.get("meta_refresh_to");
  if (metaRefreshTo) {
    response.write(
      '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=' +
        metaRefreshTo +
        '"></head><body>redirecting</body></html>'
    );
    return;
  }

  let title = "auth";
  let reflectHeader = params.get("reflect_header");
  if (reflectHeader && request.hasHeader(reflectHeader)) {
    title = request.getHeader(reflectHeader);
  }

  response.write(
    "<!DOCTYPE html><html><head><title>" +
      title +
      "</title></head><body>auth</body></html>"
  );
}
