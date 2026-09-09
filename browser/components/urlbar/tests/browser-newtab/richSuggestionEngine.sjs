/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A 1x1 GIF, the shape a search provider sends a rich suggestion's icon in.
const ICON_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// Icons the test asks for by search string, standing in for a provider that
// sends a scheme the page won't load.
const ICONS_BY_QUERY = {
  javascript: "javascript:alert(1)",
  file: "file:///etc/passwd",
  // eslint-disable-next-line sdl/no-insecure-url
  http: "http://example.com/favicon.ico",
};

function handleRequest(request, response) {
  let params = new URLSearchParams(request.queryString);
  let query = params.get("query") || "";
  let suggestion = query + " suggestion";
  let icon = ICONS_BY_QUERY[query] || ICON_DATA_URL;

  let data = [
    query,
    [suggestion],
    [],
    {
      "google:suggestdetail": [{ a: "Extended title", i: icon }],
    },
  ];

  response.setHeader("Content-Type", "application/json", false);
  response.write(JSON.stringify(data));
}
