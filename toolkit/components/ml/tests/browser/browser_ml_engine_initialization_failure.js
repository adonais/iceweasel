/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(async function test_failed_initialization_releases_engines() {
  const { cleanup } = await setup();
  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .returns({
      url: "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_engine_initialization_failure.worker.mjs",
      options: { type: "module" },
    });
  const options = {
    taskName: "text-classification",
    modelId: "acme/bert",
    backend: "static-embeddings",
    timeoutMS: -1,
  };

  try {
    const keeper = await createEngine({ ...options, engineId: "keeper" });
    const parent = keeper.mlEngineParent;
    const before = await getInferenceProcessInfo("inference");

    for (const engineId of ["failed-1", "failed-2", "failed-3"]) {
      await Assert.rejects(
        createEngine({
          ...options,
          engineId,
          modelRevision: "v0.0.0",
        }),
        /Intentionally failing engine initialization/,
        "The initialization error reaches the caller"
      );
    }

    await TestUtils.waitForCondition(
      async () => (await parent.getStatusByEngineId()).size === 1,
      "Failed engines are removed from the inference process"
    );
    const status = await parent.getStatusByEngineId();
    Assert.deepEqual(
      [...status.keys()],
      ["keeper"],
      "Failed engines are removed from the inference process"
    );
    Assert.ok((await keeper.run({})).ok, "The healthy engine remains usable");
    Assert.equal(
      (await getInferenceProcessInfo("inference")).pid,
      before.pid,
      "Failure cleanup preserves the healthy engine's process"
    );

    const retried = await createEngine({ ...options, engineId: "failed-1" });
    Assert.ok((await retried.run({})).ok, "A failed engine can be recreated");
    await retried.terminate(false, false);
    await keeper.terminate(true, false);
    await TestUtils.waitForCondition(
      async () => !(await checkForRemoteType("inference")),
      "The inference process exits after the last healthy engine terminates"
    );

    await Assert.rejects(
      createEngine({
        ...options,
        engineId: "failed-alone",
        modelRevision: "v0.0.0",
      }),
      /Intentionally failing engine initialization/,
      "Initialization also fails when no other engine is running"
    );
    await TestUtils.waitForCondition(
      async () => !(await checkForRemoteType("inference")),
      "The inference process exits when its only engine fails to initialize"
    );
  } finally {
    workerConfigStub.restore();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});
