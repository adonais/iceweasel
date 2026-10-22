self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

let port;
self.addEventListener("message", event => {
  port = event.ports[0];
  port.postMessage("connected");
});

self.addEventListener("fetch", event => {
  if (event.request.url.endsWith("?sw-upload-fallback")) {
    event.waitUntil(event.handled.then(async () => {
      const body = event.request.body;
      const locked = body.locked;
      const { done } = await body.getReader().read();
      port.postMessage({ bodyUsed: event.request.bodyUsed, locked, done });
    }));
    return;
  }
  const redirect = event.request.url.match(/sw-upload-redirect-(30[37])$/);
  if (redirect) {
    event.respondWith(
      Response.redirect("sw-upload-redirect-target", Number(redirect[1])));
    return;
  }
  if (event.request.url.endsWith("sw-upload-redirect-target")) {
    event.respondWith(
      new Response(`${event.request.method} ${event.request.body === null}`));
    return;
  }
  if (!event.request.url.endsWith("sw-upload-backpressure")) {
    return;
  }
  event.respondWith(new Promise(resolve => {
    port.onmessage = async () => {
      await event.request.body.cancel();
      resolve(new Response("cancelled"));
    };
    port.postMessage("ready");
  }));
});
