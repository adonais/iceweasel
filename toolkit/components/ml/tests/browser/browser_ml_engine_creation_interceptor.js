/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MLTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLTestUtils.sys.mjs"
);

/**
 * Creates options for a model-free echo engine.
 *
 * @param {string} featureId - The feature requesting the engine.
 * @param {string} [backend="onnx"] - The requested inference backend.
 * @param {number} [numThreads=2] - The requested number of inference threads.
 * @returns {{
 *   featureId: string,
 *   taskName: string,
 *   backend: string,
 *   numThreads: number,
 * }} The engine options.
 */
function createOptions(featureId, backend = "onnx", numThreads = 2) {
  return {
    featureId,
    taskName: "moz-echo",
    backend,
    numThreads,
  };
}

/**
 * Runs echo inference through real engines and resolves their mocked runtimes.
 *
 * @param {Array<MLEngine<any>>} engines - The engines to invoke.
 * @param {Record<string, AttachmentMock>} remoteClients - The mocked Remote Settings clients.
 * @returns {Promise<void>}
 */
async function runEchoEngines(engines, remoteClients) {
  const messages = engines.map((_, index) => `Engine ${index}`);
  const runs = engines.map((engine, index) =>
    engine.run({ data: messages[index] })
  );

  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(
    engines.length
  );

  const results = await Promise.all(runs);

  Assert.deepEqual(
    results.map(result => result.output.echo),
    messages,
    "Every real engine completes inference"
  );
}

/**
 * Restores engine interception and the ML test environment.
 *
 * @param {() => Promise<void>} environmentCleanup - Restores the ML test
 *   environment.
 * @returns {Promise<void>}
 */
async function cleanupTest(environmentCleanup) {
  try {
    MLTestUtils.cleanupEngineCreationInterceptions();
  } finally {
    EngineProcess.resetNativeOnnxRuntimeAvailabilityForTests();
    await EngineProcess.destroyMLEngine();
    await environmentCleanup();
  }
}

/**
 * This test case ensures that multiple engine interceptions can be armed while
 * unrelated engine creation continues normally.
 */
add_task(async function test_intercepts_multiple_engine_creations() {
  const { cleanup, remoteClients } = await setup();
  const originalGetEngine = MLEngineParent.prototype.getEngine;

  const encoderCreation = MLTestUtils.interceptEngineCreation(
    "formfill-encoder",
    {
      expectedOptions: { backend: "onnx", numThreads: 2 },
      overrides: { numThreads: 1 },
    }
  );
  const installedGetEngine = MLEngineParent.prototype.getEngine;
  Assert.notEqual(
    installedGetEngine,
    originalGetEngine,
    "Arming the first engine replaces getEngine"
  );

  const headCreation = MLTestUtils.interceptEngineCreation("formfill-head", {
    expectedOptions: { backend: "onnx", numThreads: 2 },
    overrides: { numThreads: 1 },
  });
  Assert.equal(
    MLEngineParent.prototype.getEngine,
    installedGetEngine,
    "Arming another engine keeps the installed interceptor"
  );

  try {
    const unrelatedEngine = await createEngine(
      createOptions("about-inference")
    );
    const [encoderEngine, headEngine] = await Promise.all([
      createEngine(createOptions("formfill-encoder")),
      createEngine(createOptions("formfill-head")),
    ]);
    Assert.equal(
      MLEngineParent.prototype.getEngine,
      originalGetEngine,
      "Consuming the final armed engine restores getEngine"
    );

    Assert.equal(
      (await encoderCreation).engine,
      encoderEngine,
      "The encoder interceptor resolves with the real engine"
    );
    Assert.equal(
      (await headCreation).engine,
      headEngine,
      "The head interceptor resolves with the real engine"
    );
    Assert.equal(
      unrelatedEngine.pipelineOptions.numThreads,
      2,
      "Unrelated engine options pass through unchanged"
    );
    Assert.equal(
      encoderEngine.pipelineOptions.numThreads,
      1,
      "The encoder receives the thread override"
    );
    Assert.equal(
      headEngine.pipelineOptions.numThreads,
      1,
      "The head receives the thread override"
    );

    const repeatedCreation = MLTestUtils.interceptEngineCreation(
      "formfill-encoder",
      {
        expectedOptions: { backend: "onnx", numThreads: 2 },
        overrides: { numThreads: 1 },
      }
    );
    Assert.notEqual(
      MLEngineParent.prototype.getEngine,
      originalGetEngine,
      "Rearming an engine reinstalls interception"
    );
    const repeatedEngine = await createEngine(
      createOptions("formfill-encoder")
    );
    Assert.equal(
      MLEngineParent.prototype.getEngine,
      originalGetEngine,
      "Consuming the rearmed engine restores getEngine"
    );

    Assert.equal(
      (await repeatedCreation).engine,
      repeatedEngine,
      "The interceptor can be rearmed for the encoder"
    );
    Assert.equal(
      repeatedEngine,
      encoderEngine,
      "Repeated creation reuses the real encoder engine"
    );

    await runEchoEngines(
      [unrelatedEngine, encoderEngine, headEngine],
      remoteClients
    );
  } finally {
    await cleanupTest(cleanup);
  }
});

/**
 * This test case ensures that an engine cannot be armed twice before its
 * expected creation occurs.
 */
add_task(async function test_rejects_duplicate_engine_interceptors() {
  const { cleanup, remoteClients } = await setup();

  const engineCreation = MLTestUtils.interceptEngineCreation(
    "formfill-classification"
  );

  try {
    Assert.throws(
      () => MLTestUtils.interceptEngineCreation("formfill-classification"),
      /already armed/,
      "The same feature cannot be armed twice"
    );

    const engine = await createEngine(createOptions("formfill-classification"));

    Assert.equal(
      (await engineCreation).engine,
      engine,
      "The original interceptor remains armed"
    );

    await runEchoEngines([engine], remoteClients);
  } finally {
    await cleanupTest(cleanup);
  }
});

/**
 * This test case ensures that a WASM engine request can be replaced with native
 * ONNX while still completing real inference.
 */
add_task(async function test_interceptor_overrides_wasm_with_native() {
  const { cleanup } = await setup();

  try {
    if (!(await EngineProcess.requestIsNativeOnnxRuntimeAvailable())) {
      info("Skipping because the native ONNX runtime is unavailable");
      return;
    }

    const engineCreation = MLTestUtils.interceptEngineCreation(
      "formfill-head",
      {
        expectedOptions: { backend: "onnx" },
        overrides: { backend: "onnx-native" },
      }
    );

    const engine = await createEngine(createOptions("formfill-head"));
    const result = await engine.run({ data: "This gets echoed." });

    Assert.equal(
      (await engineCreation).engine,
      engine,
      "The interceptor resolves with the native engine"
    );
    Assert.equal(
      engine.pipelineOptions.backend,
      "onnx-native",
      "The interceptor created a native ONNX engine"
    );
    Assert.equal(
      result.output.echo,
      "This gets echoed.",
      "Inference completes through the native engine"
    );
  } finally {
    await cleanupTest(cleanup);
  }
});

/**
 * This test case ensures that unexpected engine options fail the test task
 * before engine creation proceeds.
 */
add_task(async function test_interceptor_validates_options() {
  const { cleanup } = await setup();

  const engineCreation = MLTestUtils.interceptEngineCreation(
    "formfill-encoder",
    {
      expectedOptions: { backend: "onnx-native", numThreads: 2 },
    }
  );
  const interceptedRejection = engineCreation.catch(error => error);

  try {
    await Assert.rejects(
      createEngine(createOptions("formfill-encoder")),
      /Expected engine option "backend" for "formfill-encoder"/,
      "Engine creation rejects the unexpected backend"
    );
    Assert.stringContains(
      (await interceptedRejection).message,
      'Expected engine option "backend" for "formfill-encoder"',
      "The interceptor rejects the same unexpected backend"
    );
  } finally {
    await cleanupTest(cleanup);
  }
});

/**
 * This test case ensures cleanup restores engine creation before reporting an
 * unconsumed interceptor.
 */
add_task(function test_cleanup_rejects_armed_interceptors_and_restores() {
  const originalGetEngine = MLEngineParent.prototype.getEngine;

  MLTestUtils.interceptEngineCreation("formfill-classification");

  Assert.notEqual(
    MLEngineParent.prototype.getEngine,
    originalGetEngine,
    "Arming an engine replaces getEngine"
  );
  Assert.throws(
    MLTestUtils.cleanupEngineCreationInterceptions,
    /still armed for: formfill-classification/,
    "Cleanup rejects an unconsumed engine interceptor"
  );
  Assert.equal(
    MLEngineParent.prototype.getEngine,
    originalGetEngine,
    "Cleanup restores getEngine before rejecting"
  );
});
