// Worker entry point. Runs the worker-flagged cases and posts results back.
importScripts("runner.js", "configs.js");

self.onmessage = async function () {
  try {
    var results = await runAll(testcase => testcase.worker);
    self.postMessage({ ok: true, results });
  } catch (e) {
    self.postMessage({ ok: false, message: String(e) });
  }
};
