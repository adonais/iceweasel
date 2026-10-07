/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import {
 *   EngineCreationInterceptionOptions,
 *   EngineFeatureIds,
 *   MLPerfEngineConfig,
 *   MLPerfEngineRunDetails,
 *   MLPerfEngineRunCapture,
 *   MLPerfEngineRunObservation,
 *   MLPerfJournal,
 *   MLPerfLifecycle,
 *   MLPerfMeasurements,
 *   MLPerfObservedRunResult,
 *   MLPerfScenario,
 *   MLPerfScenarioContext,
 *   MLPerfScenarioInvocationOptions,
 *   MLPerfScenarioObservation,
 *   MLPerfTestContext,
 *   PeakInferenceMemorySampler,
 *   RunPerfScenarioConfig,
 * } from "../ml.d.ts"
 */

import { EngineProcess } from "chrome://global/content/ml/EngineProcess.sys.mjs";
import { getInferenceProcessInfo } from "chrome://global/content/ml/Utils.sys.mjs";
import {
  MLEngine,
  MLEngineParent,
} from "moz-src:///toolkit/components/ml/actors/MLEngineParent.sys.mjs";
import { MLTestUtils } from "resource://testing-common/MLTestUtils.sys.mjs";
import {
  clearInterval,
  setInterval,
} from "resource://gre/modules/Timer.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/** The number of bytes in one mebibyte. */
const ONE_MIB = 1024 * 1024;

/** Series tags for the ONNX backends a CI task can pin. */
const BACKEND_TAGS = { "onnx-native": "NATIVE", onnx: "WASM" };

/** The ONNX backends a pinned engine may resolve to. */
const ONNX_BACKENDS = Object.keys(BACKEND_TAGS);

/**
 * The run capture currently attached to MLEngine.
 *
 * @type {MLPerfEngineRunCapture | null}
 */
let activeEngineRunCapture = null;

/**
 * Reads the ONNX backend pinned by the MOZ_ML_BACKENDS environment variable,
 * which CI sets per task so each backend runs as its own job.
 *
 * @returns {string | null} The pinned backend.
 */
function pinnedBackend() {
  const backend = Services.env.get("MOZ_ML_BACKENDS");

  if (!backend) {
    return null;
  }

  if (backend.includes(",")) {
    throw new Error("MOZ_ML_BACKENDS pins a single backend per job.");
  }

  return backend;
}

/**
 * Pins every observed engine that lets production choose its ONNX backend to
 * the given backend when it is created.
 *
 * @param {MLPerfEngineConfig[]} engines - The configured engines.
 * @param {string} backend - The pinned backend.
 * @returns {MLPerfEngineConfig[]} The engines with the backend override.
 */
function pinEngineBackends(engines, backend) {
  return engines.map(engine => ({
    ...engine,
    overrides: {
      ...engine.overrides,
      backend: { expectValue: "best-onnx", replaceWith: backend },
    },
  }));
}

/**
 * Calculates the median of a non-empty series.
 *
 * @param {number[]} values - The values to summarize.
 * @returns {number} The median value.
 */
function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Terminates every ML engine and waits for shutdown to finish.
 *
 * @returns {Promise<void>}
 */
async function destroyEngines() {
  await EngineProcess.destroyMLEngine();
  await TestUtils.waitForCondition(
    () => EngineProcess.areAllEnginesTerminated(),
    "Waiting for all ML engines to terminate"
  );
}

/**
 * Samples inference-process memory until stopped.
 *
 * @param {number} [intervalMs=100] - The sampling interval.
 * @returns {PeakInferenceMemorySampler} The active sampler.
 */
function startPeakInferenceMemorySampler(intervalMs = 100) {
  let peakMemory = 0;
  let samplingError = null;
  let sampleChain = Promise.resolve();

  /**
   * Adds one serialized inference-process memory sample.
   *
   * @returns {void}
   */
  const sample = () => {
    sampleChain = sampleChain
      .then(async () => {
        const { memory } = await getInferenceProcessInfo();
        if (Number.isFinite(memory)) {
          peakMemory = Math.max(peakMemory, memory);
        }
      })
      .catch(error => {
        samplingError ??= error;
      });
  };

  sample();
  const intervalId = setInterval(sample, intervalMs);

  return {
    /**
     * Stops sampling after a final sample.
     *
     * @returns {Promise<number>} The peak memory in MiB.
     */
    async stop() {
      clearInterval(intervalId);
      sample();
      await sampleChain;

      if (samplingError) {
        throw samplingError;
      }

      return Math.round(peakMemory / ONE_MIB);
    },
  };
}

/**
 * Creates low-level interception options from performance-test overrides.
 *
 * @param {MLPerfEngineConfig["overrides"]} [overrides={}] - The performance
 *   overrides.
 * @returns {EngineCreationInterceptionOptions} The expected and replacement
 *   engine options.
 */
function createInterceptionOptions(overrides = {}) {
  const expectedOptions = {};
  const replacementOptions = {};

  for (const [name, override] of Object.entries(overrides)) {
    if (
      !override ||
      !Object.hasOwn(override, "expectValue") ||
      !Object.hasOwn(override, "replaceWith")
    ) {
      throw new TypeError(
        `The "${name}" override must define expectValue and replaceWith.`
      );
    }

    expectedOptions[name] = override.expectValue;
    replacementOptions[name] = override.replaceWith;
  }

  return { expectedOptions, overrides: replacementOptions };
}

/**
 * Validates and indexes the engines measured by a scenario.
 *
 * @param {MLPerfEngineConfig[]} engines - The configured engines.
 * @returns {Map<string, MLPerfEngineConfig>} Engines keyed by feature ID.
 */
function indexEngines(engines) {
  const enginesByFeatureId = new Map();

  for (const engine of engines) {
    if (!engine.featureId) {
      throw new TypeError("Each measured engine must have a featureId.");
    }

    if (enginesByFeatureId.has(engine.featureId)) {
      throw new Error(
        `The engine feature ID "${engine.featureId}" is configured more than once.`
      );
    }

    enginesByFeatureId.set(engine.featureId, engine);
  }

  return enginesByFeatureId;
}

/**
 * Captures completed runs for a set of engine features until cleanup.
 *
 * @param {Map<string, MLPerfEngineConfig>} enginesByFeatureId - Engines keyed by feature ID.
 * @returns {MLPerfEngineRunCapture} The observations and cleanup callback.
 */
function startEngineRunCapture(enginesByFeatureId) {
  /** @type {MLPerfEngineRunObservation[]} */
  const engineRuns = [];

  if (!enginesByFeatureId.size) {
    return {
      engineRuns,

      /**
       * Completes cleanup when no engine methods were replaced.
       *
       * @returns {void}
       */
      cleanup() {},
    };
  }

  if (activeEngineRunCapture) {
    throw new Error("Another engine run capture is already active.");
  }

  const originalRun = MLEngine.prototype.run;
  const originalRunWithGenerator = MLEngine.prototype.runWithGenerator;
  let activeRuns = 0;

  /**
   * Records a completed engine run.
   *
   * @param {MLEngine<EngineFeatureIds>} engine - The engine that completed the
   *   run.
   * @param {MLPerfEngineConfig} config - The measured engine configuration.
   * @param {number} start - The run start time.
   * @param {MLPerfObservedRunResult | undefined} result - The completed run
   *   result.
   * @param {MLPerfEngineRunDetails} details - Generation measurements.
   * @returns {void}
   */
  const recordRun = (engine, config, start, result, details) => {
    engineRuns.push({
      featureId: config.featureId,
      engine,
      start,
      end: ChromeUtils.now(),
      resourcesBefore: result?.resourcesBefore,
      resourcesAfter: result?.resourcesAfter,
      ...details,
    });
  };

  /**
   * Returns the measured configuration for an engine.
   *
   * @param {MLEngine<EngineFeatureIds>} engine - The engine to inspect.
   * @returns {MLPerfEngineConfig | null} The measured configuration.
   */
  const configForEngine = engine =>
    enginesByFeatureId.get(engine.pipelineOptions.featureId) ?? null;

  MLEngine.prototype.run = async function (request) {
    const config = configForEngine(this);
    if (!config) {
      return originalRun.call(this, request);
    }

    const start = ChromeUtils.now();
    activeRuns++;

    try {
      const result = await originalRun.call(this, request);
      recordRun(this, config, start, result, {});

      return result;
    } finally {
      activeRuns--;
    }
  };

  MLEngine.prototype.runWithGenerator = async function* (request) {
    const config = configForEngine(this);
    if (!config) {
      return yield* originalRunWithGenerator.call(this, request);
    }

    const start = ChromeUtils.now();
    const generator = originalRunWithGenerator.call(this, request);
    let completed = false;
    let failed = false;
    let firstTokenTime = null;
    let firstChunkTokens = 0;
    let lastTokenTime = null;
    let outputTokens = 0;
    let result;
    activeRuns++;

    try {
      while (true) {
        const step = await generator.next();

        if (step.done) {
          result = step.value;
          completed = true;
          break;
        }

        const chunk = step.value;
        const tokenCount = chunk.tokens?.length ?? 0;

        if (chunk.isPrompt) {
          yield chunk;
          continue;
        }

        if (tokenCount) {
          const now = ChromeUtils.now();

          if (firstTokenTime === null) {
            firstTokenTime = now;
            firstChunkTokens = tokenCount;
          }

          lastTokenTime = now;
          outputTokens += tokenCount;
        }

        yield chunk;
      }

      return result;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        if (!completed) {
          await generator.return(undefined);
        }

        if (!failed) {
          /** @type {MLPerfEngineRunDetails} */
          const details = { outputTokens };
          const metrics = result?.metrics;

          if (metrics?.inputTokens != null) {
            details.inputTokens = metrics.inputTokens;
          }

          if (metrics?.decodingTime != null) {
            details.decodingTime = metrics.decodingTime;
          }

          if (firstTokenTime !== null && lastTokenTime !== null) {
            details.timeToFirstToken = firstTokenTime - start;

            const generationTime = lastTokenTime - firstTokenTime;
            const timedOutputTokens = outputTokens - firstChunkTokens;

            if (generationTime > 0 && timedOutputTokens > 0) {
              details.tokensPerSecond =
                timedOutputTokens / (generationTime / 1000);
            }
          }

          recordRun(this, config, start, result, details);
        }
      } finally {
        activeRuns--;
      }
    }
  };

  /** @type {MLPerfEngineRunCapture} */
  const capture = {
    engineRuns,

    /**
     * Restores the production run methods and verifies all runs finished.
     *
     * @returns {void}
     */
    cleanup() {
      MLEngine.prototype.run = originalRun;
      MLEngine.prototype.runWithGenerator = originalRunWithGenerator;
      activeEngineRunCapture = null;

      if (activeRuns) {
        throw new Error(
          `${activeRuns} engine run${activeRuns === 1 ? " was" : "s were"} still active during cleanup.`
        );
      }
    },
  };

  activeEngineRunCapture = capture;
  return capture;
}

/**
 * Measures one feature scenario invocation without lifecycle orchestration or
 * reporting.
 *
 * @param {MLPerfScenario} scenario - The production feature interaction.
 * @param {MLPerfScenarioContext} context - The scenario invocation context.
 * @param {MLPerfScenarioInvocationOptions} [options={}] - Observation options.
 * @param {MLPerfEngineConfig[]} [options.engines=[]] - Engines to observe.
 * @param {boolean} [options.captureEngineCreation=true] - Whether engine
 *   creation should be intercepted.
 * @param {boolean} [options.samplePeakMemory=false] - Whether peak memory is sampled.
 * @param {number} [options.peakMemorySampleIntervalMs=100] - Delay between memory samples.
 * @returns {Promise<MLPerfScenarioObservation>} The scenario and engine measurements.
 */
async function measureScenarioInvocation(
  scenario,
  context,
  {
    engines = [],
    captureEngineCreation = true,
    samplePeakMemory = false,
    peakMemorySampleIntervalMs = 100,
  } = {}
) {
  const enginesByFeatureId = indexEngines(engines);
  let creationPromises = [];
  /** @type {MLPerfEngineRunCapture | null} */
  let runCapture = null;
  let sampler = null;
  let measurements;
  let peakMemory;

  try {
    runCapture = startEngineRunCapture(enginesByFeatureId);

    if (captureEngineCreation && enginesByFeatureId.size) {
      creationPromises = Array.from(enginesByFeatureId.values(), engine => ({
        engine,
        promise: MLTestUtils.interceptEngineCreation(
          engine.featureId,
          createInterceptionOptions(engine.overrides)
        ).then(
          creation => ({ creation }),
          error => ({ error })
        ),
      }));
    }

    sampler = samplePeakMemory
      ? startPeakInferenceMemorySampler(peakMemorySampleIntervalMs)
      : null;
    measurements = await scenario(context);
  } finally {
    try {
      if (captureEngineCreation && enginesByFeatureId.size) {
        MLTestUtils.cleanupEngineCreationInterceptions();
      }
    } finally {
      try {
        runCapture?.cleanup();
      } finally {
        peakMemory = sampler ? await sampler.stop() : undefined;
      }
    }
  }

  const engineCreations = await Promise.all(
    creationPromises.map(async ({ engine, promise }) => {
      const result = await promise;

      if ("error" in result) {
        throw result.error;
      }

      const { start, end } = result.creation;

      return {
        featureId: engine.featureId,
        start,
        end,
      };
    })
  );

  return {
    measurements,
    engineCreations,
    engineRuns: runCapture.engineRuns,
    peakMemory,
  };
}

/**
 * Creates a journal for MozPerftest measurement series.
 *
 * @param {MLPerfTestContext} ctx - The calling test's context.
 * @param {string} [metricSuffix=""] - Suffix applied to every series name.
 * @returns {MLPerfJournal} The measurement journal.
 */
function createJournal(ctx, metricSuffix = "") {
  /** @type {Map<string, number[]>} */
  const series = new Map();

  return {
    /**
     * Adds a value to a measurement series.
     *
     * @param {string} name - The complete series name.
     * @param {number} value - The measured value.
     * @returns {void}
     */
    add(name, value) {
      const seriesName = metricSuffix ? `${name}-${metricSuffix}` : name;

      ctx.Assert.ok(
        Number.isFinite(value),
        `${seriesName} is a finite measurement`
      );

      if (!series.has(seriesName)) {
        series.set(seriesName, []);
      }

      series.get(seriesName).push(value);
    },

    /**
     * Reports every series in the MozPerftest output format.
     *
     * @returns {void}
     */
    report() {
      const metrics = [];

      for (const [name, values] of series) {
        metrics.push({ name, values, value: median(values) });
      }

      ctx.info(`perfMetrics | ${JSON.stringify(metrics)}`);
    },
  };
}

/**
 * Adds feature-owned measurements for an engine lifecycle.
 *
 * @param {MLPerfJournal} journal - The measurement journal.
 * @param {string} metricPrefix - The feature's metric prefix.
 * @param {MLPerfLifecycle} lifecycle - The measured engine lifecycle.
 * @param {MLPerfMeasurements} measurements - The scenario measurements.
 * @returns {void}
 */
function addMeasurements(journal, metricPrefix, lifecycle, measurements) {
  if (!measurements || typeof measurements !== "object") {
    throw new TypeError("The performance scenario must return measurements.");
  }

  for (const [name, value] of Object.entries(measurements)) {
    journal.add(`${metricPrefix}-${name}-${lifecycle}`, value);
  }
}

/**
 * Builds the prefix for one engine's shared measurements.
 *
 * @param {string} metricPrefix - The feature's metric prefix.
 * @param {MLPerfEngineConfig | undefined} engine - The measured engine.
 * @returns {string} The engine measurement prefix.
 */
function engineMetricPrefix(metricPrefix, engine) {
  if (!engine) {
    throw new Error("An observed engine has no reporting configuration.");
  }

  return engine.metricName
    ? `${metricPrefix}-${engine.metricName}`
    : metricPrefix;
}

/**
 * Adds feature-owned and shared engine measurements for one lifecycle.
 *
 * @param {MLPerfJournal} journal - The measurement journal.
 * @param {string} metricPrefix - The feature's metric prefix.
 * @param {MLPerfLifecycle} lifecycle - The measured engine lifecycle.
 * @param {MLPerfScenarioObservation} observation - The measured scenario.
 * @param {Map<string, MLPerfEngineConfig>} enginesByFeatureId - Engines keyed by feature ID.
 * @returns {void}
 */
function addObservationMeasurements(
  journal,
  metricPrefix,
  lifecycle,
  observation,
  enginesByFeatureId
) {
  addMeasurements(journal, metricPrefix, lifecycle, observation.measurements);

  for (const creation of observation.engineCreations) {
    const prefix = engineMetricPrefix(
      metricPrefix,
      enginesByFeatureId.get(creation.featureId)
    );

    journal.add(
      `${prefix}-engine-creation-time-${lifecycle}`,
      creation.end - creation.start
    );
  }

  for (const run of observation.engineRuns) {
    const prefix = engineMetricPrefix(
      metricPrefix,
      enginesByFeatureId.get(run.featureId)
    );

    journal.add(`${prefix}-engine-run-time-${lifecycle}`, run.end - run.start);

    if (run.resourcesBefore?.memory != null) {
      journal.add(
        `${prefix}-memory-before-run-${lifecycle}`,
        Math.round(run.resourcesBefore.memory / ONE_MIB)
      );
    }

    if (run.resourcesAfter?.memory != null) {
      journal.add(
        `${prefix}-memory-after-run-${lifecycle}`,
        Math.round(run.resourcesAfter.memory / ONE_MIB)
      );
    }

    if (run.timeToFirstToken !== undefined) {
      journal.add(
        `${prefix}-time-to-first-token-${lifecycle}`,
        run.timeToFirstToken
      );
    }

    if (run.tokensPerSecond !== undefined) {
      journal.add(
        `${prefix}-tokens-per-second-${lifecycle}`,
        run.tokensPerSecond
      );
    }

    if (run.decodingTime !== undefined) {
      journal.add(`${prefix}-decoding-time-${lifecycle}`, run.decodingTime);
    }

    if (run.inputTokens !== undefined) {
      journal.add(`${prefix}-input-tokens-${lifecycle}`, run.inputTokens);
    }

    if (run.outputTokens !== undefined) {
      journal.add(`${prefix}-output-tokens-${lifecycle}`, run.outputTokens);
    }
  }
}

/**
 * Validates engine configuration and indexes it by feature ID.
 *
 * @param {MLPerfEngineConfig[]} engines - The configured engines.
 * @returns {Map<string, MLPerfEngineConfig>} Engines keyed by feature ID.
 */
function validateEngineConfigs(engines) {
  const enginesByFeatureId = indexEngines(engines);
  const metricNames = new Set();

  for (const engine of engines) {
    validateIterationCount(
      `${engine.featureId}.expectedRuns`,
      engine.expectedRuns ?? 1
    );

    if (
      engine.metricName !== undefined &&
      (typeof engine.metricName !== "string" || !engine.metricName)
    ) {
      throw new TypeError("An engine metricName must be a non-empty string.");
    }

    if (engines.length > 1 && !engine.metricName) {
      throw new Error(
        `The engine "${engine.featureId}" needs a metricName in a multi-engine scenario.`
      );
    }

    if (engine.metricName) {
      if (metricNames.has(engine.metricName)) {
        throw new Error(
          `The engine metricName "${engine.metricName}" is configured more than once.`
        );
      }

      metricNames.add(engine.metricName);
    }
  }

  return enginesByFeatureId;
}

/**
 * Verifies that every ONNX engine observed on a run resolved to the pinned
 * backend. Engines on other backends are not pinned and pass through.
 *
 * @param {MLPerfTestContext} ctx - The calling test's context.
 * @param {MLPerfScenarioObservation} observation - The observed scenario.
 * @param {string} backend - The pinned backend.
 * @returns {void}
 */
function assertPinnedBackend(ctx, observation, backend) {
  for (const engine of new Set(observation.engineRuns.map(run => run.engine))) {
    const resolved = engine.pipelineOptions.backend;

    if (ONNX_BACKENDS.includes(resolved)) {
      ctx.Assert.equal(
        resolved,
        backend,
        `${engine.pipelineOptions.featureId} resolved to the pinned backend`
      );
    }
  }
}

/**
 * Verifies that each configured engine ran the expected number of times.
 *
 * @param {MLPerfTestContext} ctx - The calling test's context.
 * @param {MLPerfScenarioObservation} observation - The observed scenario.
 * @param {MLPerfEngineConfig[]} engines - The configured engines.
 * @returns {void}
 */
function assertExpectedEngineRuns(ctx, observation, engines) {
  for (const engine of engines) {
    const runCount = observation.engineRuns.filter(
      run => run.featureId === engine.featureId
    ).length;

    ctx.Assert.equal(
      runCount,
      engine.expectedRuns ?? 1,
      `${engine.featureId} ran the expected number of times`
    );
  }
}

/**
 * Verifies that a warm invocation reuses the engines that served the warmup.
 *
 * @param {MLPerfTestContext} ctx - The calling test's context.
 * @param {MLPerfScenarioObservation} warmup - The warmup observation.
 * @param {MLPerfScenarioObservation} observation - The later warm invocation.
 * @param {MLPerfEngineConfig[]} engines - The configured engines.
 * @returns {void}
 */
function assertWarmEngineReuse(ctx, warmup, observation, engines) {
  for (const engine of engines) {
    const warmupEngines = new Set(
      warmup.engineRuns
        .filter(run => run.featureId === engine.featureId)
        .map(run => run.engine)
    );
    const reused = observation.engineRuns
      .filter(run => run.featureId === engine.featureId)
      .every(run => warmupEngines.has(run.engine));

    ctx.Assert.ok(reused, `${engine.featureId} reused its warm engine`);
  }
}

/**
 * Verifies a configured iteration count.
 *
 * @param {string} name - The configuration field name.
 * @param {number} value - The configured count.
 * @returns {void}
 */
function validateIterationCount(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

/**
 * Runs and reports a feature scenario across standard ML lifecycles.
 *
 * The first-use scenario is always invoked once, landing the models, and may
 * be reported. Cold samples recreate the engine process while retaining the
 * profile's downloaded models. Warm samples follow one unreported run of the
 * scenario and measure the engines that served it, which must not have been
 * torn down since. Peak memory is sampled in separate runs after the latency
 * samples so the sampler cannot perturb them.
 *
 * Model-source setup is owned by the MozPerftest environment. This utility does
 * not replace the production Remote Settings or Model Hub configuration.
 *
 * When MOZ_ML_BACKENDS pins an ONNX backend, observed engines that let
 * production choose theirs (`best-onnx`) are created on the pinned backend,
 * verified to have resolved to it, and every series is suffixed with its tag.
 * Engines must therefore be created within the measured scenario for the pin
 * to apply.
 *
 * Configured engines report creation and run time, before/after inference
 * process memory, and available generated-token measurements.
 *
 * @param {MLPerfTestContext} ctx - The initialized test's context.
 * @param {RunPerfScenarioConfig} config - The scenario configuration.
 * @param {string} config.metricPrefix - Prefix for every reported series.
 * @param {string} [config.metricSuffix=""] - Suffix for every reported series.
 * @param {RunPerfScenarioConfig["scenario"]} config.scenario - Runs one
 *   production feature interaction.
 * @param {MLPerfEngineConfig[]} [config.engines=[]] - Engines whose production
 *   activity should be observed.
 * @param {boolean} [config.measureFirstUse=true] - Whether to report the
 *   single first-use sample. The first-use scenario always runs.
 * @param {number} [config.coldIterations=5] - Cold-engine latency samples
 *   after the first use.
 * @param {number} [config.warmIterations=0] - Warm-engine latency samples.
 * @param {number} [config.memoryIterations=3] - Separately sampled peak-memory
 *   runs after the latency samples.
 * @param {number} [config.peakMemorySampleIntervalMs=100] - Delay between memory
 *   samples in milliseconds.
 * @returns {Promise<void>}
 */
async function runPerfScenario(
  ctx,
  {
    metricPrefix,
    metricSuffix = "",
    scenario,
    engines = [],
    measureFirstUse = true,
    coldIterations = 5,
    warmIterations = 0,
    memoryIterations = 3,
    peakMemorySampleIntervalMs = 100,
  }
) {
  validateIterationCount("coldIterations", coldIterations);
  validateIterationCount("warmIterations", warmIterations);
  validateIterationCount("memoryIterations", memoryIterations);

  const backend = pinnedBackend();
  if (backend) {
    ctx.info(`MOZ_ML_BACKENDS pins the ONNX backend to ${backend}`);
    metricSuffix = BACKEND_TAGS[backend] ?? backend.toUpperCase();
    engines = pinEngineBackends(engines, backend);
  }

  const enginesByFeatureId = validateEngineConfigs(engines);
  const journal = createJournal(ctx, metricSuffix);

  /**
   * Observes and validates one lifecycle invocation.
   *
   * @param {MLPerfScenarioContext} context - The scenario invocation context.
   * @param {MLPerfScenarioInvocationOptions} [options={}] - Observation options.
   * @returns {Promise<MLPerfScenarioObservation>} The observed scenario.
   */
  const measure = async (context, options = {}) => {
    const observation = await measureScenarioInvocation(scenario, context, {
      ...options,
      engines,
    });

    assertExpectedEngineRuns(ctx, observation, engines);

    if (backend) {
      assertPinnedBackend(ctx, observation, backend);
    }

    return observation;
  };

  /**
   * Runs the scenario once, unreported, so the warm samples that follow
   * measure engines that have served it and have not been torn down since.
   *
   * @returns {Promise<MLPerfScenarioObservation>} The warmup observation,
   *   whose engines the warm samples must reuse.
   */
  const warmUp = () =>
    measure(
      { lifecycle: "warm", sampleKind: "warmup", iteration: 0 },
      { captureEngineCreation: false }
    );

  /**
   * Reports one peak inference-process memory observation.
   *
   * @param {MLPerfScenarioObservation} observation - The sampled scenario.
   * @returns {void}
   */
  const addPeakMemoryMeasurement = observation => {
    if (observation.peakMemory === undefined) {
      throw new Error("Peak memory sampling did not return a measurement.");
    }

    ctx.Assert.greater(
      observation.peakMemory,
      0,
      "The memory sampler observed the inference process"
    );
    journal.add(`${metricPrefix}-peak-memory`, observation.peakMemory);
  };

  try {
    if (backend === "onnx") {
      // Engines created concurrently each download the wasm runtime into the
      // same OPFS file, and the earlier writer's snapshot is invalidated when
      // the later one closes. Land the runtime once so creations only read it.
      await MLEngineParent.getWasmArrayBuffer(backend);
    }

    await destroyEngines();
    const firstUse = await measure({
      lifecycle: "first-use",
      sampleKind: measureFirstUse ? "latency" : "warmup",
      iteration: 0,
    });

    if (measureFirstUse) {
      addObservationMeasurements(
        journal,
        metricPrefix,
        "first-use",
        firstUse,
        enginesByFeatureId
      );
    }

    for (let iteration = 0; iteration < coldIterations; iteration++) {
      await destroyEngines();
      const observation = await measure({
        lifecycle: "cold",
        sampleKind: "latency",
        iteration,
      });

      addObservationMeasurements(
        journal,
        metricPrefix,
        "cold",
        observation,
        enginesByFeatureId
      );
    }

    if (warmIterations) {
      const warmup = await warmUp();

      for (let iteration = 0; iteration < warmIterations; iteration++) {
        const observation = await measure(
          {
            lifecycle: "warm",
            sampleKind: "latency",
            iteration,
          },
          { captureEngineCreation: false }
        );

        assertWarmEngineReuse(ctx, warmup, observation, engines);
        addObservationMeasurements(
          journal,
          metricPrefix,
          "warm",
          observation,
          enginesByFeatureId
        );
      }
    }

    // Peak memory is sampled in separate runs so the sampler cannot perturb
    // the latency samples. The engines are in whatever state the feature
    // leaves them in.
    for (let iteration = 0; iteration < memoryIterations; iteration++) {
      const observation = await measure(
        {
          lifecycle: "warm",
          sampleKind: "memory",
          iteration,
        },
        {
          captureEngineCreation: false,
          samplePeakMemory: true,
          peakMemorySampleIntervalMs,
        }
      );

      addPeakMemoryMeasurement(observation);
    }
  } finally {
    await destroyEngines();
  }

  journal.report();
}

/**
 * Shared lifecycle, memory, and reporting utilities for ML performance tests.
 */
export class MLPerfTestUtils {
  /** @type {MLPerfTestContext | null} The initialized test's context. */
  static #ctx = null;

  /**
   * Initializes the utility for the current test context until test cleanup.
   *
   * @param {MLPerfTestContext} ctx - The calling test's context.
   * @returns {void}
   */
  static init(ctx) {
    this.#ctx = ctx;

    ctx.registerCleanupFunction(() => {
      this.#ctx = null;
    });
  }

  /**
   * Runs and reports the configured ML scenario using the initialized test context.
   *
   * @param {RunPerfScenarioConfig} config - The lifecycle and measurement options.
   * @returns {Promise<void>}
   */
  static async runPerfScenario(config) {
    if (!this.#ctx) {
      throw new Error("MLPerfTestUtils.init(ctx) must be called first.");
    }

    await runPerfScenario(this.#ctx, config);
  }
}
