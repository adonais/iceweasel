function handleRequest(request, response) {
  // noop, so that the document loads indefinitely, session history stays empty.
  response.processAsync();
}
