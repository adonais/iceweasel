/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "console", () => {
  return console.createInstance({
    maxLogLevelPref: "browser.ml.logLevel",
    prefix: "MLTelemetry",
  });
});

/**
 * MLTelemetry provides a mechanism tracking a "flow" of operations
 * related to a machine learning feature. A flow is a sequence of related
 * events that represent a single, complete user-level operation, for example
 * generating a summary for a page.
 *
 * This class uses a correlation ID pattern where flowId is passed to each
 * method, allowing flexible tracking across different parts of the system.
 *
 * @example
 * new MLTelemetry({ featureId: "ml-suggest-intent" }).sessionStart({ interaction: "button_click" });
 * @example
 * new MLTelemetry({ featureId: "ml-suggest-intent", flowId: "1234-5678" }).sessionStart({ interaction: "keyboard_shortcut"});
 */
export class MLTelemetry {
  /** @type {string} */
  #flowId;
  /** @type {string|undefined} */
  #featureId;
  /** @type {number|undefined} */
  #startTime;

  /**
   * Creates a new MLTelemetry instance.
   *
   * @param {object} [options] - Configuration options.
   * @param {string} [options.featureId] - The identifier for the ML feature.
   * @param {string} [options.flowId] - An optional unique identifier for
   * this flow. If not provided, a new UUID will be generated.
   */
  constructor(options = {}) {
    this.#featureId = options.featureId;
    this.#flowId = options.flowId || crypto.randomUUID();

    this.logEventToConsole(this.constructor, {
      featureId: this.#featureId,
      flowId: this.#flowId,
    });
  }

  /**
   * The unique identifier for this flow.
   *
   * @returns {string} The flow ID.
   */
  get flowId() {
    return this.#flowId;
  }

  /**
   * The feature identifier for this telemetry instance.
   *
   * @returns {string} The feature ID.
   */
  get featureId() {
    return this.#featureId;
  }

  /**
   * Starts a telemetry session for the given flow.
   *
   * @param {object} [options] - Session start options.
   * @param {string} [options.interaction] - The interaction type (e.g., "button_click", "keyboard_shortcut").
   * @throws {Error} If session already exists for this flowId.
   */
  sessionStart({ interaction } = {}) {
    if (this.#startTime) {
      throw new Error(`Session already started for flowId: ${this.#flowId}`);
    }

    this.#startTime = ChromeUtils.now();

    Glean.firefoxAiRuntime.sessionStart.record({
      flow_id: this.flowId,
      feature_id: this.featureId,
      interaction,
    });

    this.logEventToConsole(this.sessionStart, {
      flow_id: this.flowId,
      feature_id: this.featureId,
      interaction,
    });
  }

  /**
   * Logs a debug message to the browser console, prefixed with the flow ID.
   *
   * @param {object} caller - The calling function or class.
   * @param {object} [data] - Optional data to be JSON-stringified and logged.
   */
  logEventToConsole(caller, data) {
    const flowId = data?.flowId || this.#flowId;
    const id = flowId.substring(0, 5);
    lazy.console.debug("flowId[%s]: %s", id, caller.name, data);
  }

  /**
   * Ends the telemetry session and records the final status and duration.
   *
   * @param {string} status - The final status of the session.
   * @throws {Error} If no active session found or status parameter is missing.
   * @returns {number} Duration in milliseconds.
   */
  endSession(status) {
    // Validate status
    if (!status) {
      throw new Error("status parameter is required");
    }
    // Validate that session was started
    if (!this.#startTime) {
      throw new Error(
        `sessionStart() was not called for flowId: ${this.#flowId}`
      );
    }

    const duration_ms = ChromeUtils.now() - this.#startTime;
    Glean.firefoxAiRuntime.sessionEnd.record({
      flow_id: this.#flowId,
      duration: Math.round(duration_ms),
      status,
    });

    this.logEventToConsole(this.endSession, {
      flowId: this.#flowId,
      feature_id: this.#featureId,
      status,
      duration_ms,
    });
    return duration_ms;
  }

  /**
   * Records a successful engine creation event.
   *
   * @param {object} options - Engine creation success options.
   * @param {string} [options.flowId] - The flow ID. Uses instance flowId if not provided.
   * @param {string} options.engineId - The engine identifier (e.g., "pdfjs", "ml-suggest-intent").
   * @param {string} [options.label] - Label for the old timing distribution metric. Defaults to engineId if not provided.
   * @param {number} options.duration - Engine creation time in milliseconds.
   */
  recordEngineCreationSuccessFlow({ flowId, engineId, label, duration }) {
    const currentFlowId = flowId || this.#flowId;
    const actualEngineId = engineId;
    const actualLabel = label || engineId;

    Glean.firefoxAiRuntime.engineCreationSuccessFlow.record({
      flow_id: currentFlowId,
      engineId: actualEngineId,
      duration: Math.round(duration),
    });

    // Also record the old labeled timing distribution metric
    Glean.firefoxAiRuntime.engineCreationSuccess[
      actualLabel
    ].accumulateSingleSample(Math.round(duration));

    this.logEventToConsole(this.recordEngineCreationSuccessFlow, {
      flowId: currentFlowId,
      engineId: actualEngineId,
      label: actualLabel,
      duration,
    });
  }

  /**
   * Records a failed engine creation event.
   *
   * @param {object} options - Engine creation failure options.
   * @param {string} [options.flowId] - The flow ID. Uses instance flowId if not provided.
   * @param {string} options.modelId - The model identifier.
   * @param {string} options.featureId - The feature identifier.
   * @param {string} options.taskName - The task name.
   * @param {string} options.engineId - The engine identifier.
   * @param {string} options.error - The error class/message.
   */
  recordEngineCreationFailure({
    flowId,
    modelId,
    featureId,
    taskName,
    engineId,
    error,
  }) {
    const currentFlowId = flowId || this.#flowId;

    Glean.firefoxAiRuntime.engineCreationFailure.record({
      flow_id: currentFlowId,
      modelId,
      featureId,
      taskName,
      engineId,
      error,
    });

    this.logEventToConsole(this.recordEngineCreationFailure, {
      flowId: currentFlowId,
      modelId,
      featureId,
      taskName,
      engineId,
      error,
    });
  }

  /**
   * Records a successful inference run event.
   *
   * @param {object} options - Inference success options.
   * @param {string} [options.flowId] - The flow ID. Uses instance flowId if not provided.
   * @param {string} [options.engineId] - The engine identifier. Defaults to undefined.
   * @param {string} [options.label] - Label for the old timing distribution metric. Defaults to no-label if not provided.
   * @param {number} options.tokenizingTime - Time spent tokenizing in milliseconds.
   * @param {number} options.inferenceTime - Time spent on inference in milliseconds.
   */
  recordRunInferenceSuccessFlow({
    flowId,
    engineId,
    label,
    tokenizingTime,
    inferenceTime,
  }) {
    const currentFlowId = flowId || this.#flowId;
    const EngineId = engineId || undefined;
    const Label = label || "no-label";

    Glean.firefoxAiRuntime.runInferenceSuccessFlow.record({
      flow_id: currentFlowId,
      tokenizing_time: Math.round(tokenizingTime),
      inference_time: Math.round(inferenceTime),
    });

    // Also record the old labeled timing distribution metric
    const totalTime = Math.round(tokenizingTime + inferenceTime);
    Glean.firefoxAiRuntime.runInferenceSuccess[Label].accumulateSingleSample(
      totalTime
    );

    this.logEventToConsole(this.recordRunInferenceSuccessFlow, {
      flowId: currentFlowId,
      engineId: EngineId,
      label: Label,
      tokenizingTime,
      inferenceTime,
    });
  }

  /**
   * Records a failed inference run event.
   *
   * @param {string} error - The error class/message.
   * @param {string} [flow_id=this.#flowId] - The flow ID. Uses instance flowId if not provided.
   */
  recordRunInferenceFailure(error, flow_id = this.flowId) {
    Glean.firefoxAiRuntime.runInferenceFailure.record({
      flow_id,
      error,
    });

    this.logEventToConsole(this.recordRunInferenceFailure, {
      flow_id,
      error,
    });
  }

  /**
   * Records an engine run event.
   *
   * @param {object} options - Engine run options.
   * @param {string} [options.flow_id] - The flow ID. Uses instance flowId if not provided.
   * @param {number} options.cpuMilliseconds - The combined milliseconds of every cpu core that was running.
   * @param {number} options.wallMilliseconds - The amount of wall time the run request took.
   * @param {number} options.cores - The number of cores on the machine.
   * @param {number} options.cpuUtilization - The percentage of the user's CPU used (0-100).
   * @param {number} options.memoryBytes - The number of RSS bytes for the inference process.
   * @param {string} [options.feature_id] - The feature identifier. Uses instance featureId if not provided.
   * @param {string} options.engineId - The engine identifier.
   * @param {string} options.modelId - The model identifier.
   * @param {string} options.backend - The backend that is being used.
   */
  recordEngineRun({
    cpuMilliseconds,
    wallMilliseconds,
    cores,
    cpuUtilization,
    memoryBytes,
    engineId,
    modelId,
    backend,
    flow_id = this.#flowId,
    feature_id = this.#featureId,
  }) {
    const payload = {
      flow_id,
      cpu_milliseconds: Math.round(cpuMilliseconds),
      wall_milliseconds: Math.round(wallMilliseconds),
      cores: Math.round(cores),
      cpu_utilization: Math.round(cpuUtilization),
      memory_bytes: Math.round(memoryBytes),
      feature_id,
      engine_id: engineId,
      model_id: modelId,
      backend,
    };

    Glean.firefoxAiRuntime.engineRun.record(payload);

    this.logEventToConsole(this.recordEngineRun, payload);
  }
}
