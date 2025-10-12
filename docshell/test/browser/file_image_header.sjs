/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function handleRequest(request, response) {
  let accept = request.getHeader("Accept");

  if (request.queryString === "image") {
    // Make sure that the Accept header is for images.
    if (accept.startsWith("image/")) {
      response.setStatusLine(request.httpVersion, 200, "Ok");
      // Also test that the image is rendered inline.
      response.setHeader("Content-Disposition", "attachment");
      response.write(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4v5ThPwAG7wKklwQ/bwAAAABJRU5ErkJggg=="
        )
      );
      return;
    }
  }

  response.setStatusLine(request.httpVersion, 400, "Bad Request");
}
