"use strict";

function handleRequest(request, response) {
  response.setHeader("Content-Type", "text/javascript", false);

  // Make the response cacheable in the HTTP cache.
  response.setHeader("Cache-Control", "max-age=3600", false);
  response.write("export const marker = 'module';\n");
}
