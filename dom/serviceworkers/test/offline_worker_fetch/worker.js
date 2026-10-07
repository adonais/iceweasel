async function probe() {
  const result = { controlled: !!self.navigator.serviceWorker.controller };
  try {
    const response = await fetch("probe?" + Math.random());
    result.status = response.status;
    result.body = await response.text();
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

self.addEventListener("message", async function () {
  postMessage(await probe());
});
