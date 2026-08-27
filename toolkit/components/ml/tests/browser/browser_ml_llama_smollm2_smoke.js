/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/// <reference path="head.js" />

// Structural smoke for the native llama.cpp backend against the real
// Link Preview model (SmolLM2-360M Q8). Runs under the perftest
// harness so hooks_local_hub.py can serve the GGUF from
// MOZ_FETCHES_DIR/onnx-models/; the mochitest sibling in
// browser_ml_native.js covers the in-tree TinyStories model.

const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_ml_llama_smollm2_smoke.js",
  description:
    "Structural smoke for the native llama.cpp backend with SmolLM2 360M Instruct.",
  options: {
    default: {
      perfherder: false,
      verbose: true,
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      try_platform: ["linux", "mac", "win"],
    },
  },
};

requestLongerTimeout(120);

const SMOLLM2_OPTIONS = {
  backend: "llama.cpp",
  engineId: "link-preview-smoke-smollm2",
  featureId: "link-preview",
  taskName: "llama-text-generation",
  modelId: "HuggingFaceTB/SmolLM2-360M-Instruct-GGUF",
  modelFile: "smollm2-360m-instruct-q8_0.gguf",
  modelRevision: "main",
  modelHubUrlTemplate: "{model}/{revision}",
  numContext: 512,
  useMmap: true,
  useMlock: false,
};

const GREEDY = [{ type: "top-k", topK: 1 }, { type: "dist" }];

const PROMPT_A = [
  { role: "system", content: "You are a friendly storyteller." },
  { role: "user", content: "Once upon a time there was a small mouse who" },
];

const PROMPT_B = [
  { role: "system", content: "You are a friendly storyteller." },
  { role: "user", content: "Deep in the forest, a tall green tree" },
];

// Helpers mirror the ones in browser_ml_native.js.

// Avoid `??` and `?.` here — mozperftest parses tests with esprima
// (Python port) which doesn't recognise nullish-coalescing or optional
// chaining. browser_ml_llama_summarizer_perf.js follows the same rule.
async function runGen(engine, prompt, samplers = GREEDY, nPredict = 32) {
  let text = "";
  let metrics;
  const generator = engine.runWithGenerator({ prompt, samplers, nPredict });
  let result;
  do {
    result = await generator.next();
    if (!result.done) {
      text += result.value.text || "";
    } else if (result.value) {
      metrics = result.value.metrics;
    }
  } while (!result.done);
  return { text, metrics };
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function printableRatio(text) {
  if (!text.length) {
    return 0;
  }
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x20 && code <= 0x7e) ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d
    ) {
      n++;
    }
  }
  return n / [...text].length;
}

function distinctTokenRatio(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return 0;
  }
  return new Set(tokens).size / tokens.length;
}

// Golden pins. Unlike TinyStories (see browser_ml_native.js), SmolLM2's
// greedy output is the same on aarch64 and x86_64: its top-1 logit
// margins are wide enough to absorb FP-rounding differences between
// NEON and AVX, so argmax doesn't flip across architectures. Re-pin
// if a llama.cpp roll legitimately changes outputs.
const EXPECTED_TEXT =
  "who lived in a cozy little house with his family. One day, a big, loud, and wonderful mouse named Max came to visit. He was so big";
const EXPECTED_HASH =
  "07c098aaf1387c9ab07fbb77e466243bf0498f9d22dcc16672c6cfd9f07f4fe3";

add_task(async function test_smollm2_survives_and_metrics_populated() {
  info("test_smollm2_survives_and_metrics_populated: starting");
  const { cleanup, engine } = await initializeEngine(SMOLLM2_OPTIONS);
  info("test_smollm2_survives_and_metrics_populated: engine ready");
  try {
    const { text, metrics } = await runGen(engine, PROMPT_A);
    info(`Output: ${text}`);
    Assert.greater(text.length, 0, "SmolLM2 produced text");
    Assert.ok(metrics, "metrics populated");
    Assert.greater(metrics.inputTokens, 0, "inputTokens > 0");
    Assert.greater(metrics.outputTokens, 0, "outputTokens > 0");
    Assert.greaterOrEqual(metrics.decodingTime, 0, "decodingTime defined");
    Assert.greaterOrEqual(
      metrics.timeToFirstToken,
      0,
      "timeToFirstToken defined"
    );

    // mozperftest requires at least one perfMetrics emission per run,
    // even with perfherder reporting disabled.
    const reported = [
      {
        name: "smollm2-inputTokens",
        values: [metrics.inputTokens],
        value: metrics.inputTokens,
      },
      {
        name: "smollm2-outputTokens",
        values: [metrics.outputTokens],
        value: metrics.outputTokens,
      },
      {
        name: "smollm2-tokensPerSecond",
        values: [metrics.tokensPerSecond],
        value: metrics.tokensPerSecond,
      },
    ];
    info(`perfMetrics | ${JSON.stringify(reported)}`);
  } finally {
    await engine.terminate();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});

add_task(async function test_smollm2_output_looks_like_text() {
  info("test_smollm2_output_looks_like_text: starting");
  const { cleanup, engine } = await initializeEngine(SMOLLM2_OPTIONS);
  info("test_smollm2_output_looks_like_text: engine ready");
  try {
    const { text } = await runGen(engine, PROMPT_A);
    info(`Output: ${text}`);
    Assert.notEqual(
      text.trim(),
      PROMPT_A[1].content.trim(),
      "Output is not a verbatim echo of the user prompt"
    );
    const pr = printableRatio(text);
    info(`Printable-ASCII ratio: ${pr.toFixed(3)}`);
    Assert.greater(
      pr,
      0.9,
      `Output should be mostly printable (got ${pr.toFixed(3)})`
    );
    const dr = distinctTokenRatio(text);
    info(`Distinct-token ratio: ${dr.toFixed(3)}`);
    Assert.greater(
      dr,
      0.3,
      `Output should not be a degenerate loop (got ${dr.toFixed(3)})`
    );
  } finally {
    await engine.terminate();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});

add_task(async function test_smollm2_greedy_is_deterministic() {
  info("test_smollm2_greedy_is_deterministic: starting");
  const { cleanup, engine } = await initializeEngine(SMOLLM2_OPTIONS);
  info("test_smollm2_greedy_is_deterministic: engine ready");
  try {
    const { text: a } = await runGen(engine, PROMPT_A);
    const { text: b } = await runGen(engine, PROMPT_A);
    info(`Greedy A: ${a}`);
    info(`Greedy B: ${b}`);
    Assert.equal(a, b, "Two greedy runs of the same prompt produce same text");
  } finally {
    await engine.terminate();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});

add_task(async function test_smollm2_engine_is_prompt_sensitive() {
  info("test_smollm2_engine_is_prompt_sensitive: starting");
  const { cleanup, engine } = await initializeEngine(SMOLLM2_OPTIONS);
  info("test_smollm2_engine_is_prompt_sensitive: engine ready");
  try {
    const { text: a } = await runGen(engine, PROMPT_A);
    const { text: b } = await runGen(engine, PROMPT_B);
    info(`Prompt A output: ${a}`);
    info(`Prompt B output: ${b}`);
    Assert.notEqual(
      a,
      b,
      "Different prompts should produce different greedy outputs"
    );
  } finally {
    await engine.terminate();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});

add_task(async function test_smollm2_golden_text() {
  info("test_smollm2_golden_text: starting");
  const { cleanup, engine } = await initializeEngine(SMOLLM2_OPTIONS);
  info("test_smollm2_golden_text: engine ready");
  try {
    const { text } = await runGen(engine, PROMPT_A);
    const hash = await sha256Hex(text);
    info(`SmolLM2 greedy text: ${text}`);
    info(`SmolLM2 greedy SHA-256: ${hash}`);
    Assert.equal(
      text,
      EXPECTED_TEXT,
      "SmolLM2 greedy output matches the pinned golden text"
    );
    Assert.equal(
      hash,
      EXPECTED_HASH,
      "SmolLM2 greedy output hash matches the pinned golden hash"
    );
  } finally {
    await engine.terminate();
    await EngineProcess.destroyMLEngine();
    await cleanup();
  }
});
