self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

// Nothing on the server answers "probe", so a body of "sw" proves the request
// reached this handler rather than the network or the HTTP cache.
self.addEventListener("fetch", function (event) {
  if (new URL(event.request.url).pathname.endsWith("/probe")) {
    event.respondWith(new Response("sw"));
  }
});
