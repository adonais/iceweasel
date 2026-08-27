function handleRequest(aRequest, aResponse) {
  let params = new URLSearchParams(aRequest.queryString);

  // Record, under a label, the Cookie header this hop received, so the test can
  // later assert which container's cookie jar served the request.
  if (params.has("record")) {
    let cookie = aRequest.hasHeader("Cookie")
      ? aRequest.getHeader("Cookie")
      : "";
    setSharedState("rec-" + params.get("record"), cookie);
  }

  // Return the recorded Cookie headers as JSON.
  if (params.has("results")) {
    let out = {};
    for (let label of params.get("results").split(",")) {
      out[label] = getSharedState("rec-" + label);
    }
    aResponse.setStatusLine(aRequest.httpVersion, 200, "OK");
    aResponse.setHeader("Content-Type", "application/json", false);
    aResponse.write(JSON.stringify(out));
    return;
  }

  // Redirect to the next hop.
  if (params.has("to")) {
    aResponse.setStatusLine(aRequest.httpVersion, 302, "Found");
    aResponse.setHeader("Location", params.get("to"), false);
    aResponse.write("redirect");
    return;
  }

  // Serve an application/json body, which the built-in JSON viewer renders as a
  // top-level document.
  if (params.has("json")) {
    aResponse.setStatusLine(aRequest.httpVersion, 200, "OK");
    aResponse.setHeader("Content-Type", "application/json", false);
    aResponse.write('{"landed":true}');
    return;
  }

  // Serve an attachment, which turns the navigation into a download instead of
  // committing a document.
  if (params.has("download")) {
    aResponse.setStatusLine(aRequest.httpVersion, 200, "OK");
    aResponse.setHeader("Content-Type", "application/octet-stream", false);
    aResponse.setHeader(
      "Content-Disposition",
      "attachment; filename=container.bin",
      false
    );
    aResponse.write("downloaded");
    return;
  }

  aResponse.setStatusLine(aRequest.httpVersion, 200, "OK");
  aResponse.setHeader("Content-Type", "text/html", false);
  aResponse.write("<html><body>landed</body></html>");
}
