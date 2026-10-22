"use strict";

// Serves an HTML document after a delay, so that a test can change docshell
// activeness after the navigation has started but before the load event fires.
function handleRequest(request, response) {
  response.processAsync();
  response.setHeader("Content-Type", "text/html", false);
  response.setHeader("Cache-Control", "no-store", false);

  let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.init(
    function () {
      response.write("<!DOCTYPE html><html><body>slow</body></html>");
      response.finish();
    },
    5000,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
