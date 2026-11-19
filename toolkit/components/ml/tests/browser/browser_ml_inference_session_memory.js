/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(async function test_inference_session_memory_is_released() {
  const { cleanup } = await setup();
  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .returns({
      url: "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_inference_session_memory.worker.mjs",
      options: { type: "module" },
    });

  try {
    const engine = await createEngine({
      taskName: "text-classification",
      modelId: "acme/bert",
      backend: "onnx-native",
      timeoutMS: -1,
    });
    const warmup = await engine.run({ cycles: 8 });
    const before = await getInferenceProcessInfo("inference");
    const result = await engine.run({ cycles: 32 });
    const after = await getInferenceProcessInfo("inference");

    Assert.equal(result.logits.length, 2, "The model produces two logits");
    Assert.deepEqual(
      result.logits,
      warmup.logits,
      "Repeated sessions produce the same output"
    );
    Assert.greater(before.memory, 0, "Measured inference process memory");
    Assert.equal(after.pid, before.pid, "Sessions reuse the same process");
    const growth = after.memory - before.memory;
    info(
      `Memory before: ${before.memory}; after: ${after.memory}; growth: ${growth}`
    );
    Assert.less(
      growth,
      2 * 1024 * 1024,
      "Memory stays bounded when native inference sessions are cycled"
    );
  } finally {
    workerConfigStub.restore();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});
