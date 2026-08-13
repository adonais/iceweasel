"use strict";
// Spawn a nested worker from this parent-process (chrome) worker and relay its
// load message, so the test can confirm nested parent-worker registration.
const nested = new Worker("nested_worker.js");
nested.onmessage = e => {
  self.postMessage("nested:" + e.data);
};
