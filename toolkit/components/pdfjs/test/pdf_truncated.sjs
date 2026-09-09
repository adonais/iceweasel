"use strict";

// End the truncated main response when the first range request arrives.
const PDF =
  "%PDF-1.\ntrailer<</Root<</Pages<</Kids[<</MediaBox[0 0 3 3]>>]>>>>>>";
const DELIVERED_LENGTH = 8;
const STATE_KEY = "pdfjs-truncated-response";

function setPendingResponse(response) {
  const state = {
    response,
    QueryInterface: ChromeUtils.generateQI([]),
  };
  state.wrappedJSObject = state;
  setObjectState(STATE_KEY, state);
}

function truncatePendingResponse() {
  let state = null;
  getObjectState(STATE_KEY, value => {
    state = value?.wrappedJSObject;
  });
  if (!state) {
    return;
  }
  setObjectState(STATE_KEY, null);
  state.response.finish();
}

function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-cache", false);
  response.setHeader("Content-Type", "application/pdf", false);
  response.setHeader("Accept-Ranges", "bytes", false);

  if (!request.hasHeader("Range")) {
    response.processAsync();
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Length", `${PDF.length}`, false);
    response.write(PDF.substring(0, DELIVERED_LENGTH));
    setPendingResponse(response);
    return;
  }

  const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(
    request.getHeader("Range")
  );
  const begin = first ? parseInt(first, 10) : 0;
  const end = Math.min(
    last ? parseInt(last, 10) : PDF.length - 1,
    PDF.length - 1
  );
  response.setStatusLine(request.httpVersion, 206, "Partial Content");
  response.setHeader(
    "Content-Range",
    `bytes ${begin}-${end}/${PDF.length}`,
    false
  );
  response.write(PDF.substring(begin, end + 1));

  truncatePendingResponse();
}
