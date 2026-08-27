/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Delays the response so the worker's synchronous XHR stays parked in a nested
// sync loop long enough for the bfcache freeze/thaw to land on it. Every
// pending timer is kept alive in a module-global set so overlapping requests
// (the test runs many times in one browser) can't drop each other's response.
const gTimers = new Set();

function handleRequest(request, response) {
  response.processAsync();
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Cache-Control", "no-store", false);

  const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gTimers.add(timer);
  timer.initWithCallback(
    () => {
      gTimers.delete(timer);
      response.write("ok");
      response.finish();
    },
    3000,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
