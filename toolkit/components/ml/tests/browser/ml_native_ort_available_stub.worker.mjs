/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/ml/MLEngine.worker.mjs";

if (typeof globalThis.InferenceSession?.isAvailable !== "function") {
  throw new Error("InferenceSession.isAvailable is not defined");
}

globalThis.InferenceSession.isAvailable = () => true;
