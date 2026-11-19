/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import { _lazyForTestMocking } from "chrome://global/content/ml/MLEngine.worker.mjs";

_lazyForTestMocking.getBackend = async function (_consumer, _wasm, options) {
  if (options.modelRevision === "v0.0.0") {
    throw new Error("Intentionally failing engine initialization");
  }
  return {
    async run() {
      return { ok: true, metrics: {} };
    },
  };
};
