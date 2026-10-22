/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { EngineProcess: PerfTestEngineProcess } = ChromeUtils.importESModule(
  "chrome://global/content/ml/EngineProcess.sys.mjs"
);
const { MLEngine: PerfTestMLEngine, MLEngineParent: PerfTestMLEngineParent } =
  ChromeUtils.importESModule(
    "moz-src:///toolkit/components/ml/actors/MLEngineParent.sys.mjs"
  );
const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);
const { sinon: perfTestSinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * This test case ensures every measured lifecycle reports its individual
 * replicates and median without reporting warmups.
 */
add_task(async function test_run_perf_scenario_lifecycles() {
  const contexts = [];
  let message;

  const ctx = {
    Assert,
    registerCleanupFunction,
    info(value) {
      Assert.equal(
        this,
        ctx,
        "The logger retains the initialized test context"
      );
      message = value;
    },
  };

  MLPerfTestUtils.init(ctx);

  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: "TEST",
    metricSuffix: "NATIVE",
    async scenario(context) {
      contexts.push(context);
      return { duration: contexts.length };
    },
    coldIterations: 2,
    warmIterations: 2,
    memoryIterations: 0,
  });

  Assert.deepEqual(
    contexts,
    [
      { lifecycle: "first-use", sampleKind: "latency", iteration: 0 },
      { lifecycle: "cold", sampleKind: "latency", iteration: 0 },
      { lifecycle: "cold", sampleKind: "latency", iteration: 1 },
      { lifecycle: "warm", sampleKind: "warmup", iteration: 0 },
      { lifecycle: "warm", sampleKind: "latency", iteration: 0 },
      { lifecycle: "warm", sampleKind: "latency", iteration: 1 },
    ],
    "The scenario receives each lifecycle and sample kind"
  );
  Assert.deepEqual(
    JSON.parse(message.replace("perfMetrics | ", "")),
    [
      { name: "TEST-duration-first-use-NATIVE", values: [1], value: 1 },
      {
        name: "TEST-duration-cold-NATIVE",
        values: [2, 3],
        value: 2.5,
      },
      { name: "TEST-duration-warm-NATIVE", values: [5, 6], value: 5.5 },
    ],
    "Only measured scenario invocations are reported"
  );
});

/**
 * This test case ensures an unreported first use still populates caches before
 * the first cold measurement.
 */
add_task(async function test_run_perf_scenario_unreported_first_use() {
  const contexts = [];
  let message;

  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info(value) {
      message = value;
    },
  });

  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: "TEST",
    async scenario(context) {
      contexts.push(context);
      return { duration: contexts.length };
    },
    measureFirstUse: false,
    coldIterations: 1,
    warmIterations: 0,
    memoryIterations: 0,
  });

  Assert.deepEqual(
    contexts,
    [
      { lifecycle: "first-use", sampleKind: "warmup", iteration: 0 },
      { lifecycle: "cold", sampleKind: "latency", iteration: 0 },
    ],
    "First use runs without being measured"
  );
  Assert.deepEqual(
    JSON.parse(message.replace("perfMetrics | ", "")),
    [{ name: "TEST-duration-cold", values: [2], value: 2 }],
    "Only the cold invocation is reported"
  );
});

/**
 * This test case ensures the runner reports shared and peak memory while
 * reusing one engine within each warm measurement phase.
 */
add_task(async function test_run_perf_scenario_reports_engine_metrics() {
  const { cleanup, remoteClients } = await setup();
  const warmEngines = [];
  let engine;
  let message;

  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info(value) {
      message = value;
    },
  });

  try {
    await MLPerfTestUtils.runPerfScenario({
      metricPrefix: "TEST",
      metricSuffix: "NATIVE",
      engines: [
        {
          featureId: "formfill-classification",
          overrides: {
            numThreads: { expectValue: 2, replaceWith: 1 },
          },
        },
      ],
      async scenario(context) {
        let created = false;

        if (!engine || ["closed", "error"].includes(engine.engineStatus)) {
          engine = await createEngine({
            backend: "onnx",
            featureId: "formfill-classification",
            numThreads: 2,
            taskName: "moz-echo",
            timeoutMS: -1,
          });
          created = true;
        }

        const run = engine.run({ data: "Shared metrics" });

        if (created) {
          await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);
        }

        const result = await run;

        if (context.lifecycle === "warm") {
          warmEngines.push(engine);
        }

        Assert.equal(
          result.output.echo,
          "Shared metrics",
          "The production engine completes inference"
        );

        return { duration: 5 };
      },
      coldIterations: 0,
      warmIterations: 1,
      memoryIterations: 1,
    });

    const metrics = JSON.parse(message.replace("perfMetrics | ", ""));
    const metricsByName = new Map(metrics.map(metric => [metric.name, metric]));

    Assert.equal(
      metrics.length,
      10,
      "Only feature-owned and shared engine measurements are reported"
    );
    Assert.deepEqual(
      metricsByName.get("TEST-duration-first-use-NATIVE"),
      { name: "TEST-duration-first-use-NATIVE", values: [5], value: 5 },
      "The feature-owned measurement is preserved"
    );
    Assert.deepEqual(
      metricsByName.get("TEST-duration-warm-NATIVE"),
      { name: "TEST-duration-warm-NATIVE", values: [5], value: 5 },
      "The warm feature measurement is preserved"
    );
    Assert.equal(
      warmEngines.length,
      3,
      "Warmup, warm and memory runs happened"
    );
    Assert.equal(
      new Set(warmEngines).size,
      1,
      "Warm latency and memory reuse the warmup engine"
    );

    const peakMemory = metricsByName.get("TEST-peak-memory-NATIVE");

    Assert.equal(peakMemory.values.length, 1, "Peak memory has one sample");
    Assert.greater(peakMemory.value, 0, "Peak memory is positive");

    for (const name of [
      "engine-creation-time",
      "engine-run-time",
      "memory-before-run",
      "memory-after-run",
    ]) {
      const lifecycles =
        name === "engine-creation-time" ? ["first-use"] : ["first-use", "warm"];

      for (const lifecycle of lifecycles) {
        const metric = metricsByName.get(`TEST-${name}-${lifecycle}-NATIVE`);

        Assert.ok(metric, `${name} is reported for ${lifecycle}`);
        Assert.equal(
          metric.values.length,
          1,
          `${name} has one ${lifecycle} replicate`
        );
        Assert.ok(
          Number.isFinite(metric.value),
          `${name} has a finite ${lifecycle} median`
        );
      }
    }
  } finally {
    await PerfTestEngineProcess.destroyMLEngine();
    await cleanup();
  }
});

/**
 * This test case ensures final engine teardown still runs when a performance
 * scenario rejects.
 */
add_task(async function test_run_perf_scenario_cleans_up_after_failure() {
  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info() {},
  });
  const destroySpy = perfTestSinon.spy(
    PerfTestEngineProcess,
    "destroyMLEngine"
  );

  try {
    await Assert.rejects(
      MLPerfTestUtils.runPerfScenario({
        metricPrefix: "TEST",
        async scenario() {
          throw new Error("Expected scenario failure");
        },
        coldIterations: 0,
        warmIterations: 0,
        memoryIterations: 0,
      }),
      /Expected scenario failure/,
      "The scenario failure is propagated"
    );
    Assert.equal(
      destroySpy.callCount,
      2,
      "Engines are destroyed before first use and again after failure"
    );
  } finally {
    destroySpy.restore();
  }
});

/**
 * This test case ensures the runner observes configured engines, passes
 * unrelated engines through, and restores production methods.
 */
add_task(async function test_run_perf_scenario_observes_real_engines() {
  const { cleanup, remoteClients } = await setup();
  const originalGetEngine = PerfTestMLEngineParent.prototype.getEngine;
  const originalRun = PerfTestMLEngine.prototype.run;
  let message;

  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info(value) {
      message = value;
    },
  });

  try {
    await MLPerfTestUtils.runPerfScenario({
      metricPrefix: "TEST",
      engines: [
        {
          featureId: "formfill-encoder",
          metricName: "encoder",
          overrides: {
            numThreads: { expectValue: 2, replaceWith: 1 },
          },
        },
        {
          featureId: "formfill-head",
          metricName: "head",
          overrides: {
            numThreads: { expectValue: 2, replaceWith: 1 },
          },
        },
      ],
      async scenario() {
        const featureIds = [
          "formfill-encoder",
          "formfill-head",
          "about-inference",
        ];
        const engines = await Promise.all(
          featureIds.map(featureId =>
            createEngine({
              backend: "onnx",
              featureId,
              numThreads: 2,
              taskName: "moz-echo",
            })
          )
        );
        const runs = engines.map((engine, index) =>
          engine.run({ data: `Engine ${index}` })
        );

        await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(
          engines.length
        );
        const results = await Promise.all(runs);

        Assert.deepEqual(
          results.map(result => result.output.echo),
          ["Engine 0", "Engine 1", "Engine 2"],
          "Every production engine completes inference"
        );
        Assert.deepEqual(
          engines.map(engine => engine.pipelineOptions.numThreads),
          [1, 1, 2],
          "Configured engines receive overrides and the unrelated engine does not"
        );

        return { duration: 5 };
      },
      coldIterations: 0,
      warmIterations: 0,
      memoryIterations: 0,
    });

    const metrics = JSON.parse(message.replace("perfMetrics | ", ""));
    const metricsByName = new Map(metrics.map(metric => [metric.name, metric]));

    Assert.equal(
      metrics.length,
      9,
      "Only the feature and configured engines report measurements"
    );
    Assert.deepEqual(
      metricsByName.get("TEST-duration-first-use"),
      { name: "TEST-duration-first-use", values: [5], value: 5 },
      "The feature measurement is reported"
    );

    for (const engineName of ["encoder", "head"]) {
      for (const metricName of [
        "engine-creation-time",
        "engine-run-time",
        "memory-before-run",
        "memory-after-run",
      ]) {
        const metric = metricsByName.get(
          `TEST-${engineName}-${metricName}-first-use`
        );

        Assert.ok(metric, `${engineName} reports ${metricName}`);
        Assert.equal(metric.values.length, 1, "The metric has one replicate");
      }
    }
    Assert.equal(
      PerfTestMLEngineParent.prototype.getEngine,
      originalGetEngine,
      "Engine creation interception is restored"
    );
    Assert.equal(
      PerfTestMLEngine.prototype.run,
      originalRun,
      "Engine run observation is restored"
    );
  } finally {
    await PerfTestEngineProcess.destroyMLEngine();
    await cleanup();
  }
});

/**
 * This test case ensures cleanup restores the production run method before
 * rejecting unfinished inference.
 */
add_task(async function test_run_perf_scenario_rejects_an_active_engine_run() {
  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info() {},
  });
  const { cleanup, remoteClients } = await setup();
  let finishRun;
  const runStub = perfTestSinon
    .stub(PerfTestMLEngine.prototype, "run")
    .callsFake(
      () =>
        new Promise(resolve => {
          finishRun = resolve;
        })
    );
  let runPromise;

  try {
    await Assert.rejects(
      MLPerfTestUtils.runPerfScenario({
        metricPrefix: "TEST",
        engines: [{ featureId: "formfill-classification" }],
        async scenario() {
          const engine = await createEngine({
            backend: "onnx",
            featureId: "formfill-classification",
            taskName: "moz-echo",
          });

          await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);
          runPromise = engine.run({});

          return { duration: 1 };
        },
        coldIterations: 0,
        warmIterations: 0,
        memoryIterations: 0,
      }),
      /1 engine run was still active during cleanup/,
      "Cleanup rejects an unfinished engine run"
    );

    Assert.equal(
      PerfTestMLEngine.prototype.run,
      runStub,
      "The production run method is restored before cleanup rejects"
    );
  } finally {
    finishRun?.({});
    await runPromise;
    runStub.restore();
    await cleanup();
  }
});

/**
 * This test case ensures completed and intentionally abandoned generators
 * report generation metrics without fabricating final resources.
 */
add_task(async function test_run_perf_scenario_observes_generator_lifecycles() {
  const { cleanup, remoteClients } = await setup();
  const runWithGeneratorStub = perfTestSinon
    .stub(PerfTestMLEngine.prototype, "runWithGenerator")
    .callsFake(async function* () {
      yield { text: "", tokens: [10, 11], isPrompt: true };
      await TestUtils.waitForTick();
      yield { text: "A", tokens: [1], isPrompt: false };
      await TestUtils.waitForTick();
      yield { text: "B", tokens: [2], isPrompt: false };
      return {
        resourcesBefore: { cpuTime: 1, memory: 2 * 1024 * 1024 },
        resourcesAfter: { cpuTime: 2, memory: 3 * 1024 * 1024 },
        metrics: {
          decodingTime: 10,
          inputTokens: 2,
          outputTokens: 2,
        },
      };
    });
  let message;

  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info(value) {
      message = value;
    },
  });

  try {
    await MLPerfTestUtils.runPerfScenario({
      metricPrefix: "TEST",
      engines: [{ featureId: "link-preview", expectedRuns: 2 }],
      async scenario() {
        const engine = await createEngine({
          backend: "onnx",
          featureId: "link-preview",
          taskName: "moz-echo",
        });

        await remoteClients["ml-onnx-runtime"].resolvePendingDownloads(1);

        const chunks = [];

        for await (const chunk of engine.runWithGenerator({})) {
          if (!chunk.isPrompt) {
            chunks.push(chunk.text);
          }
        }

        Assert.deepEqual(
          chunks,
          ["A", "B"],
          "The production chunks pass through"
        );

        for await (const chunk of engine.runWithGenerator({})) {
          if (chunk.text === "B") {
            break;
          }
        }

        return { duration: 5 };
      },
      coldIterations: 0,
      warmIterations: 0,
      memoryIterations: 0,
    });

    const metrics = JSON.parse(message.replace("perfMetrics | ", ""));
    const metricsByName = new Map(metrics.map(metric => [metric.name, metric]));

    for (const name of [
      "engine-run-time",
      "time-to-first-token",
      "tokens-per-second",
      "output-tokens",
    ]) {
      Assert.equal(
        metricsByName.get(`TEST-${name}-first-use`).values.length,
        2,
        `${name} includes the completed and abandoned runs`
      );
    }

    Assert.deepEqual(
      metricsByName.get("TEST-output-tokens-first-use").values,
      [2, 2],
      "output-tokens counts the completed and abandoned streams"
    );

    for (const [name, expectedValue] of [
      ["memory-before-run", 2],
      ["memory-after-run", 3],
      ["decoding-time", 10],
      ["input-tokens", 2],
    ]) {
      Assert.deepEqual(
        metricsByName.get(`TEST-${name}-first-use`).values,
        [expectedValue],
        `${name} includes only the completed run`
      );
    }
    Assert.equal(
      PerfTestMLEngine.prototype.runWithGenerator,
      runWithGeneratorStub,
      "The production generator method is restored"
    );
  } finally {
    runWithGeneratorStub.restore();
    await cleanup();
  }
});

/**
 * This test case ensures MOZ_ML_LLAMA_HWINFERENCE routes llama.cpp engines to
 * TextGenerationEngine, observes its text-only streams through the engine's own
 * token metrics, and suffixes every series.
 */
add_task(async function test_run_perf_scenario_observes_hwinference_engines() {
  const { TextGenerationEngine } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/ml/textgeneration/TextGenerationEngine.sys.mjs"
  );
  const pref = "browser.ml.llama.hwInference";
  const createStub = perfTestSinon
    .stub(TextGenerationEngine, "create")
    .callsFake(async pipelineOptions => {
      const engine = Object.create(TextGenerationEngine.prototype);
      engine.pipelineOptions = pipelineOptions;
      return engine;
    });
  const runWithGeneratorStub = perfTestSinon
    .stub(TextGenerationEngine.prototype, "runWithGenerator")
    .callsFake(async function* () {
      await TestUtils.waitForTick();
      yield { text: "A", tokens: [], isPrompt: false };
      await TestUtils.waitForTick();
      yield { text: "B", tokens: [], isPrompt: false };
      yield { text: "", tokens: [], isPrompt: false };
      return {
        resourcesBefore: { cpuTime: 1, memory: 2 * 1024 * 1024 },
        resourcesAfter: { cpuTime: 2, memory: 3 * 1024 * 1024 },
        metrics: {
          decodingTime: 10,
          inputTokens: 2,
          outputTokens: 4,
          tokensPerSecond: 400,
        },
      };
    });
  const prefValue = Services.prefs.getBoolPref(pref);
  let message;

  MLPerfTestUtils.init({
    Assert,
    registerCleanupFunction,
    info(value) {
      message = value;
    },
  });

  Services.env.set("MOZ_ML_LLAMA_HWINFERENCE", "1");

  try {
    await MLPerfTestUtils.runPerfScenario({
      metricPrefix: "TEST",
      engines: [{ featureId: "link-preview" }],
      async scenario() {
        Assert.ok(
          Services.prefs.getBoolPref(pref),
          "The scenario runs with llama.cpp routed to HWInference"
        );

        const engine = await createEngine({
          backend: "llama.cpp",
          featureId: "link-preview",
          taskName: "text-generation",
          modelId: "Mozilla/test-llama",
          modelFile: "model.gguf",
        });

        Assert.ok(
          engine instanceof TextGenerationEngine,
          "The llama.cpp engine is served by TextGenerationEngine"
        );

        for await (const chunk of engine.runWithGenerator({})) {
          info(`chunk: ${chunk.text}`);
        }

        return { duration: 5 };
      },
      coldIterations: 0,
      warmIterations: 0,
      memoryIterations: 0,
    });

    const metrics = JSON.parse(message.replace("perfMetrics | ", ""));
    const metricsByName = new Map(metrics.map(metric => [metric.name, metric]));

    Assert.ok(
      metrics.every(metric => metric.name.endsWith("-first-use-HWINF")),
      "Every series carries the HWInference tag"
    );

    for (const name of [
      "engine-creation-time",
      "engine-run-time",
      "time-to-first-token",
    ]) {
      Assert.equal(
        metricsByName.get(`TEST-${name}-first-use-HWINF`).values.length,
        1,
        `${name} is reported for the HWInference engine`
      );
    }

    for (const [name, expectedValue] of [
      ["output-tokens", 4],
      ["tokens-per-second", 400],
      ["decoding-time", 10],
      ["input-tokens", 2],
      ["memory-after-run", 3],
    ]) {
      Assert.deepEqual(
        metricsByName.get(`TEST-${name}-first-use-HWINF`).values,
        [expectedValue],
        `${name} comes from the engine-reported run`
      );
    }

    Assert.equal(
      Services.prefs.getBoolPref(pref),
      prefValue,
      "The HWInference pref is restored"
    );
    Assert.equal(
      TextGenerationEngine.create,
      createStub,
      "HWInference engine creation interception is restored"
    );
    Assert.equal(
      TextGenerationEngine.prototype.runWithGenerator,
      runWithGeneratorStub,
      "HWInference engine run observation is restored"
    );
  } finally {
    Services.env.set("MOZ_ML_LLAMA_HWINFERENCE", "");
    runWithGeneratorStub.restore();
    createStub.restore();
  }
});
