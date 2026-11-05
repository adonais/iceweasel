/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  // FOG needs a profile dir to put its data in.
  do_get_profile();

  PingServer.start();

  registerCleanupFunction(async () => {
    await PingServer.stop();
  });

  Services.prefs.setIntPref(
    "telemetry.fog.test.localhost_port",
    PingServer.port
  );
  // Port pref needs to be set before init, so let's reset to reinit.
  Services.fog.testResetFOG();
});

add_task(async () => {
  PingServer.clearRequests();
  GleanPings.testOhttpPing.submit();

  let ping;
  // We might get some health pings first, so skip those.
  while (true) {
    let request = await PingServer.promiseNextRequest();
    if (request.path.includes("test-ohttp-ping")) {
      // Confirms that the ping did indeed go out over OHTTP.
      // (So long as PingServer never grows additional bhttp support.)
      ok(
        request instanceof Ci.nsIBinaryHttpRequest,
        "OHTTP uses bhttp under the hood."
      );
      ping = await decodeRequestPayload(request);
      break;
    }
  }

  // Confirms the info sections were omitted.
  ok(!("client_info" in ping), "No client_info allowed.");
  ok(!("ping_info" in ping), "No ping_info allowed.");

  // Confirms the ping was configured to require OHTTP upload.
  deepEqual(
    ping.metrics.string_list["glean.ping.uploader_capabilities"],
    ["ohttp"],
    "Must have required OHTTP uploader capability."
  );
});
