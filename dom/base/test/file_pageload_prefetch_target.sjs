"use strict";

// Keeps slow responses' timers alive until they fire.
const pendingTimers = new Set();

function hitsKey(token) {
  return `hits-${token}`;
}

function handleRequest(request, response) {
  const params = new URLSearchParams(request.queryString);

  // ?count=<token>: report how many times that token's target was requested.
  if (params.has("count")) {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "text/plain", false);
    response.setHeader("Cache-Control", "no-store", false);
    response.write(getState(hitsKey(params.get("count"))) || "0");
    return;
  }

  const token = params.get("v");
  setState(hitsKey(token), String(Number(getState(hitsKey(token))) + 1));

  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);

  // A no-store target is only reused by a navigation activated from its prefetch.
  const noStore = params.has("nostore");
  response.setHeader(
    "Cache-Control",
    noStore ? "no-store" : "private, max-age=600",
    false
  );

  let body = "<!DOCTYPE html><title>prefetch target</title>";

  // ?large=1: pad the body past a lowered max_body_bytes cap.
  if (params.has("large")) {
    body += "x".repeat(1024);
  }

  // ?slow=<ms>: hold back the whole response, headers included, so a
  // prefetch of this target is still in flight when the test navigates.
  // ?status=<code> with it answers with that status instead of 200.
  if (params.has("slow")) {
    response.processAsync();
    const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    pendingTimers.add(timer);
    timer.init(
      () => {
        pendingTimers.delete(timer);
        if (params.has("status")) {
          response.setStatusLine(
            request.httpVersion,
            Number(params.get("status")),
            "Error"
          );
        }
        response.write(body);
        response.finish();
      },
      Number(params.get("slow")),
      Ci.nsITimer.TYPE_ONE_SHOT
    );
    return;
  }

  response.write(body);
}
