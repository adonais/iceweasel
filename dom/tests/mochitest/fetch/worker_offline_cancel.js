let bodyPromise = null;

self.addEventListener("message", async function (e) {
  if (e.data.start) {
    // Reply once the response headers are in, which proves the fetch is in
    // flight rather than merely queued.
    try {
      const response = await fetch(e.data.url);
      bodyPromise = response.text();
      // The body may be aborted while the test is flipping the offline state.
      bodyPromise.catch(() => {});
      postMessage({ status: response.status });
    } catch (err) {
      postMessage({ error: `${err.name}: ${err.message}` });
    }
    return;
  }

  try {
    postMessage({ body: await bodyPromise });
  } catch (err) {
    postMessage({ error: `${err.name}: ${err.message}` });
  }
});
