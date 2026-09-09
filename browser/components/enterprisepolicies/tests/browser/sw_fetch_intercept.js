self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.url.includes("sw-intercepted-resource")) {
    event.respondWith(new Response("intercepted"));
  } else if (event.request.mode === "navigate") {
    // Proxy navigation requests so the SW becomes the controller for pages
    // loaded within an already-controlled tab (e.g. same-tab back-navigation).
    event.respondWith(fetch(event.request));
  }
});
