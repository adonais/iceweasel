/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/// <reference path="head.js" />

requestLongerTimeout(2);

const { BACKENDS } = ChromeUtils.importESModule(
  "chrome://global/content/ml/EngineProcess.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { MLUtils } = ChromeUtils.importESModule(
  "chrome://global/content/ml/Utils.sys.mjs"
);

const RAW_PIPELINE_OPTIONS = { taskName: "moz-echo", timeoutMS: -1 };
const PIPELINE_OPTIONS = new PipelineOptions({
  taskName: "moz-echo",
  timeoutMS: -1,
});

async function checkForRemoteType(remoteType) {
  let procinfo3 = await ChromeUtils.requestProcInfo();
  for (const child of procinfo3.children) {
    if (child.type === remoteType) {
      return true;
    }
  }
  return false;
}

const SHARED_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_open_tabs",
      description: "Search open tabs by type.",
      parameters: {
        type: "object",
        properties: { type: { type: "string" } },
        required: ["type"],
      },
    },
  },
];

const BASE_ENGINE_OPTIONS = {
  featureId: "about-inference",
  taskName: "text-generation",
  modelId: "qwen3:0.6b",
  modelRevision: "main",
};

/**
 * End to End test that the engine is indeed initialized with wllama when it is the
 * best-llama.
 */
add_task(async function test_e2e_choose_backend_best_wllama() {
  // Allow any url
  Services.env.set("MOZ_ALLOW_EXTERNAL_ML_HUB", "true");

  const backendData = new Uint8Array([10, 20, 30]);

  const expectedBackendData = JSON.stringify(backendData);

  // Mocking function used in the workers or child doesn't work.
  // So we are stubbing the code run by the worker.
  const workerCode = `
  // Inject the MLEngine.worker.mjs code

  ${await getMLEngineWorkerCode()}

  // Stub
  ChromeUtils.defineESModuleGetters(
  lazy,
  {
    createFileUrl: "chrome://global/content/ml/Utils.sys.mjs",

  },
  { global: "current" }
);

  // Change the getBackend to a mocked version that doesn't actually do inference
  // but does initiate model downloads and engine initialization

  lazy.getBackend = async function (
    mlEngineWorker,
    backendData,
    {
      modelHubUrlTemplate,
      modelHubRootUrl,
      modelId,
      modelRevision,
      modelFile,
      engineId,
    } = {}
  ) {


    const receivedBackendData = JSON.stringify(backendData);
    if (receivedBackendData !== '${expectedBackendData}'){
      throw new Error("BackendData not equal Received: ".concat(receivedBackendData, " Expected: ", '${expectedBackendData}'));
    }

    return {
      run: () => {},
    };
  };
`;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const blobURL = URL.createObjectURL(blob);

  await EngineProcess.destroyMLEngine();
  await IndexedDBCache.init({ reset: true });

  let promiseStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .callsFake(function () {
      return { url: blobURL, options: { type: "module" } };
    });

  let wasmBufferStub = sinon
    .stub(MLEngineParent, "getWasmArrayBuffer")
    .returns(backendData);

  let chooseBestBackendStub = sinon
    .stub(MLEngineParent, "chooseBestBackend")
    .returns(BACKENDS.wllama);

  try {
    await createEngine({
      engineId: "main",
      taskName: "real-wllama-text-generation",
      featureId: "link-preview",
      backend: BACKENDS.bestLlama,
      modelId: "acme/bert",
      modelHubUrlTemplate: "{model}/resolve/{revision}",
      modelRevision: "v0.4",
      modelHubRootUrl:
        "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data",
      modelFile: "onnx/config.json",
    });
  } finally {
    await EngineProcess.destroyMLEngine();
    await IndexedDBCache.init({ reset: true });
    wasmBufferStub.restore();
    promiseStub.restore();
    chooseBestBackendStub.restore();
  }
});

/**
 * End to End test that the engine can indeed fail if it doesn't use best-llama.
 */
add_task(async function test_e2e_choose_backend_can_detect_failure() {
  // Allow any url
  Services.env.set("MOZ_ALLOW_EXTERNAL_ML_HUB", "true");

  const backendData = new Uint8Array([10, 20, 30]);

  const expectedBackendData = JSON.stringify("data so no matches");

  // Mocking function used in the workers or child doesn't work.
  // So we are stubbing the code run by the worker.
  const workerCode = `
  // Inject the MLEngine.worker.mjs code

  ${await getMLEngineWorkerCode()}

  // Stub
  ChromeUtils.defineESModuleGetters(
  lazy,
  {
    createFileUrl: "chrome://global/content/ml/Utils.sys.mjs",

  },
  { global: "current" }
);

  // Change the getBackend to a mocked version that doesn't actually do inference
  // but does initiate model downloads and engine initialization

  lazy.getBackend = async function (
    mlEngineWorker,
    backendData,
    {
      modelHubUrlTemplate,
      modelHubRootUrl,
      modelId,
      modelRevision,
      modelFile,
      engineId,
    } = {}
  ) {


    const receivedBackendData = JSON.stringify(backendData);
    if (receivedBackendData !== '${expectedBackendData}'){
      throw new Error("BackendData not equal Received: ".concat(receivedBackendData, " Expected: ", '${expectedBackendData}'));
    }

    return {
      run: () => {},
    };
  };
`;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const blobURL = URL.createObjectURL(blob);

  await EngineProcess.destroyMLEngine();
  await IndexedDBCache.init({ reset: true });

  let promiseStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .callsFake(function () {
      return { url: blobURL, options: { type: "module" } };
    });

  let wasmBufferStub = sinon
    .stub(MLEngineParent, "getWasmArrayBuffer")
    .returns(backendData);

  let chooseBestBackendStub = sinon
    .stub(MLEngineParent, "chooseBestBackend")
    .returns(BACKENDS.wllama);

  try {
    await Assert.rejects(
      createEngine({
        engineId: "main",
        taskName: "real-wllama-text-generation",
        featureId: "link-preview",
        backend: BACKENDS.bestLlama,
        modelId: "acme/bert",
        modelHubUrlTemplate: "{model}/resolve/{revision}",
        modelRevision: "v0.4",
        modelHubRootUrl:
          "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data",
        modelFile: "onnx/config.json",
      }),
      /BackendData not equal Received:/,
      "The call should be rejected because it used the wrong backend"
    );
  } finally {
    await EngineProcess.destroyMLEngine();
    await IndexedDBCache.init({ reset: true });
    wasmBufferStub.restore();
    promiseStub.restore();
    chooseBestBackendStub.restore();
  }
});

/**
 * End to End test that the engine is indeed initialized with llama.cpp when it is the
 * best-llama.
 */
add_task(async function test_e2e_choose_backend_best_llamma_cpp() {
  // Allow any url
  Services.env.set("MOZ_ALLOW_EXTERNAL_ML_HUB", "true");

  const backendData = new Uint8Array([10, 20, 30]);

  const expectedBackendData = JSON.stringify(null);

  // Mocking function used in the workers or child doesn't work.
  // So we are stubbing the code run by the worker.
  const workerCode = `
  // Inject the MLEngine.worker.mjs code

  ${await getMLEngineWorkerCode()}

  // Stub
  ChromeUtils.defineESModuleGetters(
  lazy,
  {
    createFileUrl: "chrome://global/content/ml/Utils.sys.mjs",

  },
  { global: "current" }
);

  // Change the getBackend to a mocked version that doesn't actually do inference
  // but does initiate model downloads and engine initialization

  lazy.getBackend = async function (
    mlEngineWorker,
    backendData,
    {
      modelHubUrlTemplate,
      modelHubRootUrl,
      modelId,
      modelRevision,
      modelFile,
      engineId,
    } = {}
  ) {


    const receivedBackendData = JSON.stringify(backendData);
    if (receivedBackendData !== '${expectedBackendData}'){
      throw new Error("BackendData not equal Received: ".concat(receivedBackendData, " Expected: ", '${expectedBackendData}'));
    }

    return {
      run: () => {},
    };
  };
`;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const blobURL = URL.createObjectURL(blob);

  await EngineProcess.destroyMLEngine();
  await IndexedDBCache.init({ reset: true });

  let promiseStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .callsFake(function () {
      return { url: blobURL, options: { type: "module" } };
    });

  let wasmBufferStub = sinon
    .stub(MLEngineParent, "getWasmArrayBuffer")
    .returns(backendData);

  let chooseBestBackendStub = sinon
    .stub(MLEngineParent, "chooseBestBackend")
    .returns(BACKENDS.llamaCpp);

  try {
    await createEngine({
      engineId: "main",
      taskName: "real-wllama-text-generation",
      featureId: "link-preview",
      backend: BACKENDS.bestLlama,
      modelId: "acme/bert",
      modelHubUrlTemplate: "{model}/resolve/{revision}",
      modelRevision: "v0.4",
      modelHubRootUrl:
        "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data",
      modelFile: "onnx/config.json",
    });
  } finally {
    await EngineProcess.destroyMLEngine();
    await IndexedDBCache.init({ reset: true });
    wasmBufferStub.restore();
    promiseStub.restore();
    chooseBestBackendStub.restore();
  }
});

/**
 * End to End test that the engine can be cancelled.
 */
add_task(async function test_e2e_engine_can_be_cancelled() {
  // Allow any url
  Services.env.set("MOZ_ALLOW_EXTERNAL_ML_HUB", "true");

  const backendData = new Uint8Array([10, 20, 30]);

  // Mocking function used in the workers or child doesn't work.
  // So we are stubbing the code run by the worker.
  const workerCode = `
  // Inject the MLEngine.worker.mjs code

  ${await getMLEngineWorkerCode()}

  // Stub
  ChromeUtils.defineESModuleGetters(
  lazy,
  {
    createFileUrl: "chrome://global/content/ml/Utils.sys.mjs",

  },
  { global: "current" }
);

  // Change the getBackend to a mocked version that doesn't actually do inference
  // but does initiate model downloads and engine initialization

  lazy.getBackend = async function (
    mlEngineWorker,
    backendData,
    {
      modelHubUrlTemplate,
      modelHubRootUrl,
      modelId,
      modelRevision,
      modelFile,
      engineId,
    } = {}
  ) {

    const url = lazy.createFileUrl({
      model: modelId,
      revision: modelRevision,
      file: modelFile,
      urlTemplate: modelHubUrlTemplate,
      rootUrl: modelHubRootUrl,
    });

    await mlEngineWorker.getModelFile({url});

    return {
      run: () => {},
    };
  };
`;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const blobURL = URL.createObjectURL(blob);

  await EngineProcess.destroyMLEngine();
  await IndexedDBCache.init({ reset: true });

  let promiseStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .callsFake(function () {
      return { url: blobURL, options: { type: "module" } };
    });

  let wasmBufferStub = sinon
    .stub(MLEngineParent, "getWasmArrayBuffer")
    .returns(backendData);

  const controller = new AbortController();
  const { signal } = controller;
  controller.abort();

  try {
    await Assert.rejects(
      createEngine(
        {
          engineId: "main5",
          taskName: "real-wllama-text-generation",
          featureId: "link-preview",
          backend: BACKENDS.llamaCpp,
          modelId: "acme/bert",
          modelHubUrlTemplate: "{model}/resolve/{revision}",
          modelRevision: "v0.1",
          modelHubRootUrl:
            "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data",
          modelFile: "onnx/config.json",
        },
        null,
        signal
      ),
      /AbortError:/,
      "The call should be cancelled"
    );
  } catch (err) {
    Assert.ok(false, `Expected AbortError. Got ${err}`);
  } finally {
    await EngineProcess.destroyMLEngine();
    await IndexedDBCache.init({ reset: true });
    wasmBufferStub.restore();
    promiseStub.restore();
  }
});

/**
 * End to End test that the engine can be cancelled after fetch success.
 */
add_task(async function test_e2e_engine_can_be_cancelled_after_fetch() {
  // Allow any url
  Services.env.set("MOZ_ALLOW_EXTERNAL_ML_HUB", "true");

  const backendData = new Uint8Array([10, 20, 30]);

  // Mocking function used in the workers or child doesn't work.
  // So we are stubbing the code run by the worker.
  const workerCode = `
  // Inject the MLEngine.worker.mjs code

  ${await getMLEngineWorkerCode()}

  // Stub
  ChromeUtils.defineESModuleGetters(
  lazy,
  {
    createFileUrl: "chrome://global/content/ml/Utils.sys.mjs",

  },
  { global: "current" }
);

  // Change the getBackend to a mocked version that doesn't actually do inference
  // but does initiate model downloads and engine initialization

  lazy.getBackend = async function (
    mlEngineWorker,
    backendData,
    {
      modelHubUrlTemplate,
      modelHubRootUrl,
      modelId,
      modelRevision,
      modelFile,
      engineId,
    } = {}
  ) {

    const url = lazy.createFileUrl({
      model: modelId,
      revision: modelRevision,
      file: modelFile,
      urlTemplate: modelHubUrlTemplate,
      rootUrl: modelHubRootUrl,
    });

    await mlEngineWorker.getModelFile({url});

    return {
      run: () => {},
    };
  };
`;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const blobURL = URL.createObjectURL(blob);

  await EngineProcess.destroyMLEngine();
  await IndexedDBCache.init({ reset: true });

  let promiseStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .callsFake(function () {
      return { url: blobURL, options: { type: "module" } };
    });

  let wasmBufferStub = sinon
    .stub(MLEngineParent, "getWasmArrayBuffer")
    .returns(backendData);

  const controller = new AbortController();
  const { signal } = controller;

  const fetchUrlStub = sinon
    .stub(MLUtils, "fetchUrl")
    .callsFake((url, { signal: _, ...rest } = {}) => {
      const p = fetch(url, rest);

      controller.abort();

      return p;
    });

  try {
    await Assert.rejects(
      createEngine(
        {
          engineId: "main5",
          taskName: "real-wllama-text-generation",
          featureId: "link-preview",
          backend: BACKENDS.llamaCpp,
          modelId: "acme/bert",
          modelHubUrlTemplate: "{model}/resolve/{revision}",
          modelRevision: "v0.1",
          modelHubRootUrl:
            "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data",
          modelFile: "onnx/config.json",
        },
        null,
        signal
      ),
      /AbortError:/,
      "The call should be cancelled"
    );
  } catch (err) {
    Assert.ok(false, `Expected AbortError. Got ${err}`);
  } finally {
    await EngineProcess.destroyMLEngine();
    await IndexedDBCache.init({ reset: true });
    wasmBufferStub.restore();
    promiseStub.restore();
    fetchUrlStub.restore();
  }
});

add_task(async function test_ml_engine_basics() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine(RAW_PIPELINE_OPTIONS);

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  const res = await inferencePromise;
  Assert.equal(
    res.output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(res.output.dtype, "q8", "The config was enriched by RS");
  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

add_task(async function test_ml_engine_pick_feature_id() {
  // one record sent back from RS contains featureId
  const records = [
    {
      taskName: "moz-echo",
      modelId: "mozilla/distilvit",
      processorId: "mozilla/distilvit",
      tokenizerId: "mozilla/distilvit",
      modelRevision: "main",
      processorRevision: "main",
      tokenizerRevision: "main",
      dtype: "q8",
      id: "74a71cfd-1734-44e6-85c0-69cf3e874138",
    },
    {
      featureId: "pdfjs-alt-text",
      taskName: "moz-echo",
      modelId: "mozilla/distilvit",
      processorId: "mozilla/distilvit",
      tokenizerId: "mozilla/distilvit",
      modelRevision: "v1.0",
      processorRevision: "v1.0",
      tokenizerRevision: "v1.0",
      dtype: "fp16",
      id: "74a71cfd-1734-44e6-85c0-69cf3e874138",
    },
  ];

  const { cleanup, remoteClients } = await setup({ records });

  info("Get the engine");
  const engineInstance = await createEngine({
    featureId: "pdfjs-alt-text",
    taskName: "moz-echo",
  });

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  const res = await inferencePromise;
  Assert.equal(
    res.output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(
    res.output.dtype,
    "fp16",
    "The config was enriched by RS - using a feature Id"
  );
  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

add_task(async function test_ml_engine_wasm_rejection() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine(RAW_PIPELINE_OPTIONS);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].rejectPendingDownloads(1);
  //await remoteClients.models.resolvePendingDownloads(1);

  let error;
  try {
    await inferencePromise;
  } catch (e) {
    error = e;
  }

  is(
    error?.message,
    "Intentionally rejecting downloads.",
    "The error is correctly surfaced."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Tests that the engineInstanceModel's internal errors are correctly surfaced.
 */
add_task(async function test_ml_engine_model_error() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine(RAW_PIPELINE_OPTIONS);

  info("Run the inference with a throwing example.");
  const inferencePromise = engineInstance.run("throw");

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);
  //await remoteClients.models.resolvePendingDownloads(1);

  let error;
  try {
    await inferencePromise;
  } catch (e) {
    error = e;
  }
  is(
    error?.message,
    'Error: Received the message "throw", so intentionally throwing an error.',
    "The error is correctly surfaced."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * This test is really similar to the "basic" test, but tests manually destroying
 * the engineInstance.
 */
add_task(async function test_ml_engine_destruction() {
  const { cleanup, remoteClients } = await setup();

  info("Get engineInstance");
  const engineInstance = await createEngine(PIPELINE_OPTIONS);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await engineInstance.terminate(
    /* shutDownIfEmpty */ true,
    /* replacement */ false
  );

  info(
    "The engineInstance is manually destroyed. The cleanup function should wait for the engine process to be destroyed."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Tests that we display a nice error message when the pref is off
 */
add_task(async function test_pref_is_off() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.enable", false]],
  });

  info("Get the engine process");
  let error;

  try {
    await EngineProcess.getMLEngineParent();
  } catch (e) {
    error = e;
  }
  is(
    error?.message,
    "MLEngine is disabled. Check the browser.ml prefs.",
    "The error is correctly surfaced."
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.enable", true]],
  });
});

/**
 * Tests the generic pipeline API
 */
add_task(async function test_ml_generic_pipeline() {
  const { cleanup, remoteClients } = await setup();

  info("Get engineInstance");

  const options = new PipelineOptions({
    taskName: "summarization",
    modelId: "test-echo",
    modelRevision: "main",
  });

  const engineInstance = await createEngine(options);

  info("Run the inference");
  const inferencePromise = engineInstance.run({
    args: ["This gets echoed."],
  });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Tests that the engine is reused.
 */
add_task(async function test_ml_engine_reuse_same() {
  const { cleanup, remoteClients } = await setup();

  const options = { taskName: "moz-echo", engineId: "echo" };
  const engineInstance = await createEngine(options);
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  let engineInstance2 = await createEngine(options);
  is(engineInstance2.engineId, "echo", "The engine ID matches");
  is(engineInstance, engineInstance2, "The engine is reused.");
  const inferencePromise2 = engineInstance2.run({ data: "This gets echoed." });
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise2).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Tests that we can have two competing engines
 */
add_task(async function test_ml_two_engines() {
  const { cleanup, remoteClients } = await setup();

  const engineInstance = await createEngine({
    taskName: "moz-echo",
    engineId: "engine1",
  });
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  let engineInstance2 = await createEngine({
    taskName: "moz-echo",
    engineId: "engine2",
  });

  const inferencePromise2 = engineInstance2.run({ data: "This gets echoed." });
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise2).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.notEqual(
    engineInstance.engineId,
    engineInstance2.engineId,
    "Should be different engines"
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Tests that we can have the same engine reinitialized
 */
add_task(async function test_ml_dupe_engines() {
  const { cleanup, remoteClients } = await setup();

  const engineInstance = await createEngine({
    taskName: "moz-echo",
    engineId: "engine1",
  });
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  let engineInstance2 = await createEngine({
    taskName: "moz-echo",
    engineId: "engine1",
    timeoutMS: 2000, // that makes the options different
  });
  const inferencePromise2 = engineInstance2.run({ data: "This gets echoed." });
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise2).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.notEqual(
    engineInstance,
    engineInstance2,
    "Should be different engines"
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

add_task(async function test_ml_engine_override_options() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine({
    taskName: "moz-echo",
    modelRevision: "v1",
  });

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(
    (await inferencePromise).output.modelRevision,
    "v1",
    "The config options goes through and overrides."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Tests a custom model hub
 */
add_task(async function test_ml_custom_hub() {
  const { cleanup, remoteClients } = await setup();

  info("Get engineInstance");

  const options = new PipelineOptions({
    taskName: "summarization",
    modelId: "test-echo",
    modelRevision: "main",
    modelHubRootUrl: "https://example.com",
    modelHubUrlTemplate: "models/{model}/{revision}",
  });

  const engineInstance = await createEngine(options);

  info("Run the inference");
  const inferencePromise = engineInstance.run({
    args: ["This gets echoed."],
  });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  let res = await inferencePromise;

  Assert.equal(
    res.output,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(
    res.config.modelHubRootUrl,
    "https://example.com",
    "The pipeline used the custom hub"
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Make sure we don't get race conditions when running several inference runs in parallel
 *
 */

add_task(async function test_ml_engine_parallel() {
  const { cleanup, remoteClients } = await setup();

  // We're doing 10 calls and each echo call will take from 0 to 1000ms
  // So we're sure we're mixing runs.
  let sleepTimes = [300, 1000, 700, 0, 500, 900, 400, 800, 600, 100];
  let numCalls = 10;

  async function run(x) {
    const engineInstance = await createEngine(RAW_PIPELINE_OPTIONS);

    let msg = `${x} - This gets echoed.`;
    let res = engineInstance.run({
      data: msg,
      sleepTime: sleepTimes[x],
    });

    await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);
    res = await res;

    return res;
  }

  info(`Run ${numCalls} inferences in parallel`);
  let runs = [];
  for (let x = 0; x < numCalls; x++) {
    runs.push(run(x));
  }

  // await all runs
  const results = await Promise.all(runs);
  Assert.equal(results.length, numCalls, `All ${numCalls} were successful`);

  // check that each one got their own stuff
  for (let y = 0; y < numCalls; y++) {
    Assert.equal(
      results[y].output.echo,
      `${y} - This gets echoed.`,
      `Result ${y} is correct`
    );
  }

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

/**
 * Test threading support
 */
add_task(async function test_ml_threading_support() {
  const { cleanup, remoteClients } = await setup();

  info("Get engineInstance");

  const options = new PipelineOptions({
    taskName: "summarization",
    modelId: "test-echo",
    modelRevision: "main",
  });

  const engineInstance = await createEngine(options);

  info("Run the inference");
  const inferencePromise = engineInstance.run({
    args: ["This gets echoed."],
  });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  let res = await inferencePromise;

  ok(res.multiThreadSupported, "Multi-thread should be supported");
  await EngineProcess.destroyMLEngine();
  await cleanup();
});

add_task(async function test_ml_engine_get_status() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine({ taskName: "moz-echo" });

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  const res = await inferencePromise;
  Assert.equal(
    res.output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  const expected = {
    "default-engine": {
      status: "IDLING",
      options: {
        useExternalDataFormat: false,
        engineId: "default-engine",
        featureId: null,
        taskName: "moz-echo",
        timeoutMS: 1000,
        modelHubRootUrl:
          "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data",
        modelHubUrlTemplate: "{model}/{revision}",
        modelId: "mozilla/distilvit",
        modelRevision: "main",
        tokenizerId: "mozilla/distilvit",
        tokenizerRevision: "main",
        processorId: "mozilla/distilvit",
        processorRevision: "main",
        logLevel: "All",
        runtimeFilename: "ort-wasm-simd-threaded.jsep.wasm",
        staticEmbeddingsOptions: null,
        device: null,
        dtype: "q8",
        numThreads: "NOT_COMPARED",
        executionPriority: null,
        kvCacheDtype: null,
        numContext: 1024,
        numBatch: 1024,
        numUbatch: 1024,
        flashAttn: false,
        useMmap: false,
        useMlock: true,
        numThreadsDecoding: null,
        modelFile: null,
        backend: null,
        modelHub: null,
        baseURL: null,
        apiKey: null,
      },
      engineId: "default-engine",
    },
  };

  let status = await engineInstance.mlEngineParent.getStatus();
  status = JSON.parse(JSON.stringify(Object.fromEntries(status)));

  status["default-engine"].options.numThreads = "NOT_COMPARED";
  Assert.deepEqual(status, expected);

  await ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

add_task(async function test_ml_engine_not_enough_memory() {
  const { cleanup } = await setup({
    prefs: [
      ["browser.ml.checkForMemory", true],
      ["browser.ml.minimumPhysicalMemory", 99999],
    ],
  });

  info("Get the greedy engine");

  await Assert.rejects(
    createEngine({
      modelId: "testing/greedy",
      taskName: "moz-echo",
      dtype: "q8",
      numThreads: 1,
      device: "wasm",
    }),
    /Not enough physical memory/,
    "The call should be rejected because of a lack of memory"
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

/**
 * Helper function to create a basic set of valid options
 */
function getValidOptions(overrides = {}) {
  return Object.assign(
    {
      engineId: "validEngine1",
      featureId: "pdfjs-alt-text",
      taskName: "valid_task",
      modelHubRootUrl: "https://example.com",
      modelHubUrlTemplate: "https://example.com/{modelId}",
      timeoutMS: 5000,
      modelId: "validModel",
      modelRevision: "v1",
      tokenizerId: "validTokenizer",
      tokenizerRevision: "v1",
      processorId: "validProcessor",
      processorRevision: "v1",
      logLevel: null,
      runtimeFilename: "runtime.wasm",
      device: InferenceDevice.GPU,
      numThreads: 4,
      executionPriority: ExecutionPriority.NORMAL,
    },
    overrides
  );
}

/**
 * A collection of test cases for invalid and valid values.
 */
const commonInvalidCases = [
  { description: "Invalid value (special characters)", value: "org1/my!value" },
  {
    description: "Invalid value (special characters in organization)",
    value: "org@1/my-value",
  },
  { description: "Invalid value (missing name part)", value: "org1/" },
  {
    description: "Invalid value (invalid characters in name)",
    value: "my$value",
  },
];

const commonValidCases = [
  { description: "Valid organization/name", value: "org1/my-value" },
  { description: "Valid name only", value: "my-value" },
  {
    description: "Valid name with underscores and dashes",
    value: "my_value-123",
  },
  {
    description: "Valid organization with underscores and dashes",
    value: "org_123/my-value",
  },
];

const pipelineOptionsCases = [
  // Invalid cases for various fields
  ...commonInvalidCases.map(test => ({
    description: `Invalid processorId (${test.description})`,
    options: { processorId: test.value },
    expectedError: /Invalid value/,
  })),
  ...commonInvalidCases.map(test => ({
    description: `Invalid tokenizerId (${test.description})`,
    options: { tokenizerId: test.value },
    expectedError: /Invalid value/,
  })),
  ...commonInvalidCases.map(test => ({
    description: `Invalid modelId (${test.description})`,
    options: { modelId: test.value },
    expectedError: /Invalid value/,
  })),

  // Valid cases for various fields
  ...commonValidCases.map(test => ({
    description: `Valid processorId (${test.description})`,
    options: { processorId: test.value },
    expected: { processorId: test.value },
  })),
  ...commonValidCases.map(test => ({
    description: `Valid tokenizerId (${test.description})`,
    options: { tokenizerId: test.value },
    expected: { tokenizerId: test.value },
  })),
  ...commonValidCases.map(test => ({
    description: `Valid modelId (${test.description})`,
    options: { modelId: test.value },
    expected: { modelId: test.value },
  })),

  // Invalid values
  {
    description: "Invalid hub",
    options: { modelHub: "rogue" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid timeoutMS",
    options: { timeoutMS: -3 },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid timeoutMS",
    options: { timeoutMS: 40000000 },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid featureId",
    options: { featureId: "unknown" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid dtype",
    options: { dtype: "invalid_dtype" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid device",
    options: { device: "invalid_device" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid executionPriority",
    options: { executionPriority: "invalid_priority" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid logLevel",
    options: { logLevel: "invalid_log_level" },
    expectedError: /Invalid value/,
  },

  // Valid values
  {
    description: "valid hub",
    options: { modelHub: "huggingface" },
    expected: { modelHub: "huggingface" },
  },
  {
    description: "valid hub",
    options: { modelHub: "mozilla" },
    expected: { modelHub: "mozilla" },
  },
  {
    description: "valid timeoutMS",
    options: { timeoutMS: 12345 },
    expected: { timeoutMS: 12345 },
  },
  {
    description: "valid timeoutMS",
    options: { timeoutMS: -1 },
    expected: { timeoutMS: -1 },
  },

  {
    description: "Valid dtype",
    options: { dtype: QuantizationLevel.FP16 },
    expected: { dtype: QuantizationLevel.FP16 },
  },
  {
    description: "Valid device",
    options: { device: InferenceDevice.WASM },
    expected: { device: InferenceDevice.WASM },
  },
  {
    description: "Valid executionPriority",
    options: { executionPriority: ExecutionPriority.HIGH },
    expected: { executionPriority: ExecutionPriority.HIGH },
  },
  {
    description: "Valid logLevel (Info)",
    options: { logLevel: LogLevel.INFO },
    expected: { logLevel: LogLevel.INFO },
  },
  {
    description: "Valid logLevel (Critical)",
    options: { logLevel: LogLevel.CRITICAL },
    expected: { logLevel: LogLevel.CRITICAL },
  },
  {
    description: "Valid logLevel (All)",
    options: { logLevel: LogLevel.ALL },
    expected: { logLevel: LogLevel.ALL },
  },
  {
    description: "Valid modelId",
    options: { modelId: "Qwen2.5-0.5B-Instruct" },
    expected: { modelId: "Qwen2.5-0.5B-Instruct" },
  },

  // Invalid revision cases
  {
    description: "Invalid revision (random string)",
    options: { modelRevision: "invalid_revision" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid revision (too many version numbers)",
    options: { tokenizerRevision: "v1.0.3.4.5" },
    expectedError: /Invalid value/,
  },
  {
    description: "Invalid revision (unknown suffix)",
    options: { processorRevision: "v1.0.0-unknown" },
    expectedError: /Invalid value/,
  },

  // Valid revision cases with new format
  {
    description: "Valid revision (main)",
    options: { modelRevision: "main" },
    expected: { modelRevision: "main" },
  },
  {
    description: "Valid revision (v-prefixed version with alpha)",
    options: { tokenizerRevision: "v1.2.3-alpha1" },
    expected: { tokenizerRevision: "v1.2.3-alpha1" },
  },
  {
    description:
      "Valid revision (v-prefixed version with beta and dot separator)",
    options: { tokenizerRevision: "v1.2.3.beta2" },
    expected: { tokenizerRevision: "v1.2.3.beta2" },
  },
  {
    description:
      "Valid revision (non-prefixed version with rc and dash separator)",
    options: { processorRevision: "1.0.0-rc3" },
    expected: { processorRevision: "1.0.0-rc3" },
  },
  {
    description:
      "Valid revision (non-prefixed version with pre and dot separator)",
    options: { processorRevision: "1.0.0.pre4" },
    expected: { processorRevision: "1.0.0.pre4" },
  },
  {
    description: "Valid revision (version without suffix)",
    options: { modelRevision: "1.0.0" },
    expected: { modelRevision: "1.0.0" },
  },

  // Valid engineID cases
  {
    description: "Valid engineID (qwen)",
    options: { engineId: "SUM-ONNX-COMMUNITY_QWEN2_5-0_5B-INSTRUCT_BIG" },
    expected: { engineId: "SUM-ONNX-COMMUNITY_QWEN2_5-0_5B-INSTRUCT_BIG" },
  },
];

/**
 * Testing PipelineOption validation
 */
add_task(async function test_pipeline_options_validation() {
  pipelineOptionsCases.forEach(testCase => {
    if (testCase.expectedError) {
      Assert.throws(
        () => new PipelineOptions(getValidOptions(testCase.options)),
        testCase.expectedError,
        `${testCase.description} throws the expected error`
      );
    } else {
      const pipelineOptions = new PipelineOptions(
        getValidOptions(testCase.options)
      );
      Object.keys(testCase.expected).forEach(key => {
        is(
          pipelineOptions[key],
          testCase.expected[key],
          `${testCase.description} sets ${key} correctly`
        );
      });
    }
  });
});

add_task(async function test_ml_engine_infinite_worker() {
  const { cleanup, remoteClients } = await setup();

  const options = { taskName: "moz-echo", timeoutMS: -1 };
  const engineInstance = await createEngine(options);

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  const res = await inferencePromise;
  Assert.equal(
    res.output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(res.output.timeoutMS, -1, "This should be an infinite worker.");
  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

add_task(async function test_ml_engine_model_hub_applied() {
  const options = {
    taskName: "moz-echo",
    timeoutMS: -1,
    modelHub: "huggingface",
  };
  const parsedOptions = new PipelineOptions(options);

  Assert.equal(
    parsedOptions.modelHubRootUrl,
    "https://huggingface.co/",
    "modelHubRootUrl is set"
  );

  Assert.equal(
    parsedOptions.modelHubUrlTemplate,
    "{model}/resolve/{revision}",
    "modelHubUrlTemplate is set"
  );
});

add_task(async function test_ml_engine_blessed_model() {
  const { cleanup, remoteClients } = await setup();

  const options = { taskName: "test-echo" };
  const engineInstance = await createEngine(options);

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  const res = await inferencePromise;

  Assert.equal(
    res.config.modelId,
    "test-echo",
    "The blessed model was picked."
  );

  Assert.equal(res.config.dtype, "q8", "With the right quantization level");

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

add_task(async function test_ml_engine_two_tasknames_in_rs() {
  // RS has two records with the same taskName
  // we should use the modelId match in that case
  const records = [
    {
      taskName: "moz-echo",
      modelId: "mozilla/anothermodel",
      processorId: "mozilla/distilvit",
      tokenizerId: "mozilla/distilvit",
      modelRevision: "main",
      processorRevision: "main",
      tokenizerRevision: "main",
      dtype: "q8",
      id: "74a71cfd-1734-44e6-85c0-69cf3e874138",
    },
    {
      taskName: "moz-echo",
      modelId: "mozilla/distilvit",
      processorId: "mozilla/distilvit",
      tokenizerId: "mozilla/distilvit",
      modelRevision: "v1.0",
      processorRevision: "v1.0",
      tokenizerRevision: "v1.0",
      dtype: "fp16",
      id: "74a71cfd-1734-44e6-85c0-69cf3e874138",
    },
  ];

  const { cleanup, remoteClients } = await setup({ records });

  info("Get the engine");
  const engineInstance = await createEngine({
    featureId: "pdfjs-alt-text",
    taskName: "moz-echo",
  });

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  const res = await inferencePromise;
  Assert.equal(
    res.output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(
    res.output.dtype,
    "fp16",
    "The config was enriched by RS - using a feature Id"
  );
  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();

  await cleanup();
});

add_task(
  async function test_override_ml_engine_pipeline_options_in_allow_list() {
    const { cleanup, remoteClients } = await setup();
    await SpecialPowers.pushPrefEnv({
      set: [
        [
          "browser.ml.overridePipelineOptions",
          '{"about-inference": {"modelRevision": "v0.2.0"}}',
        ],
      ],
    });

    info("Get the engine");
    const engineInstance = await createEngine({
      taskName: "moz-echo",
      featureId: "about-inference",
    });

    info("Check the inference process is running");
    Assert.equal(await checkForRemoteType("inference"), true);

    info("Run the inference");
    const inferencePromise = engineInstance.run({ data: "This gets echoed." });

    info("Wait for the pending downloads.");
    await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

    Assert.equal(
      (await inferencePromise).output.echo,
      "This gets echoed.",
      "The text get echoed exercising the whole flow."
    );

    Assert.equal(
      (await inferencePromise).output.modelRevision,
      "v0.2.0",
      "The config options goes through and overrides."
    );

    ok(
      !EngineProcess.areAllEnginesTerminated(),
      "The engine process is still active."
    );

    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
);

add_task(async function test_override_ml_pipeline_options_not_in_allow_list() {
  const { cleanup, remoteClients } = await setup();
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.ml.overridePipelineOptions",
        '{"about-inferences": {"modelRevision": "v0.2.0"}}',
      ],
    ],
  });

  info("Get the engine");
  const engineInstance = await createEngine({
    taskName: "moz-echo",
    featureId: "about-inference",
  });
  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(
    (await inferencePromise).output.modelRevision,
    "main",
    "The config options goes through and overrides."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

add_task(async function test_override_ml_pipeline_options_unsafe_options() {
  const { cleanup, remoteClients } = await setup();
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.ml.overridePipelineOptions",
        '{"about-inference": {"modelRevision": "v0.2.0", "modelId": "unsafe-model-id"}}',
      ],
    ],
  });

  info("Get the engine");
  const engineInstance = await createEngine({
    taskName: "moz-echo",
    featureId: "about-inference",
  });

  info("Check the inference process is running");
  Assert.equal(await checkForRemoteType("inference"), true);

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text get echoed exercising the whole flow."
  );

  Assert.equal(
    (await inferencePromise).output.modelRevision,
    "v0.2.0",
    "The config options goes through and overrides."
  );

  Assert.equal(
    (await inferencePromise).output.modelId,
    "mozilla/distilvit",
    "The config should not override."
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

add_task(async function test_q8_by_default() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine({
    taskName: "moz-echo",
    modelId: "Xenova/distilbart-cnn-6-6",
    modelHub: "huggingface",
  });

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text gets echoed exercising the whole flow."
  );

  Assert.equal(
    (await inferencePromise).output.dtype,
    "q8",
    "dtype should be set to q8"
  );

  // the model hub sets the revision
  Assert.equal(
    (await inferencePromise).output.modelRevision,
    "main",
    "modelRevision should be main"
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

add_task(async function test_hub_by_default() {
  const { cleanup, remoteClients } = await setup();

  info("Get the engine");
  const engineInstance = await createEngine({
    taskName: "moz-echo",
  });

  info("Run the inference");
  const inferencePromise = engineInstance.run({ data: "This gets echoed." });

  info("Wait for the pending downloads.");
  await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

  Assert.equal(
    (await inferencePromise).output.echo,
    "This gets echoed.",
    "The text gets echoed exercising the whole flow."
  );

  Assert.equal(
    (await inferencePromise).output.modelHubUrlTemplate,
    "{model}/{revision}",
    "Default template should be model/revision"
  );

  Assert.equal(
    (await inferencePromise).output.modelRevision,
    "main",
    "modelRevision should be main"
  );

  ok(
    !EngineProcess.areAllEnginesTerminated(),
    "The engine process is still active."
  );

  await EngineProcess.destroyMLEngine();
  await cleanup();
});

add_task(async function test_openai_client() {
  const records = [
    {
      featureId: "about-inference",
      taskName: "text-generation",
      modelId: "qwen3:0.6b",
      modelRevision: "main",
      id: "74a71cfd-1734-44e6-85c0-69cf3e874138",
    },
  ];
  const { cleanup } = await setup({ records });
  const { server: mockServer, port } = startMockOpenAI({
    echo: "This gets echoed.",
  });

  const engineInstance = await createEngine({
    featureId: "about-inference",
    task: "text-generation",
    modelId: "qwen3:0.6b",
    modelRevision: "main",
    apiKey: "ollama",
    baseURL: `http://localhost:${port}/v1`,
    backend: "openai",
  });

  const request = {
    args: [
      {
        role: "system",
        content:
          "You are a helpful assistant that summarizes text clearly and concisely.",
      },
      {
        role: "user",
        content: `Please summarize the following text:\n\n blah bla`,
      },
    ],
  };

  try {
    info("Run the inference");
    const inferencePromise = engineInstance.run(request);

    const result = await inferencePromise;

    Assert.equal(
      result.finalOutput,
      "This is a mock summary for testing end-to-end flow."
    );
  } finally {
    await EngineProcess.destroyMLEngine();
    await cleanup();
    await stopMockOpenAI(mockServer);
  }
});

add_task(async function test_openai_client_tools_non_streaming() {
  const records = [
    {
      ...BASE_ENGINE_OPTIONS,
      id: "74a71cfd-1734-44e6-85c0-69cf3e874138",
    },
  ];
  const { cleanup } = await setup({ records });
  const { server: mockServer, port } = startMockOpenAI();

  const engineInstance = await createEngine({
    ...BASE_ENGINE_OPTIONS,
    apiKey: "ollama",
    baseURL: `http://localhost:${port}/v1`,
    backend: "openai",
  });

  // First request: ask with tools; server responds with tool_calls
  const requestWithTools = {
    args: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Find my open news tabs." },
    ],
    tools: SHARED_TOOLS,
  };

  try {
    info("Run request that triggers tool calls");
    const result1 = await engineInstance.run(requestWithTools);

    // The pipeline should surface toolCalls from the OpenAI message
    Assert.ok(result1.toolCalls, "toolCalls should exist on the result");
    Assert.equal(result1.toolCalls.length, 1, "Exactly one tool call");
    Assert.equal(
      result1.toolCalls[0].function.name,
      "search_open_tabs",
      "Tool name should match"
    );

    // Second request: append assistant tool_calls + our tool result
    const assistantToolCallsMsg = {
      role: "assistant",
      tool_calls: result1.toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    };

    const toolResultMsg = {
      role: "tool",
      tool_call_id: result1.toolCalls[0].id,
      content: JSON.stringify({ query: "news", allTabs: [] }),
    };

    const followup = await engineInstance.run({
      args: [...requestWithTools.args, assistantToolCallsMsg, toolResultMsg],
      tools: requestWithTools.tools, // still valid to include
    });

    Assert.equal(
      followup.finalOutput,
      "Here are the tabs I found for you.",
      "Should get assistant follow-up after tool result"
    );
  } finally {
    await EngineProcess.destroyMLEngine();
    await cleanup();
    await stopMockOpenAI(mockServer);
  }
});

add_task(async function test_openai_client_tools_streaming() {
  const records = [
    {
      ...BASE_ENGINE_OPTIONS,
      id: "b3b2b661-daa6-4b7f-8d3c-7db0df0dbeef",
    },
  ];
  const { cleanup } = await setup({ records });
  const { server: mockServer, port } = startMockOpenAI();

  const engineInstance = await createEngine({
    ...BASE_ENGINE_OPTIONS,
    apiKey: "ollama",
    baseURL: `http://localhost:${port}/v1`,
    backend: "openai",
  });

  const starter = {
    args: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Find my open news tabs." },
    ],
    tools: SHARED_TOOLS,
    streamOptions: { enabled: true },
  };

  try {
    // --- First turn: expect tool_calls via streaming ---
    const gen = engineInstance.runWithGenerator(starter);

    let toolCalls = null;
    for await (const chunk of gen) {
      // Your MLEngineParent + OpenAIPipeline put toolCalls onto the yielded chunk
      if (chunk.toolCalls && chunk.toolCalls.length) {
        toolCalls = chunk.toolCalls;
        break; // we end the turn when model asks for tools
      }
      // (Optional) you could accumulate chunk.text here; expected empty in this turn
    }

    Assert.ok(toolCalls, "Should receive toolCalls via streaming");
    Assert.equal(toolCalls.length, 1, "One tool call");
    Assert.equal(
      toolCalls[0].function.name,
      "search_open_tabs",
      "Tool name should match"
    );

    // --- Second turn: send tool result, stream final answer ---
    const assistantToolCallsMsg = {
      role: "assistant",
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    };

    const toolResultMsg = {
      role: "tool",
      tool_call_id: toolCalls[0].id,
      content: JSON.stringify({ query: "news", allTabs: [] }),
    };

    const gen2 = engineInstance.runWithGenerator({
      args: [...starter.args, assistantToolCallsMsg, toolResultMsg],
      tools: SHARED_TOOLS,
      streamOptions: { enabled: true },
    });

    let final = "";
    for await (const chunk of gen2) {
      if (chunk.text) {
        final += chunk.text;
      }
    }

    Assert.ok(final.length, "Should stream some final content");
    Assert.equal(
      final,
      "Here are the tabs I found for you.",
      "Should stream the expected assistant follow-up"
    );
  } finally {
    await EngineProcess.destroyMLEngine();
    await cleanup();
    await stopMockOpenAI(mockServer);
  }
});
