self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function reply(content) {
  return self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ content });
    });
  });
}

// Exercises cookieStore from the worker and reports what each call observed.
async function cookieStoreReport() {
  let report = {};

  try {
    let existing = await self.cookieStore.get("existing");
    report.get = existing ? existing.value : null;
    report.getAll = (await self.cookieStore.getAll()).map(c => c.name).sort();

    await self.cookieStore.set({
      name: "fromSW",
      value: "written",
      path: "/",
    });
    let written = await self.cookieStore.get("fromSW");
    report.afterSet = written ? written.value : null;

    await self.cookieStore.delete({ name: "existing", path: "/" });
    let deleted = await self.cookieStore.get("existing");
    report.afterDelete = deleted ? deleted.value : null;
  } catch (e) {
    report.error = `${e.name}: ${e.message}`;
  }

  return report;
}

self.addEventListener("message", function (event) {
  if (event.data.action === "fetch") {
    fetch(event.data.url)
      .then(response => response.text())
      .then(data => reply(data));
  }

  if (event.data.action === "cookieStore") {
    cookieStoreReport().then(report => reply(report));
  }
});
