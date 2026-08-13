/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Delays the response so the worker's synchronous XHR stays parked in a nested
// sync loop long enough for the bfcache freeze/thaw to land on it. Kept alive
// via a module-global reference to the timer.
let gTimer;

function handleRequest(request, response) {
  response.processAsync();
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Cache-Control", "no-store", false);

  gTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gTimer.initWithCallback(
    () => {
      response.write("ok");
      response.finish();
    },
    3000,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
