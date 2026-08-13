/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/ml/MLEngine.worker.mjs";

globalThis.InferenceSession.isAvailable = () => {
  throw new Error("Native ORT availability probe failed");
};
