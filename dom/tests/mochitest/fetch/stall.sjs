// Responds with headers and a first chunk immediately, then holds the
// connection open for `ms` before completing the body. This lets a test
// observe a fetch that is genuinely in flight.
function handleRequest(request, response) {
  const params = new URLSearchParams(request.queryString);

  response.processAsync();
  response.setHeader("Content-Type", "text/plain", false);
  response.write("start");

  // Assigned to a global on purpose, as in slow.sjs: the timer must outlive
  // handleRequest.
  timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.init(
    function () {
      response.write("-done");
      response.finish();
    },
    parseInt(params.get("ms"), 10),
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
