const channel = new BroadcastChannel("push-message-handled");

// With hang-activate the worker never finishes activating, so a push message
// sent to it stays queued until the worker shuts down
if (new URLSearchParams(location.search).has("hang-activate")) {
  self.addEventListener("activate", event => {
    event.waitUntil(new Promise(() => {}));
  });
}

let release;
const released = new Promise(resolve => {
  release = resolve;
});

channel.onmessage = event => {
  if (event.data == "release") {
    channel.postMessage("released");
    release();
  }
};

self.addEventListener("push", event => {
  channel.postMessage("push-received");
  event.waitUntil(released);
});
