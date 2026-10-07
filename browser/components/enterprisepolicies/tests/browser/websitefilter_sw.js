self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.url.includes("sw-redirect")) {
    event.respondWith(
      Response.redirect("policy_websitefilter_block.html", 302)
    );
  }
});
