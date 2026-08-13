"use strict";

self.postMessage("ready");

self.onmessage = e => {
  if (e.data === "pause") {
    /* eslint-disable-next-line no-debugger */
    debugger;
    self.postMessage("resumed");
  }
};
