// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/
"use strict";

// A shared worker that, on request, parks itself in a nested sync loop by
// running a synchronous XHR whose response the server delays. The bfcache
// freeze/thaw driven by the test then lands while the worker is stuck in that
// sync loop, which is the scenario that used to deadlock the content process
// with the RemoteWorkerDebugger enabled (bug 2053827).
/* global onconnect */
onconnect = function (e) {
  const port = e.ports[0];
  port.onmessage = function (ev) {
    if (ev.data !== "start") {
      return;
    }
    // Tell the test we are about to enter the sync loop, then block in a
    // synchronous XHR. Posting first is safe: delivery to the frame is not
    // gated on this worker thread, which is about to block.
    port.postMessage("insync");
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "remoteDebugger_freeze_syncloop_hang.sjs", false);
      xhr.send();
      port.postMessage("done:" + xhr.responseText);
    } catch (err) {
      port.postMessage("error:" + err);
    }
  };
  port.start();
};
