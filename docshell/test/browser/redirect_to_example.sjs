function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 302, "Moved Permanently");
  // eslint-disable-next-line sdl/no-insecure-url
  response.setHeader("Location", "http://example");
}
