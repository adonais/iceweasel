/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { BACKENDS, EngineProcess, PipelineOptions, createEngine } =
  ChromeUtils.importESModule(
    "chrome://global/content/ml/EngineProcess.sys.mjs"
  );

// A cold-start CI worker has to fetch a ~386 MB GGUF before inference can run,
// so allow more than the default 45 s browser-chrome per-test timeout.
requestLongerTimeout(4);

add_task(async function test_smollm2_real_chat_generation() {
  const engine = await createEngine(
    new PipelineOptions({
      engineId: "smollm2-chat-e2e",
      taskName: "text-generation",
      backend: BACKENDS.llamaCpp,
      modelId: "HuggingFaceTB/SmolLM2-360M-Instruct-GGUF",
      modelRevision: "main",
      modelHubUrlTemplate: "{model}/{revision}",
      modelHubRootUrl: "https://model-hub.mozilla.org/",
      modelFile: "smollm2-360m-instruct-q8_0.gguf",
    })
  );

  const prompt = [
    { role: "system", content: "You are a helpful assistant. Answer briefly." },
    {
      role: "user",
      content: "What color is a clear daytime sky? Answer in one word.",
    },
  ];
  const request = { prompt, nPredict: 24 };

  let text = "";
  let generatedTokens = 0;

  try {
    for await (const chunk of engine.runWithGenerator(request)) {
      if (chunk.isPrompt) {
        continue;
      }
      text += chunk.text ?? "";
      generatedTokens += chunk.tokens?.flat()?.length || 0;
    }

    info(`SmolLM2 chat output: ${text.trim()}`);

    Assert.greater(text.trim().length, 0, "Model produced non-empty output.");
    Assert.greater(generatedTokens, 0, "Real tokens were decoded.");
    const promptText = prompt.map(m => m.content).join(" ");
    Assert.notEqual(
      text.trim(),
      promptText,
      "Output is not just the prompt echoed."
    );
  } finally {
    await engine.terminate();
    await EngineProcess.destroyMLEngine();
  }
});
