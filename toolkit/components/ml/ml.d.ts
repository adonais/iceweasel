/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains the shared types for the machine learning component. The intended
 * use is for defining types to be used in JSDoc. They are used in a form that the
 * TypeScript language server can read them, and provide code hints.
 *
 * @see https://firefox-source-docs.mozilla.org/code-quality/typescript/
 */

import { type PipelineOptions } from "chrome://global/content/ml/EngineProcess.sys.mjs";

export type EngineStatus =
  // The engine is waiting for a previous one to shut down.
  | "SHUTTING_DOWN_PREVIOUS_ENGINE"
  // The engine dispatcher has been created, and the engine is still initializing.
  | "INITIALIZING"
  // The engine is fully ready and idle.
  | "IDLE"
  // The engine is currently processing a run request.
  | "RUNNING"
  // The engine is in the process of terminating, but hasn't fully shut down.
  | "TERMINATING"
  // The engine has been fully terminated and removed.
  | "TERMINATED";

/**
 * The EngineId is used to identify a unique engine that can be shared across multiple
 * consumers. This way a single model can be loaded into memory and used in different
 * locations, assuming the other parameters match as well.
 */
export type EngineId = string;

/**
 * Utility type to extract the data fields from a class. It removes all of the
 * functions.
 */
type DataFields<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

/**
 * The PipelineOptions are a nominal class that validates the options. The
 * PipelineOptionsRaw are the raw subset of those.
 */
type PipelineOptionsRaw = Partial<DataFields<PipelineOptions>>;

/**
 * Tracks the current status of the engines for about:inference. It's not used
 * for deciding any business logic of the engines, only for debug info.
 */
export type StatusByEngineId = Map<
  EngineId,
  {
    status: EngineStatus;
    options: PipelineOptions | PipelineOptionsRaw;
  }
>;
