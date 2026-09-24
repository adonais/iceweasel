/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Latency test for the ML Autofill model.
//
// Both field classifiers are exercised unconditionally, so the two are tracked
// side by side in perfherder while the two-engine one is being evaluated. Which
// one production actually uses is decided at runtime by
// `extensions.formautofill.useml.twoHead`, but this test drives the engines
// directly and so does not read that pref.
//
//   1. DEFAULT: the single-model `text-classification` classifier
//      (Mozilla/tinybert-address-autofill) -- `test_ml_generic_pipeline`.
//   2. OPT-IN (two-head): a triple-encoder deployed as TWO engines
//      (see toolkit/components/formautofill/shared/FormAutofillML.sys.mjs) --
//      `test_ml_autofill_two_engine_pipeline`:
//        - ENCODER: a stock `feature-extraction` model that turns each field's
//          token string into one mean-pooled embedding (run once per form over
//          the set of unique field sections).
//        - HEAD: a tiny custom `moz-formfill-head` pipeline that scores the
//          windowed features `[e_cur, e_prev, e_next, e_cur-e_prev, e_cur-e_next]`
//          (5 x 384 = 1920 dims) into a field type, once for all fields.

const EMBEDDING_DIM = 384;
const HEAD_FEATURE_DIM = 5 * EMBEDDING_DIM; // cur, prev, next, cur-prev, cur-next

// A shared representative form: each field's own tokens (id/name/placeholder/
// label words). BOTH classifiers are measured on THIS SAME form so the latency
// is an apples-to-apples per-form comparison. Values only need to be realistic
// in length/count; they don't affect latency materially.
const FIELD_TOKENS = [
  "firstname first name enter your first name",
  "lastname last name surname family name",
  "email email address your email",
  "tel phone phone number mobile",
  "address address line 1 street address",
  "address2 address line 2 apartment suite unit",
  "city town city suburb",
  "state province region county",
  "zip postal code postcode zip code",
  "country country region",
  "organization company organization",
];
const NUM_FIELDS = FIELD_TOKENS.length;

// Two-head model (encoder): the unique section strings the encoder embeds once
// per form -- each field's own tokens plus the empty boundary section. Neighbor
// sections are other fields' own tokens, already present in this set.
const ENCODER_INPUTS = [...FIELD_TOKENS, ""];

// Prefix each token in `tokens` with `prefix` (FormAutofillHeuristics prefixes a
// field's previous-neighbor tokens with "bb" and next-neighbor tokens with "aa").
function prefixTokens(tokens, prefix) {
  return tokens
    .split(/\s+/)
    .filter(Boolean)
    .map(w => prefix + w)
    .join(" ");
}

// Single-model input: one combined string PER FIELD -- own tokens + the previous
// field's tokens ("bb"-prefixed) + the next field's tokens ("aa"-prefixed) --
// exactly the `mlData` the single text-classification model receives in
// production. The whole form is classified in ONE batched engine.run, matching
// FormAutofillML's default path (`args: [inputData]`).
const SINGLE_MODEL_INPUTS = FIELD_TOKENS.map((own, i) => {
  const parts = [own];
  if (i > 0) {
    parts.push(prefixTokens(FIELD_TOKENS[i - 1], "bb"));
  }
  if (i < FIELD_TOKENS.length - 1) {
    parts.push(prefixTokens(FIELD_TOKENS[i + 1], "aa"));
  }
  return parts.join(" ");
});

// Synthetic head input: NUM_FIELDS rows of HEAD_FEATURE_DIM floats. The values
// don't affect latency, so they're small and deterministic for reproducibility.
function buildHeadRows(nRows, dim) {
  const rows = [];
  for (let i = 0; i < nRows; i++) {
    const row = new Array(dim);
    for (let j = 0; j < dim; j++) {
      row[j] = ((i * 31 + j) % 97) / 97 - 0.5;
    }
    rows.push(row);
  }
  return rows;
}

// DEFAULT single-model classifier, shared by the latency and accuracy tasks so
// both measure the exact same engine.
const SINGLE_MODEL_CONFIG = {
  taskName: "text-classification",
  modelId: "mozilla/tinybert-address-autofill",
  modelHubUrlTemplate: "{model}/{revision}",
  modelRevision: "v0.2.5",
  // q8 resolves to onnx/model_quantized.onnx
  dtype: "q8",
  // Prefer the native onnxruntime when the platform bundles it, else wasm.
  backend: "best-onnx",
  numThreads: 2,
  timeoutMS: -1,
};

const SINGLE_MODEL_RUN_OPTIONS = { pooling: "mean", normalize: true };

const ENGINES = {
  "autofill-encoder": {
    engineId: "autofill-encoder",
    metricPrefix: "AUTOFILL-encoder",
    taskName: "feature-extraction",
    modelId: "mozilla/form-autofill-embed",
    modelRevision: "v0.3.1",
    modelHubUrlTemplate: "{model}/{revision}",
    dtype: "q8",
    // Prefer the native onnxruntime when the platform bundles it, else wasm.
    backend: "best-onnx",
    numThreads: 2,
    request: {
      args: [ENCODER_INPUTS],
      // Raw attention-masked mean pooling, NO L2 normalization -- must match
      // how the head was trained (FormAutofillML.sys.mjs).
      options: { pooling: "mean", normalize: false },
    },
  },
  "autofill-head": {
    engineId: "autofill-head",
    metricPrefix: "AUTOFILL-head",
    taskName: "moz-formfill-head",
    modelId: "mozilla/form-autofill-head",
    // The head model itself has not changed -- v0.1.0, v0.3.0 and v0.3.1 are
    // byte-identical. v0.3.1 is published so the encoder and head of the
    // two-head pair carry the same revision.
    modelRevision: "v0.3.1",
    modelHubUrlTemplate: "{model}/{revision}",
    dtype: "fp32",
    // Prefer the native onnxruntime when the platform bundles it, else wasm.
    backend: "best-onnx",
    numThreads: 2,
    request: {
      args: [buildHeadRows(NUM_FIELDS, HEAD_FEATURE_DIM)],
    },
  },
};

// "two-engine" keeps these apart from the runMLPerfTest("autofill") series
// in perfherder.
const e2eRunLatencyMetric = tag => `AUTOFILL-two-engine-e2e-run-latency-${tag}`;
const concurrentInitLatencyMetric = tag =>
  `AUTOFILL-two-engine-concurrent-init-latency-${tag}`;
const twoEngineMemoryMetric = tag =>
  `AUTOFILL-two-engine-total-memory-usage-${tag}`;

// Accuracy corpus: one labeled field per line, as
// "<page>,<expected label>,<label id>,<mlData>". The mlData column is the very
// string FormAutofillHeuristics hands the default classifier (own tokens plus
// the "bb"/"aa" prefixed neighbor tokens), so no preprocessing is needed here.
const ACCURACY_DATA_ROOT =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/data/autofill/";
const ACCURACY_DATASET = "testing-supported.txt";

// The corpus spells "this field is not autofillable" as "--NONE--"; the model
// spells it "other" (see FormAutofillML.#applyResults, which drops that label).
const NONE_LABEL = "--NONE--";

// Fields are classified a form at a time in production, but scoring them one by
// one would dominate the task's runtime; batching does not change any
// prediction.
const ACCURACY_BATCH_SIZE = 64;

// Smoke-test floor, below the model's real score: it catches a broken label
// mapping or a model that failed to load.
const MIN_ACCURACY = 0.85;

const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_ml_autofill_perf.js",
  description:
    "Latency for the ML Autofill model (default single-model and opt-in two-engine)",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        // Default single text-classification model (test_ml_generic_pipeline).
        {
          name: "AUTOFILL-pipeline-ready-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-initialization-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-model-run-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-total-memory-usage",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "tokenSpeed",
          unit: "tokens/s",
          shouldAlert: false,
          lowerIsBetter: false,
        },
        {
          name: "charactersSpeed",
          unit: "chars/s",
          shouldAlert: false,
          lowerIsBetter: false,
        },
        // Opt-in two-engine (encoder + head) architecture
        // (test_ml_autofill_two_engine_pipeline). Uppercase "AUTOFILL-" prefix
        // to match the single-model metrics above.
        // NOTE: these must be string LITERALS -- the mozperftest static parser
        // (mozperftest/script.py) reads this object and rejects identifiers /
        // expressions. Keep them in sync with the *_METRIC constants and the
        // engine metricPrefix values used below.
        {
          name: "AUTOFILL-two-engine-concurrent-init-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-two-engine-e2e-run-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-two-engine-total-memory-usage",
          unit: "MiB",
          shouldAlert: false,
        },
        // Per-engine latencies (encoder + head). The runtime appends the
        // backend tag; these match as substrings.
        {
          name: "AUTOFILL-encoder-pipeline-ready-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-encoder-initialization-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-encoder-model-run-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-head-pipeline-ready-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-head-initialization-latency",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "AUTOFILL-head-model-run-latency",
          unit: "ms",
          shouldAlert: false,
        },
      ],
      verbose: true,
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      try_platform: ["linux", "mac", "win"],
    },
  },
};

requestLongerTimeout(10);

/**
 * DEFAULT: single-model text-classification autofill classifier.
 *
 * Classifies the WHOLE form in one batched run (one string per field, each
 * carrying its own tokens plus the aa/bb neighbor context), exactly as
 * FormAutofillML's default path does -- so `AUTOFILL-model-run-latency` is a
 * per-form cost directly comparable to the two-engine pipeline's
 * `AUTOFILL-two-engine-e2e-run-latency`.
 */
add_task(async function test_ml_generic_pipeline() {
  const options = new PipelineOptions(SINGLE_MODEL_CONFIG);

  const request = {
    args: [SINGLE_MODEL_INPUTS],
    options: SINGLE_MODEL_RUN_OPTIONS,
  };

  await runMLPerfTest({ name: "autofill", options, request });
});

/**
 * Parses the labeled corpus into `{ label, mlData }` rows. The mlData column is
 * taken as everything after the third comma, since it can contain commas of its
 * own.
 *
 * @param {string} text Raw contents of the dataset file.
 * @returns {Array<{label: string, mlData: string}>}
 */
function parseAccuracyDataset(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const columns = line.split(",");
    if (columns.length < 4) {
      continue;
    }
    const mlData = columns.slice(3).join(",").trim();
    if (mlData) {
      rows.push({ label: columns[1].trim(), mlData });
    }
  }
  return rows;
}

function normalizeLabel(label) {
  return !label || label === "other" ? NONE_LABEL : label;
}

/**
 * DEFAULT model quality: predicted vs. expected field type over the labeled
 * corpus, using the same engine and request shape as
 * `test_ml_generic_pipeline`.
 */
add_task(async function test_ml_autofill_accuracy() {
  await runMLPerfTestForEachBackend({
    name: "AUTOFILL-ACCURACY",
    run: runAccuracySweep,
  });
});

async function runAccuracySweep({ backend, tag }) {
  const rows = parseAccuracyDataset(
    await fetchFile(ACCURACY_DATA_ROOT, ACCURACY_DATASET)
  );
  Assert.greater(rows.length, 0, `${ACCURACY_DATASET} yielded labeled fields`);
  info(`Scoring ${rows.length} labeled fields from ${ACCURACY_DATASET}`);

  const { cleanup, engine } = await initializeEngine(
    new PipelineOptions({ ...SINGLE_MODEL_CONFIG, backend })
  );

  const predictions = [];
  try {
    for (let i = 0; i < rows.length; i += ACCURACY_BATCH_SIZE) {
      const batch = rows.slice(i, i + ACCURACY_BATCH_SIZE);
      const results = await engine.run({
        args: [batch.map(row => row.mlData)],
        options: SINGLE_MODEL_RUN_OPTIONS,
      });
      predictions.push(...(Array.isArray(results) ? results : results.output));
    }
  } finally {
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }

  Assert.equal(
    predictions.length,
    rows.length,
    "The model returned one prediction per labeled field"
  );

  // Overall is what the model gets right; the two splits separate "recognized
  // the right field type" from "correctly stayed out of the way", which move in
  // opposite directions when a model gets more or less eager.
  const tally = { overall: [0, 0], supported: [0, 0], none: [0, 0] };
  const perLabel = new Map();
  for (let i = 0; i < rows.length; i++) {
    const expected = rows[i].label;
    const correct = normalizeLabel(predictions[i].label) === expected;
    const split = expected === NONE_LABEL ? "none" : "supported";
    for (const bucket of ["overall", split]) {
      tally[bucket][0] += correct ? 1 : 0;
      tally[bucket][1] += 1;
    }
    const counts = perLabel.get(expected) || [0, 0];
    counts[0] += correct ? 1 : 0;
    counts[1] += 1;
    perLabel.set(expected, counts);
  }

  // Per-label numbers are for triaging a drop, so they're logged rather than
  // turned into perfherder series.
  for (const [label, [correct, total]] of [...perLabel].sort()) {
    info(`${label}: ${correct}/${total}`);
  }

  // Logged rather than reported to perfherder: this is a smoke test, not a
  // quality-tracking series.
  for (const [kind, [hits, seen]] of Object.entries(tally)) {
    if (seen) {
      info(`[${tag}] accuracy ${kind}: ${((100 * hits) / seen).toFixed(2)}%`);
    }
  }

  const [correct, total] = tally.overall;
  Assert.greaterOrEqual(
    correct / total,
    MIN_ACCURACY,
    `Accuracy ${correct}/${total} is above the smoke-test floor`
  );
}

/**
 * Two-head model quality: encoder + fusion head over the same labeled
 * corpus `test_ml_autofill_accuracy` scores the default classifier on, so the
 * two architectures are directly comparable in perfherder.
 *
 * The encoder is quantized (q8) and the head is fp32, so this is what catches a
 * bad encoder quantization -- the head has no argmax of its own to absorb a
 * drifting embedding.
 */
add_task(async function test_ml_autofill_two_head_accuracy() {
  await runMLPerfTestForEachBackend({
    name: "AUTOFILL-TWO-HEAD-ACCURACY",
    run: runTwoHeadAccuracySweep,
  });
});

async function runTwoHeadAccuracySweep({ backend, tag }) {
  const rows = parseAccuracyDataset(
    await fetchFile(ACCURACY_DATA_ROOT, ACCURACY_DATASET)
  );
  Assert.greater(rows.length, 0, `${ACCURACY_DATASET} yielded labeled fields`);

  // Mirrors FormAutofillML.#identifyFields: split every field into its three
  // sections, embed each DISTINCT section once, then look the three up by value.
  const sections = rows.map(r => splitContext(r.mlData));
  const uniqueStrings = [...new Set([""].concat(...sections.flat()))];
  info(
    `Scoring ${rows.length} labeled fields via ${uniqueStrings.length} unique sections`
  );

  const encoderCfg = ENGINES["autofill-encoder"];
  const headCfg = ENGINES["autofill-head"];
  const encoder = await initializeEngine(
    new PipelineOptions({ timeoutMS: -1, ...encoderCfg, backend })
  );
  const head = await initializeEngine(
    new PipelineOptions({ timeoutMS: -1, ...headCfg, backend })
  );

  const predictions = [];
  try {
    // Pooling must match training exactly: attention-masked mean, NO L2
    // normalization. The head was trained on un-normalized vectors.
    const embByString = new Map();
    for (let i = 0; i < uniqueStrings.length; i += ACCURACY_BATCH_SIZE) {
      const batch = uniqueStrings.slice(i, i + ACCURACY_BATCH_SIZE);
      let embeddings = await encoder.engine.run({
        args: [batch],
        options: { pooling: "mean", normalize: false },
      });
      // feature-extraction can triple-nest a singleton batch.
      if (
        Array.isArray(embeddings) &&
        embeddings.length === 1 &&
        Array.isArray(embeddings[0]) &&
        embeddings[0].length !== EMBEDDING_DIM
      ) {
        embeddings = embeddings[0];
      }
      Assert.equal(
        embeddings.length,
        batch.length,
        "The encoder returned one embedding per section"
      );
      for (let j = 0; j < batch.length; j++) {
        embByString.set(batch[j], embeddings[j]);
      }
    }

    // [e_cur, e_prev, e_next, e_cur - e_prev, e_cur - e_next] -- 1920 dims.
    const featureRows = sections.map(([curStr, prevStr, nextStr]) => {
      const cur = embByString.get(curStr);
      const prev = embByString.get(prevStr);
      const next = embByString.get(nextStr);
      return [
        ...cur,
        ...prev,
        ...next,
        ...cur.map((v, j) => v - prev[j]),
        ...cur.map((v, j) => v - next[j]),
      ];
    });
    Assert.equal(
      featureRows[0].length,
      HEAD_FEATURE_DIM,
      "Feature rows are the width the head expects"
    );

    for (let i = 0; i < featureRows.length; i += ACCURACY_BATCH_SIZE) {
      const scores = await head.engine.run({
        args: [featureRows.slice(i, i + ACCURACY_BATCH_SIZE)],
      });
      // No optional chaining here: mozperftest statically parses this file with
      // a vendored esprima that rejects `?.`.
      predictions.push(...(scores && scores.output ? scores.output : scores));
    }
  } finally {
    await EngineProcess.destroyMLEngine();
    await encoder.cleanup();
    await head.cleanup();
  }

  Assert.equal(
    predictions.length,
    rows.length,
    "The two-head pipeline returned one prediction per labeled field"
  );

  const tally = { overall: [0, 0], supported: [0, 0], none: [0, 0] };
  const perLabel = new Map();
  for (let i = 0; i < rows.length; i++) {
    const expected = rows[i].label;
    const correct = normalizeLabel(predictions[i].label) === expected;
    const split = expected === NONE_LABEL ? "none" : "supported";
    for (const bucket of ["overall", split]) {
      tally[bucket][0] += correct ? 1 : 0;
      tally[bucket][1] += 1;
    }
    const counts = perLabel.get(expected) || [0, 0];
    counts[0] += correct ? 1 : 0;
    counts[1] += 1;
    perLabel.set(expected, counts);
  }

  for (const [label, [correct, total]] of [...perLabel].sort()) {
    info(`${label}: ${correct}/${total}`);
  }

  // Logged rather than reported to perfherder: this is a smoke test, not a
  // quality-tracking series.
  for (const [kind, [hits, seen]] of Object.entries(tally)) {
    if (seen) {
      info(
        `[${tag}] twohead accuracy ${kind}: ${((100 * hits) / seen).toFixed(2)}%`
      );
    }
  }

  const [correct, total] = tally.overall;
  Assert.greaterOrEqual(
    correct / total,
    MIN_ACCURACY,
    `Two-head accuracy ${correct}/${total} is above the smoke-test floor`
  );
}

/**
 * Runs inference on an initialized engine `iterations` times and collects the
 * latency metrics, prefixed with the engine's `metricPrefix` (e.g.
 * "AUTOFILL-encoder").
 */
async function runEngineWithMetrics(engine, engineConfig, iterations, tag) {
  const journal = {};
  for (let i = 0; i < iterations; i++) {
    const res = await engine.run(engineConfig.request);
    const metrics = fetchMetrics(res.metrics);
    for (const [metricName, metricVal] of Object.entries(metrics)) {
      const key = `${engineConfig.metricPrefix}-${metricName}-${tag}`;
      (journal[key] = journal[key] || []).push(metricVal);
    }
  }
  return journal;
}

/**
 * OPT-IN: two-engine (encoder + head) ML Autofill pipeline -- per-engine latency
 * plus the end-to-end per-form cost (encode -> head).
 */
add_task(async function test_ml_autofill_two_engine_pipeline() {
  await runMLPerfTestForEachBackend({
    name: "AUTOFILL-TWO-ENGINE",
    run: runTwoEnginePipeline,
  });
});

async function runTwoEnginePipeline({ backend, tag }) {
  const configs = Object.values(ENGINES);

  // Initialize both engines CONCURRENTLY, matching FormAutofillML.#ensureEngines
  // which fires both createEngine calls then `await Promise.all([...])`.
  const initBoth = () =>
    Promise.all(
      configs.map(async cfg => {
        const { cleanup, engine } = await initializeEngine(
          new PipelineOptions({ timeoutMS: -1, ...cfg, backend })
        );
        return { cleanup, engine, cfg };
      })
    );

  const combined = {};
  const merge = j => {
    for (const [k, v] of Object.entries(j)) {
      (combined[k] = combined[k] || []).push(...v);
    }
  };

  // Concurrent init wall-clock (Promise.all over both engines): the real
  // one-time first-use startup cost. Measured across ITERATIONS for a median,
  // tearing both engines down between runs so each is a fresh init.
  combined[concurrentInitLatencyMetric(tag)] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const insts = await initBoth();
    combined[concurrentInitLatencyMetric(tag)].push(performance.now() - t0);
    await EngineProcess.destroyMLEngine();
    for (const { cleanup } of insts) {
      await cleanup();
    }
  }

  // Fresh init for the per-engine run + end-to-end measurements.
  const instances = await initBoth();
  info("Encoder and head engines initialized");

  try {
    // Per-engine latency (encoder, then head).
    for (const { engine, cfg } of instances) {
      merge(await runEngineWithMetrics(engine, cfg, ITERATIONS, tag));
    }

    // End-to-end per-form latency: encode once, then score once -- the real flow.
    const encoder = instances[0];
    const head = instances[1];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      await encoder.engine.run(encoder.cfg.request);
      await head.engine.run(head.cfg.request);
      (combined[e2eRunLatencyMetric(tag)] =
        combined[e2eRunLatencyMetric(tag)] || []).push(
        performance.now() - start
      );
    }

    const memUsage = await getTotalMemoryUsage();
    (combined[twoEngineMemoryMetric(tag)] =
      combined[twoEngineMemoryMetric(tag)] || []).push(memUsage);
  } finally {
    // The next backend in the matrix starts from a clean engine process.
    await EngineProcess.destroyMLEngine();
    for (const { cleanup } of instances) {
      await cleanup();
    }
  }

  Assert.ok(true);
  reportMetrics(combined);
}
