/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/// <reference path="head.js" />

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const WORKER_STUB_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_inference_session_error_stub.worker.mjs";

const NATIVE_OPTIONS = {
  taskName: "text-classification",
  modelId: "acme/bert",
  dtype: "q8",
  backend: "onnx-native",
  modelHubUrlTemplate: "{model}/resolve/{revision}",
};

/**
 * Regression test for Bug 2046861. A CreateSession failure inside the native
 * onnxruntime (an out-of-memory condition, or a malformed/unsupported model)
 * used to MOZ_CRASH the whole inference content process. It must instead reject
 * the InferenceSession.create() promise so JS callers can recover -- e.g.
 * best-onnx falling back to the wasm backend.
 *
 * The stub worker runs the create() call with a malformed buffer inside the
 * inference process. A regression would crash that process before run()
 * resolves, failing this test with an unexpected child-process crash.
 */
add_task(async function test_inference_session_bad_model_rejects() {
  const { cleanup } = await setup();

  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .callsFake(() => ({ url: WORKER_STUB_URL, options: { type: "module" } }));

  try {
    const engine = await createEngine(NATIVE_OPTIONS);
    const outcome = await engine.run({ args: ["dummy data"] });

    Assert.ok(
      outcome.exposed,
      "InferenceSession is exposed inside the inference process."
    );
    Assert.ok(
      outcome.available,
      "The native ONNX runtime is available for the regression test."
    );
    Assert.ok(
      outcome.rejected,
      "InferenceSession.create() rejects a malformed model instead of crashing."
    );
    Assert.equal(
      outcome.errorName,
      "UnknownError",
      "InferenceSession.create() rejected from the native session-create path."
    );
    info(`Rejection message: ${outcome.message}`);
  } finally {
    workerConfigStub.restore();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});
