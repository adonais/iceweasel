/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createEngine,
  FEATURES,
} from "chrome://global/content/ml/EngineProcess.sys.mjs";

import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";
import { MLEngineParent } from "resource://gre/actors/MLEngineParent.sys.mjs";

const ENGINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Dimension of a single pooled field embedding produced by the encoder.
const EMBEDDING_DIM = 384;

/**
 * Split a legacy form-autofill context string into the current, previous, and
 * next field strings.
 *
 * Tokens prefixed with `bb` belong to the previous field and have the prefix
 * removed. Tokens prefixed with `aa` belong to the next field and have the
 * prefix removed. All remaining tokens belong to the current field.
 *
 * @param {string} mlData Legacy context string containing tokens from the
 *   current field plus neighboring fields.
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

// The field-type classifier is deployed as two engines. The ENCODER is a
// stock `feature-extraction` model that turns each field's tokens into a
// single pooled embedding. The HEAD is a tiny ONNX model that scores the
//  windowed embeddings (a field's own embedding plus its two
// neighbors) into a field type.

// Encoder engine: stock feature-extraction, one pooled vector per field.
const FormFill_Encoder_Config = {
  timeoutMS: ENGINE_TIMEOUT_MS,
  taskName: "feature-extraction",
  featureId: "formfill-encoder",
  engineId: FEATURES["formfill-encoder"].engineId,
  backend: "best-onnx",
  numThreads: 2,
};

// Head engine: custom `moz-formfill-head` pipeline, scores windowed features.
const FormFill_Head_Config = {
  timeoutMS: ENGINE_TIMEOUT_MS,
  taskName: "moz-formfill-head",
  featureId: "formfill-head",
  engineId: FEATURES["formfill-head"].engineId,
  backend: "best-onnx",
  numThreads: 2,
};

export class FormAutofillML {
  #encoderEngine;
  #headEngine;

  // "<encoderRevision>/<headRevision>" -- the two models are versioned
  // independently, so telemetry reports both.
  static #modelVersion = "";

  static getModelVersion() {
    return this.#modelVersion;
  }

  /**
   * Lazily create both the encoder and head engines.
   *
   * Egines are (re)created when missing or closed.
   *
   * On the very first use the models likely haven't been
   * downloaded, so we kick off both downloads but do not block autofill or run
   * inference this time.
   *
   * @returns {Promise<boolean>} True when both engines are ready to run.
   */
  async #ensureEngines() {
    const encoderReady =
      this.#encoderEngine && this.#encoderEngine.engineStatus != "closed";
    const headReady =
      this.#headEngine && this.#headEngine.engineStatus != "closed";
    if (encoderReady && headReady) {
      return true;
    }

    try {
      const initEncoderPromise = createEngine(FormFill_Encoder_Config);
      const initHeadPromise = createEngine(FormFill_Head_Config);

      // If the ML engines have never been used before, they likely haven't
      // been downloaded, so initialize both but don't try to get the result.
      if (!FormAutofillUtils.isMLUsedAlready) {
        Promise.all([initEncoderPromise, initHeadPromise])
          .then(([encoderEngine, headEngine]) => {
            this.#encoderEngine = encoderEngine;
            this.#headEngine = headEngine;
            FormAutofillUtils.setMLUsedAlready();
          })
          .catch(() => {});
        return false;
      }

      [this.#encoderEngine, this.#headEngine] = await Promise.all([
        initEncoderPromise,
        initHeadPromise,
      ]);
    } catch (ex) {
      return false;
    }

    const [encoderDetails, headDetails] = await Promise.all([
      MLEngineParent.getInferenceOptions(
        FormFill_Encoder_Config.featureId,
        FormFill_Encoder_Config.taskName
      ),
      MLEngineParent.getInferenceOptions(
        FormFill_Head_Config.featureId,
        FormFill_Head_Config.taskName
      ),
    ]);
    FormAutofillML.#modelVersion = `${encoderDetails.modelRevision ?? ""}/${
      headDetails.modelRevision ?? ""
    }`;

    return true;
  }

  async detectFields(fieldDetails) {
    if (!(await this.#ensureEngines())) {
      return;
    }

    // Consider every field that has ML tokens. We still only assign a fieldName
    // to fields that don't already have one (see the result loop below), but the
    // neighbor context for each field comes from its OWN baked aa/bb data, so we
    // don't depend on which other fields are present or their ordering.
    const mlFields = fieldDetails.filter(fd => fd.mlData);

    if (!mlFields.length) {
      return; // No fields to identify.
    }

    // Triple-encoder Approach 3, step 1: split each field's mlData into its three
    // sections (current / previous / next) using the baked aa/bb context, and
    // encode them. Encoding is done ONCE per unique section string -- a field's
    // previous/next section is just a neighbor field's own tokens (or "" at a
    // form boundary), so the set of distinct strings is small and every field's
    // three embeddings are looked up from it by value. This keeps encoding cheap
    // while using the authoritative aa/bb adjacency rather than field ordering.
    //
    // Two details must match training (dotraining.py `_encode`) exactly:
    //   - Pooling is a raw attention-masked mean with NO L2 normalization
    //     (`normalize: false`); the head was trained on un-normalized vectors.
    //   - An absent previous/next section is the empty string "", which the
    //     encoder turns into a fixed non-zero [CLS][SEP] embedding (NOT a zero
    //     vector), so the difference features become `cur - emptyEmb`.
    const sections = mlFields.map(fd => splitContext(fd.mlData));
    const uniqueStrings = [...new Set([""].concat(...sections))];
    let embeddings = await this.#encoderEngine.run({
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
    // like the previous text-classification output: `{ label, score }`) live
    // under `.output`.
    const scores = await this.#headEngine.run({ args: [rows] });
    const results = scores?.output ?? scores;

    for (let r = 0; r < results.length; r++) {
      const fd = mlFields[r];

      // Fields already labeled by the heuristics keep their assignment; the ML
      // model only fills in the ones still missing a fieldName.
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
}
