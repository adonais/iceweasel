function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-store", false);

  switch (request.queryString) {
    case "rules":
      response.setHeader(
        "Content-Type",
        "application/speculationrules+json",
        false
      );
      response.write(
        JSON.stringify({
          prefetch: [
            {
              source: "list",
              urls: ["file_use_counter_speculationrules_header.sjs?prefetch"],
              eagerness: "immediate",
            },
          ],
        })
      );
      return;
    case "prefetch":
      setState("speculationrules_header_prefetched", "true");
      response.setHeader("Content-Type", "text/html", false);
      return;
    case "check": {
      let prefetched = getState("speculationrules_header_prefetched");
      setState("speculationrules_header_prefetched", "");
      response.write(prefetched || "false");
      return;
    }
  }
  response.setStatusLine(request.httpVersion, 400, "Bad Request");
}
