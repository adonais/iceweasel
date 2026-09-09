/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let timer;

function handleRequest(request, response) {
  response.processAsync();
  response.setHeader("Content-Type", "application/pdf", false);
  response.setHeader("Cache-Control", "no-store", false);
  response.write("%PDF-1.7\n");

  // Keep the response open long enough for the fallback to cancel it. Writing
  // the remainder may then fail because the client connection is gone.
  timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.init(
    () => {
      try {
        response.write("%%EOF\n");
        response.finish();
      } catch {
        // The response may already be closed after cancellation.
      }
    },
    5000,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
