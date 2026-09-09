// Support file for test_media_error_redirect_redaction.html.
//
// ?redirect=same      : 302 to the error resource on the same origin.
// ?redirect=<origin>  : 302 to the error resource on <origin>.
// otherwise           : respond with an error status, a distinctive reason
//                       phrase, and a media Content-Type so the response
//                       reaches the media stack.
function handleRequest(request, response) {
  const query = request.queryString;

  // 302-redirect the media load to the error resource on the requested origin.
  if (query.startsWith("redirect=")) {
    const origin = query.substring("redirect=".length);
    const host = origin === "same" ? request.getHeader("Host") : origin;
    response.setStatusLine(request.httpVersion, 302, "Found");
    response.setHeader(
      "Location",
      // eslint-disable-next-line sdl/no-insecure-url
      "http://" + host + "/tests/dom/media/test/redirect_media_error.sjs",
      false
    );
    response.setHeader("Content-Type", "text/html", false);
    return;
  }

  // Fail with an error status whose reason phrase carries a distinctive
  // marker, so the test can detect whether it leaks into error.message. The
  // media Content-Type lets the response reach the media stack.
  response.setStatusLine(request.httpVersion, 403, "SsshSecret");
  response.setHeader("Content-Type", "audio/mpeg", false);
}
