AntiTracking.runTest(
  "ServiceWorkers",
  async _ => {
    await navigator.serviceWorker
      .register("empty.js")
      .then(
        _ => {
          ok(false, "ServiceWorker cannot be used!");
        },
        _ => {
          ok(true, "ServiceWorker cannot be used!");
        }
      )
      .catch(e => ok(false, "Promise rejected: " + e));
  },
  null,
  // Cleanup callback
  clearSiteTestData,
  [
    ["dom.serviceWorkers.exemptFromPerDomainMax", true],
    ["dom.ipc.processCount", 1],
    ["dom.serviceWorkers.enabled", true],
    ["dom.serviceWorkers.testing.enabled", true],
  ]
);
