/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @ts-nocheck - TODO - Remove this to type check this file.

const lazy = {};

ChromeUtils.defineESModuleGetters(
  lazy,
  {
    ONNXPipeline: "chrome://global/content/ml/backends/ONNXPipeline.mjs",
    LlamaCppPipeline:
      "chrome://global/content/ml/backends/LlamaCppPipeline.mjs",
    PipelineOptions: "chrome://global/content/ml/EngineProcess.sys.mjs",
    OpenAIPipeline: "chrome://global/content/ml/backends/OpenAIPipeline.mjs",
    StaticEmbeddingsPipeline:
      "chrome://global/content/ml/backends/StaticEmbeddingsPipeline.mjs",
  },
  { global: "current" }
);

/**
 * Initializes and returns the appropriate backend pipeline based on the given options.
 *
 * @param {object} consumer - The worker object that interacts with the backend.
 * @param {ArrayBuffer} wasm - The WebAssembly module required for execution.
 * @param {object} options - Configuration options for the pipeline.
 *
 * @returns {Promise<object>} A promise that resolves to the initialized pipeline.
 */
export async function getBackend(consumer, wasm, options) {
  const pipelineOptions = new lazy.PipelineOptions(options);
  var factory;

  // The default backend is onnx-native
  let backendName = pipelineOptions.backend || "onnx-native";

  switch (pipelineOptions.backend) {
    case "onnx":
      factory = lazy.ONNXPipeline.initialize;
      break;
    case "onnx-native":
      factory = lazy.ONNXPipeline.initialize;
      break;
    case "llama.cpp":
      factory = lazy.LlamaCppPipeline.initialize;
      break;
    case "openai":
      factory = lazy.OpenAIPipeline.initialize;
      break;
    case "static-embeddings":
      factory = lazy.StaticEmbeddingsPipeline.initialize;
      break;
    default:
      factory = lazy.ONNXPipeline.initialize;
  }

  let initStart = ChromeUtils.now();

  const BackendErrorWithName = err => new BackendError(backendName, err);
  const pipeline = await factory(
    consumer,
    wasm,
    pipelineOptions,
    BackendErrorWithName
  );

  ChromeUtils.addProfilerMarker(
    "MLEngine:Pipeline",
    { startTime: initStart },
    `Initialize ${backendName} backend`
  );

  return pipeline;
}

/**
 * Wraps a runtime error the backend can use to throw errors.
 *
 * Sometimes onnx sends us back integer values.
 */
export class BackendError extends Error {
  constructor(backendName, backendError) {
    const capitalizedBackend =
      backendName.charAt(0).toUpperCase() + backendName.slice(1);
    if (backendError instanceof Error) {
      super(backendError.message);
      this.stack = backendError.stack;
    } else {
      super(`Backend error: ${JSON.stringify(backendError)}`);
    }
    this.backendError = backendError;
    this.name = `${capitalizedBackend}BackendError`;
    this.backendName = backendName;
    // An API client reports why the service refused a request through the
    // HTTP status and the body's error field. Keep both on the error itself
    // so they survive toMsg() and reach the caller.
    if (typeof backendError?.status === "number") {
      this.status = backendError.status;
    }
    if (backendError?.error !== undefined && backendError?.error !== null) {
      this.error = backendError.error;
    }
  }

  /**
   * PromiseWorker sends an error that has toMsg() as this object instead of
   * letting the DOM reduce it to a message. MLEngineChild registers the
   * matching deserializer under the `exn` name.
   *
   * @returns {object}
   */
  toMsg() {
    return {
      exn: "BackendError",
      name: this.name,
      message: this.message,
      backendName: this.backendName,
      stack: this.stack,
      ...(this.status !== undefined && { status: this.status }),
      ...(this.error !== undefined && { error: this.error }),
    };
  }
}
