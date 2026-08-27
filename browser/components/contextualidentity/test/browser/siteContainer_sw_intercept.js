self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event =>
  event.waitUntil(self.clients.claim())
);

// Intercept navigations to the marker path and answer with a synthetic document
// so the test can prove which container's service worker handled the request.
// The body carries the cookie the worker reads, and the worker writes one of
// its own, telling the test which jar it reads from and which it writes to.
self.addEventListener("fetch", event => {
  let url = new URL(event.request.url);
  if (url.pathname.endsWith("sw_marker.html")) {
    event.respondWith(
      (async () => {
        let seen = await self.cookieStore.get("ck");
        await self.cookieStore.set({
          name: "swck",
          value: "fromSW",
          path: "/",
        });
        return new Response(
          `<!DOCTYPE html><html><body>INTERCEPTED-BY-SW cookies=[ck=${seen?.value}]</body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      })()
    );
  }
});
