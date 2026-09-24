self.addEventListener("notificationclick", e =>
  e.waitUntil(async () => {
    for (const client of await self.clients()) {
      client.postMessage("notificationclick");
    }
  })
);
