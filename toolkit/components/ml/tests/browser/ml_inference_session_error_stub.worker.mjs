/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import { _lazyForTestMocking } from "chrome://global/content/ml/MLEngine.worker.mjs";

// Bug 2046861 regression: calls InferenceSession.create() with a malformed
// buffer inside the inference process (the only place the WebIDL interface is
// exposed) and returns the outcome through run().
_lazyForTestMocking.getBackend = async function () {
  const { InferenceSession } = globalThis;
  if (!InferenceSession) {
    return {
      run: () => ({
        exposed: false,
        available: false,
        rejected: false,
        errorName: null,
        message: null,
        metrics: {},
      }),
    };
  }

  const outcome = {
    exposed: true,
    available: InferenceSession.isAvailable(),
    rejected: false,
    errorName: null,
    message: null,
    metrics: {},
  };
  if (outcome.available) {
    try {
      await InferenceSession.create(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03])
      );
    } catch (error) {
      outcome.rejected = true;
      outcome.errorName = error?.name ?? null;
      outcome.message = error?.message ?? String(error);
    }
  }
  return { run: () => outcome };
};
