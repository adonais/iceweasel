/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Copied from shared-head.js
function waitUntil(predicate, interval = 10) {
  if (predicate()) {
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    setTimeout(function () {
      waitUntil(predicate, interval).then(() => resolve(true));
    }, interval);
  });
}

// This flag will be flipped from controlled-sw.html::installServiceWorker()
let canInstall = false;
self.addEventListener("message", function (event) {
  if (event.data === "install-service-worker") {
    canInstall = true;
  }
  if (event.data === "install-service-worker-and-pause") {
    canInstall = true;
    // eslint-disable-next-line no-debugger
    debugger;
  }
});

// Wait for the canInstall flag to be flipped before completing the install.
self.addEventListener("install", function (event) {
  event.waitUntil(waitUntil(() => canInstall));
  // Log an early message to check cached log messages in tests.
  console.log("service worker installed");
});
