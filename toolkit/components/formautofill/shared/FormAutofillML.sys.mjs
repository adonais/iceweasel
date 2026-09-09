/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createEngine,
  FEATURES,
} from "chrome://global/content/ml/EngineProcess.sys.mjs";

import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";
import { MLEngineParent } from "moz-src:///toolkit/components/ml/actors/MLEngineParent.sys.mjs";

// Every engine's `timeoutMS` comes from
// `extensions.formautofill.useml.timeoutMS` and is applied in `#ensureEngines`,
// so it is read fresh on each engine creation rather than baked in here.

// Default classifier: a single `text-classification` model that maps a field's
// context string straight to a field type.
const FORM_AUTOFILL_FEATURE_ID = "formfill-classification";
const ML_TASKNAME = "text-classification";

const FormFill_Config = {
  taskName: ML_TASKNAME,
  featureId: FORM_AUTOFILL_FEATURE_ID,
  engineId: FEATURES[FORM_AUTOFILL_FEATURE_ID].engineId,
  backend: "best-onnx",
  modelId: "mozilla/tinybert-address-autofill",
  numThreads: 2,
};

// Dimension of a single pooled field embedding produced by the encoder.
const EMBEDDING_DIM = 384;

// Opt-in classifier, gated on `extensions.formautofill.useml.twoHead`. It is
// deployed as two engines. The ENCODER is a stock `feature-extraction` model
// that turns each field's tokens into a single pooled embedding. The HEAD is a
// tiny ONNX model that scores the windowed embeddings (a field's own embedding
// plus its two neighbors) into a field type.

// Encoder engine: stock feature-extraction, one pooled vector per field.
const FormFill_Encoder_Config = {
  taskName: "feature-extraction",
  featureId: "formfill-encoder",
  engineId: FEATURES["formfill-encoder"].engineId,
  backend: "best-onnx",
  numThreads: 2,
};

// Head engine: custom `moz-formfill-head` pipeline, scores windowed features.
const FormFill_Head_Config = {
  taskName: "moz-formfill-head",
  featureId: "formfill-head",
  engineId: FEATURES["formfill-head"].engineId,
  backend: "best-onnx",
  numThreads: 2,
};

/**
 * Split a form-autofill context string into the current, previous, and next
 * field strings.
 *
 * Tokens prefixed with `bb` belong to the previous field and have the prefix
 * removed. Tokens prefixed with `aa` belong to the next field and have the
 * prefix removed. All remaining tokens belong to the current field.
 *
 * @param {string} mlData Context string containing tokens from the current
 *   field plus neighboring fields.
 * @returns {[string, string, string]} A tuple containing the current, previous,
 *   and next field strings, in that order.
 */
function splitContext(mlData) {
  const cur = [];
  const prev = [];
  const next = [];
  for (const w of mlData.split(/\s+/)) {
    if (!w) {
      continue;
    }
    if (w.length > 2 && w.startsWith("bb")) {
      prev.push(w.slice(2));
    } else if (w.length > 2 && w.startsWith("aa")) {
      next.push(w.slice(2));
    } else {
      cur.push(w);
    }
  }
  return [cur.join(" "), prev.join(" "), next.join(" ")];
}

export class FormAutofillML {
  // featureId -> engine, covering whichever classifier is active.
  #engines = new Map();

  static #modelVersion = "";

  static getModelVersion() {
    return this.#modelVersion;
  }

  async detectFields(fieldDetails) {
    if (FormAutofillUtils.enableMLAutofillTwoHead) {
      await this.#detectFieldsTwoHead(fieldDetails);
      return;
    }
    await this.#detectFieldsSingle(fieldDetails);
  }

  /**
   * Lazily create the engines described by `configs`, which are (re)created
   * when missing or closed.
   *
   * On the very first use the models likely haven't been downloaded, so we kick
   * off every download but do not block autofill or run inference this time.
   *
   * @param {object[]} configs One engine configuration per engine needed.
   * @returns {Promise<object[]|null>} The ready engines, in the same order as
   *   `configs`, or null when inference should be skipped this time.
   */
  async #ensureEngines(configs) {
    const cached = configs.map(config => this.#engines.get(config.featureId));
    if (
      cached.every(
        engine => engine && !["closed", "error"].includes(engine.engineStatus)
      )
    ) {
      return cached;
    }

    const remember = engines =>
      configs.forEach((config, i) =>
        this.#engines.set(config.featureId, engines[i])
      );

    try {
      // Read the timeout per creation so a Nimbus rollout that changes it takes
      // effect without a restart. -1 keeps the engine alive indefinitely.
      const timeoutMS = FormAutofillUtils.mlEngineTimeoutMS;
      const initPromises = configs.map(config =>
        createEngine({ ...config, timeoutMS })
      );

      // If the ML engines have never been used before, they likely haven't been
      // downloaded, so initialize them but don't try to get the result.
      if (!FormAutofillUtils.isMLUsedAlready) {
        Promise.all(initPromises)
          .then(engines => {
            remember(engines);
            FormAutofillUtils.setMLUsedAlready();
          })
          .catch(() => {});
        return null;
      }

      remember(await Promise.all(initPromises));
    } catch (ex) {
      return null;
    }

    const details = await Promise.all(
      configs.map(config =>
        MLEngineParent.getInferenceOptions(config.featureId, config.taskName)
      )
    );
    // Models are versioned independently, so telemetry reports every revision.
    // A single-model classifier therefore reports just its own revision.
    FormAutofillML.#modelVersion = details
      .map(detail => detail.modelRevision ?? "")
      .join("/");

    return configs.map(config => this.#engines.get(config.featureId));
  }

  /**
   * Apply the model's predictions to `fields`, positionally.
   *
   * Fields already labeled by the heuristics keep their assignment; the ML model
   * only fills in the ones still missing a fieldName.
   *
   * @param {object[]} fields The field details that were classified.
   * @param {object[]} results One `{ label }` per entry in `fields`.
   */
  #applyResults(fields, results) {
    for (let r = 0; r < results.length; r++) {
      const fd = fields[r];
      if (fd.fieldName) {
        continue;
      }

      const fieldName = results[r].label;
      if (fieldName && fieldName != "other") {
        fd.fieldName = fieldName;
      }

      fd.reason = "ml";
    }
  }

  async #detectFieldsSingle(fieldDetails) {
    const engines = await this.#ensureEngines([FormFill_Config]);
    if (!engines) {
      return;
    }

    // Only fields that have tokens and don't already have a field name assigned
    // need identifying. One input string per field, classified in one batch.
    const mlFields = fieldDetails.filter(fd => !fd.fieldName && fd.mlData);

    if (!mlFields.length) {
      return; // No fields to identify.
    }

    const results = await engines[0].run({
      args: [mlFields.map(fd => fd.mlData)],
      options: { pooling: "mean", normalize: true },
    });

    this.#applyResults(mlFields, results);
  }

  async #detectFieldsTwoHead(fieldDetails) {
    const engines = await this.#ensureEngines([
      FormFill_Encoder_Config,
      FormFill_Head_Config,
    ]);
    if (!engines) {
      return;
    }
    const [encoderEngine, headEngine] = engines;

    // Consider every field that has ML tokens. We still only assign a fieldName
    // to fields that don't already have one (see the result loop below), but the
    // neighbor context for each field comes from its OWN baked aa/bb data, so we
    // don't depend on which other fields are present or their ordering.
    const mlFields = fieldDetails.filter(fd => fd.mlData);

    if (!mlFields.length) {
      return; // No fields to identify.
    }

    // Step 1: split each field's mlData into its three sections (current /
    // previous / next) using the baked aa/bb context, and encode them. Encoding
    // is done ONCE per unique section string -- a field's previous/next section
    // is just a neighbor field's own tokens (or "" at a form boundary), so the
    // set of distinct strings is small and every field's three embeddings are
    // looked up from it by value. This keeps encoding cheap while using the
    // authoritative aa/bb adjacency rather than field ordering.
    //
    // Two details must match training (dotraining.py `_encode`) exactly:
    //   - Pooling is a raw attention-masked mean with NO L2 normalization
    //     (`normalize: false`); the head was trained on un-normalized vectors.
    //   - An absent previous/next section is the empty string "", which the
    //     encoder turns into a fixed non-zero [CLS][SEP] embedding (NOT a zero
    //     vector), so the difference features become `cur - emptyEmb`.
    const sections = mlFields.map(fd => splitContext(fd.mlData));
    const uniqueStrings = [...new Set([""].concat(...sections))];
    let embeddings = await encoderEngine.run({
      args: [uniqueStrings],
      options: { pooling: "mean", normalize: false },
    });

    // feature-extraction can triple-nest a singleton batch; un-nest it the same
    // way EmbeddingsGenerator.embedMany does.
    if (
      Array.isArray(embeddings) &&
      embeddings.length === 1 &&
      Array.isArray(embeddings[0]) &&
      embeddings[0].length !== EMBEDDING_DIM
    ) {
      embeddings = embeddings[0];
    }

    const embByString = new Map();
    for (let i = 0; i < uniqueStrings.length; i++) {
      embByString.set(uniqueStrings[i], embeddings[i]);
    }

    // Step 2: build the feature rows. For each field concatenate
    // [e_cur, e_prev, e_next, e_cur - e_prev, e_cur - e_next] into a 1920-d row.
    const rows = sections.map(([curStr, prevStr, nextStr]) => {
      const cur = embByString.get(curStr);
      const prev = embByString.get(prevStr);
      const next = embByString.get(nextStr);
      const diffPrev = cur.map((v, j) => v - prev[j]);
      const diffNext = cur.map((v, j) => v - next[j]);
      return [...cur, ...prev, ...next, ...diffPrev, ...diffNext];
    });

    // Step 3: run the fusion head ONCE for all fields. Custom pipeline
    // functions return `{ output, metrics }`, so the per-field results (shaped
    // like the text-classification output: `{ label, score }`) live under
    // `.output`.
    const scores = await headEngine.run({ args: [rows] });

    this.#applyResults(mlFields, scores?.output ?? scores);
  }
}
