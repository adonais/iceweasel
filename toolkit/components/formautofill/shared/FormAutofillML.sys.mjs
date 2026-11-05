/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createEngine,
  FEATURES,
} from "chrome://global/content/ml/EngineProcess.sys.mjs";

import { FormAutofill } from "resource://autofill/FormAutofill.sys.mjs";
import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";
import { MLEngineParent } from "moz-src:///toolkit/components/ml/actors/MLEngineParent.sys.mjs";
import { ModelHub } from "chrome://global/content/ml/ModelHub.sys.mjs";

// Every engine's `timeoutMS` comes from
// `extensions.formautofill.useml.timeoutMS` and is applied in `#getEngines`,
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

// Copy an engine config with modelRevision pinned to the override from the
// extensions.formautofill.useml.modelVersion pref (both engines share one
// version). Empty = unchanged, so Remote Settings picks the revision.
function withModelRevision(config) {
  const revision = (FormAutofill.mlModelVersion || "").trim();
  return revision ? { ...config, modelRevision: revision } : config;
}

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
  modelToUseId: "mozilla/form-autofill-embed", // used only by isModelInstalled
};

// Head engine: custom `moz-formfill-head` pipeline, scores windowed features.
const FormFill_Head_Config = {
  taskName: "moz-formfill-head",
  featureId: "formfill-head",
  engineId: FEATURES["formfill-head"].engineId,
  backend: "best-onnx",
  numThreads: 2,
  modelToUseId: "mozilla/form-autofill-head", // used only by isModelInstalled
};

// For the single classifier, these prefixes are used on words for the
// previous and next elements.
const ADJACENT_BEFORE_PREFIX = "bb";
const ADJACENT_AFTER_PREFIX = "aa";

export class FormAutofillML {
  // featureId -> engine, covering whichever classifier is active.
  #engines = new Map();

  // featureId -> resolved model revision. Kept separately from #engines so the
  // reported version can be recomputed for the classifier serving the current
  // detection, including when the engines are already cached.
  #revisions = new Map();

  // The revision(s) of the engines that served the most recent detection.
  // Read by telemetry, which runs after detectFields() on the same form.
  static #modelVersion = "";

  /**
   * The classifier revision configured for this client, or "" when the feature
   * is off.
   *
   * Reported on every detection, including forms the classifier did not label:
   * a form the model declined to label is part of that model's behaviour, so
   * gating this on the model having succeeded would make version cohorts
   * conditional on the outcome being measured.
   *
   * The enabled check matters because #modelVersion is process-wide and only
   * written when engines are created. Without it a profile that once ran the
   * classifier keeps reporting that revision after the feature is turned off --
   * which is how control-branch clients came to report a model version despite
   * their detections being ~99% regexp.
   *
   * @returns {string} Revision, joined by "/" for a multi-engine classifier.
   */
  static getModelVersion() {
    return FormAutofillUtils.isMLAutofillEnabled ? this.#modelVersion : "";
  }

  /**
   * Publish the version for `configs` -- the classifier about to run.
   *
   * This must happen on every #getEngines() call, not only when engines are
   * created. `extensions.formautofill.useml.twoHead` is Nimbus-controlled and
   * live (defineLazyPreferenceGetter), so a profile can run the two-engine
   * classifier and later the single-engine one. #engines is keyed by featureId,
   * so each classifier correctly builds its own engines -- but the version was
   * previously written only on the creation path, leaving the last-created
   * value in place. A single-head detection then reported the two-head string
   * ("rev/rev"), which is how single-head clients came to look like two-head
   * ones in telemetry.
   *
   * @param {object[]} configs Engine configurations for the active classifier.
   */
  #publishVersion(configs) {
    FormAutofillML.#modelVersion = configs
      .map(config => this.#revisions.get(config.featureId) ?? "")
      .join("/");
  }

  /**
   * Return true if the model(s) for the given configuration is installed.
   *
   * @param {object[]} configs Engine configurations for the active classifier.
   */
  async isModelInstalled(configs) {
    const modelHub = new ModelHub({
      allowDenyList: await MLEngineParent.getAllowDenyList(),
    });

    for (let config of configs) {
      let modelId = config.modelToUseId || config.modelId;
      if (!modelId) {
        return false;
      }

      const version =
        FormAutofill.mlModelVersion ||
        (
          await MLEngineParent.getInferenceOptions(
            config.featureId,
            config.taskName
          )
        ).modelRevision;

      if (!(await modelHub.isModelInstalled(modelId, version))) {
        return false;
      }
    }

    return true;
  }

  combineAdjacentTokens(fieldDetails) {
    for (let fieldDetail of fieldDetails) {
      if (!fieldDetail.mlData) {
        continue;
      }

      let words = fieldDetail.mlData[0].split(" ");

      if (fieldDetail.mlData[1]) {
        words = words.concat(
          fieldDetail.mlData[1]
            .split(" ")
            .map(text => ADJACENT_BEFORE_PREFIX + text)
        );
      }
      if (fieldDetail.mlData[2]) {
        words = words.concat(
          fieldDetail.mlData[2]
            .split(" ")
            .map(text => ADJACENT_AFTER_PREFIX + text)
        );
      }

      fieldDetail.mlDataCombined = words.join(" ");
    }
  }

  /**
   * Main entry point for detecting fields. The field names are assigned for
   * each of the given field details by this process. The reason "ml" is
   * assigned to any detected field; other fields are unmodified.
   *
   * If the model is not ready yet, this starts the initialization/download of
   * the model, but returns false early so that a fallback mechanism may be
   * used.
   *
   * @param {object[]} fieldDetails array of field details
   * @returns {boolean} true if successful
   */
  async detectFields(fieldDetails) {
    if (FormAutofillUtils.enableMLAutofillTwoHead) {
      return await this.#detectFieldsTwoHead(fieldDetails);
    }

    return await this.#detectFieldsSingle(fieldDetails);
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
  async #getEngines(configs) {
    const cached = configs.map(config => this.#engines.get(config.featureId));
    if (
      cached.every(
        engine => engine && !["closed", "error"].includes(engine.engineStatus)
      )
    ) {
      this.#publishVersion(configs);
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
        createEngine(withModelRevision({ ...config, timeoutMS }))
      );

      remember(await Promise.all(initPromises));
    } catch (ex) {
      return null;
    }

    // Report the pinned revision when overridden, else the resolved default.
    const override = (FormAutofill.mlModelVersion || "").trim();

    const details = await Promise.all(
      configs.map(config =>
        MLEngineParent.getInferenceOptions(config.featureId, config.taskName)
      )
    );
    // Models are versioned independently, so telemetry reports every revision.
    // A single-model classifier therefore reports just its own revision.
    configs.forEach((config, i) =>
      this.#revisions.set(
        config.featureId,
        override || details[i].modelRevision
      )
    );
    this.#publishVersion(configs);

    return configs.map(config => this.#engines.get(config.featureId));
  }

  async #ensureEngines(configs) {
    let modelIsInstalled = await this.isModelInstalled(configs);

    const enginesPromise = this.#getEngines(configs);

    // If the model is not installed, we create it above but return
    // without waiting since it could take a while to be ready.
    if (!modelIsInstalled) {
      return null;
    }

    return await enginesPromise;
  }

  /**
   * Apply the model's predictions to `fields`, positionally.
   *
   * If ML identifies a field, it overrides the existing value assigned by
   * heuristics, if any. The preference behind 'useHeuristicsForOther'
   * controls whether the model overrides the heuristics when it does not
   * identify a field. Predictions for the field types the model is not
   * trusted with are dropped like the "other" sentinel, since the regexp
   * heuristics have already had their say on those.
   *
   * @param {object[]} fields The field details that were classified.
   * @param {object[]} results One `{ label }` per entry in `fields`.
   */
  applyResults(fields, results) {
    for (let r = 0; r < results.length; r++) {
      const fd = fields[r];
      const fieldName = results[r].label;
      if (fieldName && fieldName != "other") {
        if (!FormAutofillUtils.mlIgnoreFieldTypes.includes(fieldName)) {
          fd.fieldName = fieldName;
          fd.reason = "ml";
        }
      } else if (!FormAutofillUtils.useHeuristicsForOther) {
        fd.fieldName = fieldName;
        fd.reason = "ml";
      }
    }
  }

  /**
   * Detect fields for the single model. See detectFields for details
   * of its usage.
   *
   * @param {object[]} fieldDetails array of field details
   * @returns {boolean} true if sucessful or if there are no fields to identify
   */
  async #detectFieldsSingle(fieldDetails) {
    const engines = await this.#ensureEngines([FormFill_Config]);
    if (!engines) {
      return false;
    }

    this.combineAdjacentTokens(fieldDetails);

    // Only fields that have tokens and don't already have a field name assigned
    // need identifying. One input string per field, classified in one batch.
    const mlFields = fieldDetails.filter(fd => FormAutofillUtils.canUseML(fd));

    if (!mlFields.length) {
      return true; // Success, but no fields to identify.
    }

    const results = await engines[0].run({
      args: [mlFields.map(fd => fd.mlDataCombined)],
      options: { pooling: "mean", normalize: true },
    });

    this.applyResults(mlFields, results);
    return true;
  }

  /**
   * Detect fields for the two-head model. See detectFields for details
   * of its usage.
   *
   * @param {object[]} fieldDetails array of field details
   * @returns {boolean} true if sucessful or if there are no fields to identify
   */
  async #detectFieldsTwoHead(fieldDetails) {
    const engines = await this.#ensureEngines([
      FormFill_Encoder_Config,
      FormFill_Head_Config,
    ]);
    if (!engines) {
      return false;
    }

    const [encoderEngine, headEngine] = engines;

    // Consider every field that has ML tokens. We still only assign a fieldName
    // to fields that don't already have one (see the result loop below), but the
    // neighbor context for each field comes from its OWN baked aa/bb data, so we
    // don't depend on which other fields are present or their ordering.
    const mlFields = fieldDetails.filter(fd => FormAutofillUtils.canUseML(fd));

    if (!mlFields.length) {
      return true; // Success, but no fields to identify.
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
    const sections = mlFields.map(fd => fd.mlData);
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

    this.applyResults(mlFields, scores?.output ?? scores);

    return true;
  }
}
