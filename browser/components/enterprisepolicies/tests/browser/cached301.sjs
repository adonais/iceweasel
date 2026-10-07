/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

function handleRequest(request, response) {
  let hits = parseInt(getState("hits") || "0", 10);

  if (request.queryString == "hits") {
    response.setHeader("Cache-Control", "no-store");
    response.write("" + hits);
    return;
  }

  setState("hits", "" + (hits + 1));
  response.setStatusLine(request.httpVersion, 301, "Moved Permanently");
  response.setHeader("Cache-Control", "max-age=3600");
  response.setHeader("Location", "policy_websitefilter_block.html");
}
