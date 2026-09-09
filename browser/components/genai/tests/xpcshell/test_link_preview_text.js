/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { LinkPreviewModel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/LinkPreviewModel.sys.mjs"
);
const { SentencePostProcessor } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/LinkPreviewModel.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { BlockListManager } = ChromeUtils.importESModule(
  "chrome://global/content/ml/Utils.sys.mjs"
);

// Required before any Glean testGetValue call below.
do_get_profile();
Services.fog.initializeFOG();

/**
 * Test that text is processed for ai.
 */
add_task(function test_text_processing() {
  const text = "This is a test sentence. ";
  Assert.equal(
    LinkPreviewModel.preprocessText(text),
    "This is a test sentence.",
    "basic sentence should be trimmed"
  );
  Assert.equal(
    LinkPreviewModel.preprocessText("Too short."),
    "",
    "short sentence should be removed"
  );
  Assert.equal(
    LinkPreviewModel.preprocessText("Today is Mar. 12, 2025."),
    "Today is Mar. 12, 2025.",
    "abbreviations don't break sentences"
  );
  Assert.equal(
    LinkPreviewModel.preprocessText("Thisisatestsentence but fewwords."),
    "",
    "needs enough words"
  );
  Assert.equal(
    LinkPreviewModel.preprocessText(
      "This is a test sentence without punctuation"
    ),
    "",
    "needs punctuation"
  );
  Assert.equal(
    LinkPreviewModel.preprocessText(`${text}
    Too short.
    Today is Mar. 12, 2025.
    Thisisatestsentence but fewwords.
    This is a test sentence without punctuation`),
    "This is a test sentence. Today is Mar. 12, 2025.",
    "multiple sentences should be processed"
  );

  Assert.equal(
    LinkPreviewModel.preprocessText(`${text}

     Short \t\t\t\t\t\t\t\t\t\t                      without spaces.



      It has           \t \t \t multiple consecutive spaces in between words.
      They should all go away
   `),
    "This is a test sentence. It has multiple consecutive spaces in between words.",
    "Remove consecutive spaces by single."
  );

  Assert.equal(
    LinkPreviewModel.preprocessText(text.repeat(100)),
    text.repeat(6).trim(),
    "restrict to 6 sentences"
  );

  Assert.equal(
    LinkPreviewModel.preprocessText(
      "This is a test sentence with an emoji \ud83e\udd14."
    ),
    "This is a test sentence with an emoji .",
    "emoji should be removed from the sentence"
  );
});

/**
 * Test that prefs affect text processing.
 */
add_task(function test_text_processing_prefs() {
  const text = "This is a test sentence. ";
  Services.prefs.setIntPref("browser.ml.linkPreview.inputSentences", 3);
  Assert.equal(
    LinkPreviewModel.preprocessText(text.repeat(100)),
    text.repeat(3).trim(),
    "restrict to 3 sentences"
  );

  Services.prefs.setIntPref(
    "browser.ml.linkPreview.minWordsPerOutputSentences",
    3
  );
  let processor = new SentencePostProcessor();
  let output = "";
  output += processor.put("I am writing unit test.").sentence;

  output += processor.put(" So great.").sentence;

  output += processor.put(" I like it.").sentence;

  output += processor.put(" Done. ").sentence;

  Assert.equal(
    output,
    "I am writing unit test. I like it. ",
    "ignore too short sentences"
  );

  Services.prefs.setIntPref(
    "browser.ml.linkPreview.minWordsPerOutputSentences",
    4
  );
  processor = new SentencePostProcessor();
  output = "";
  output += processor.put("I am writing unit test.").sentence;

  output += processor.put(" So great.").sentence;

  output += processor.put(" I like it.").sentence;

  output += processor.put(" Done. ").sentence;

  Assert.equal(
    output,
    "I am writing unit test. ",
    "ignore too short sentences"
  );

  Services.prefs.clearUserPref("browser.ml.linkPreview.inputSentences");
  Services.prefs.clearUserPref(
    "browser.ml.linkPreview.minWordsPerOutputSentences"
  );
});

/**
 * Test that post processor provides sentences.
 */
add_task(function test_sentence_post_processor() {
  const processor = new SentencePostProcessor();
  Assert.deepEqual(
    processor.put("Hello "),
    { sentence: "", abort: false },
    "no sentence yet"
  );
  Assert.deepEqual(
    processor.put("world. "),
    { sentence: "", abort: false },
    "sentence complete but not next"
  );
  Assert.deepEqual(
    processor.put("How "),
    { sentence: "Hello world. ", abort: false },
    "previous sentence complete"
  );
  Assert.deepEqual(
    processor.put("are you today? I'm"),
    { sentence: "How are you today? ", abort: false },
    "question complete"
  );
  Assert.deepEqual(
    processor.put(" fine. And"),
    { sentence: "I'm fine. ", abort: true },
    "response complete"
  );
  Assert.deepEqual(
    processor.put("you? Good"),
    { sentence: "", abort: true },
    "hit limit"
  );
  Assert.equal(processor.flush(), "", "still nothing at limit");
});

/**
 * Test that generateTextAI works properly with the blocklist
 */
add_task(async function test_generateAI_with_blocklist() {
  // Mocked ML Engine
  const engine = {
    async *runWithGenerator() {
      const preview =
        "Hello world, I am here and would like to make a sentence. Now, more sentences are coming.  Even more are raining here. Bye";

      for (const text of preview) {
        yield { text };
      }
    },

    terminate() {},
  };

  // Mocked Blocked List Manager
  let manager = new BlockListManager({
    blockNgrams: [BlockListManager.encodeBase64("hello")],
    language: "en",
  });

  // Disable block list
  Services.prefs.setBoolPref("browser.ml.linkPreview.blockListEnabled", false);

  let createEngineStub = sinon
    .stub(LinkPreviewModel, "createEngine")
    .returns(engine);

  let managerStub = sinon
    .stub(BlockListManager, "initializeFromRemoteSettings")
    .returns(manager);

  let numOutputs = 0;

  await LinkPreviewModel.generateTextAI(
    "This is the big article. Now give me its preview. Please.",
    {
      onText: () => {
        numOutputs += 1;
      },
    }
  );

  Assert.equal(
    numOutputs,
    3,
    "should output all sentences when block list is disabled"
  );

  // Enable block list
  Services.prefs.setBoolPref("browser.ml.linkPreview.blockListEnabled", true);

  numOutputs = 0;

  await LinkPreviewModel.generateTextAI(
    "This is the big article. Now give me its preview. Please.",
    {
      onText: () => {
        numOutputs += 1;
      },
    }
  );

  Assert.equal(
    numOutputs,
    0,
    "Should output no sentences when 1st sentence contains block word and block list enabled."
  );

  managerStub.restore();
  manager = new BlockListManager({
    blockNgrams: [BlockListManager.encodeBase64("coming")],
    language: "en",
  });
  managerStub = sinon
    .stub(BlockListManager, "initializeFromRemoteSettings")
    .returns(manager);

  // Force link preview to reload blockList manager
  Services.prefs.setBoolPref("browser.ml.linkPreview.blockListEnabled", false);
  await LinkPreviewModel.generateTextAI(
    "This is the big article. Now give me its preview. Please."
  );

  Assert.equal(LinkPreviewModel.blockListManager, null);

  // Now re-enable block list
  Services.prefs.setBoolPref("browser.ml.linkPreview.blockListEnabled", true);

  numOutputs = 0;
  await LinkPreviewModel.generateTextAI(
    "This is the big article. Now give me its preview. Please.",
    {
      onText: () => {
        numOutputs += 1;
      },
    }
  );

  Assert.equal(
    numOutputs,
    1,
    "Should output 1 sentence when blocked word found 1st time in 2nd sentence and block list enabled."
  );

  Services.prefs.setBoolPref("browser.ml.linkPreview.blockListEnabled", false);

  numOutputs = 0;

  await LinkPreviewModel.generateTextAI(
    "This is the big article. Now give me its preview. Please.",
    {
      onText: () => {
        numOutputs += 1;
      },
    }
  );

  Assert.equal(
    numOutputs,
    3,
    "all sentences should be outputted when block list disabled"
  );

  Services.prefs.clearUserPref("browser.ml.linkPreview.blockListEnabled");
  createEngineStub.restore();
  managerStub.restore();
});

/**
 * Test post processor respects limits.
 */
add_task(function test_sentence_post_processor_limits() {
  const processor = new SentencePostProcessor({
    maxNumOutputSentences: 1,
  });
  Assert.deepEqual(
    processor.put("Hi. There. "),
    { sentence: "Hi. ", abort: true },
    "first sentence"
  );
  Assert.deepEqual(
    processor.put("Nope."),
    { sentence: "", abort: true },
    "no more sentences"
  );

  Services.prefs.setIntPref("browser.ml.linkPreview.outputSentences", 2);
  const viaPref = new SentencePostProcessor();
  Assert.deepEqual(
    viaPref.put("Hi. There. "),
    { sentence: "Hi. ", abort: false },
    "first sentence"
  );
  Assert.deepEqual(
    viaPref.put("Yup. "),
    { sentence: "There. ", abort: true },
    "second sentence"
  );
  Assert.deepEqual(
    viaPref.put("Nope."),
    { sentence: "", abort: true },
    "no more sentences"
  );
  Services.prefs.clearUserPref("browser.ml.linkPreview.outputSentences");
});

/**
 * The smoke test reuses the engine that just served the user's preview. When
 * generateTextAI breaks out of its loop early the engine's run is still in
 * flight, and the llama.cpp backend rejects a second generation while one is
 * active, so the smoke test must be skipped on that path. Counting runs on the
 * mocked engine distinguishes "skipped" from "never called at all".
 */
add_task(async function test_smoke_test_skipped_when_generation_abandoned() {
  const SMOKE_MODEL_ID = "HuggingFaceTB/SmolLM2-360M-Instruct-GGUF";
  const LAST_BUILD_ID_PREF = "browser.ml.linkPreview.smokeTest.lastBuildID";

  function mockEngine(preview) {
    const engine = {
      runCount: 0,
      pipelineOptions: {
        backend: "llama.cpp",
        modelId: SMOKE_MODEL_ID,
        modelRevision: "main",
      },
      telemetry: { flowId: "test-flow-id" },
      async *runWithGenerator() {
        engine.runCount++;
        for (const text of preview) {
          yield { text };
        }
      },
      terminate() {},
    };
    return engine;
  }

  Services.prefs.setBoolPref("browser.ml.linkPreview.blockListEnabled", false);
  Services.prefs.clearUserPref(LAST_BUILD_ID_PREF);
  Services.fog.testResetFOG();

  // Four sentences against the default limit of three, so the loop aborts
  // with the generation still running.
  const abandoned = mockEngine(
    "One sentence here. Two sentences here. Three sentences here. Four here."
  );
  let createEngineStub = sinon
    .stub(LinkPreviewModel, "createEngine")
    .returns(abandoned);
  await LinkPreviewModel.generateTextAI("This is the big article to preview.");
  Assert.equal(
    abandoned.runCount,
    1,
    "smoke test is skipped when the generation was abandoned early"
  );
  Assert.equal(
    Glean.genaiLinkpreview.smokeTest.testGetValue(),
    null,
    "no smoke_test event is recorded when the smoke test is skipped"
  );
  createEngineStub.restore();

  // Two sentences, under the limit, so the generator finishes on its own and
  // the engine is idle by the time the smoke test reuses it.
  const completed = mockEngine("One sentence here. Two sentences here.");
  createEngineStub = sinon
    .stub(LinkPreviewModel, "createEngine")
    .returns(completed);
  await LinkPreviewModel.generateTextAI("This is the big article to preview.");
  Assert.equal(
    completed.runCount,
    2,
    "smoke test reuses the engine when the generation ended on its own"
  );
  // runSmokeTest swallows every exception, so a started-but-failed run would
  // still leave runCount at 2. The recorded event is emitted after the
  // generation and the hashing, so its presence is what shows the run
  // finished rather than merely started. The lastBuildID pref is written
  // after it, but Services.appinfo.appBuildID is undefined under xpcshell,
  // which writes the pref's default and leaves no user value to assert on.
  const events = Glean.genaiLinkpreview.smokeTest.testGetValue();
  Assert.equal(events?.length, 1, "one smoke_test event was recorded");
  Assert.equal(
    events[0].extra.model_id,
    "HuggingFaceTB/SmolLM2-360M-Instruct-GGUF",
    "the event carries the pinned model identifier"
  );
  Assert.ok(
    events[0].extra.output_hash,
    "the event carries an output hash, so hashing completed"
  );
  createEngineStub.restore();

  Services.prefs.clearUserPref("browser.ml.linkPreview.blockListEnabled");
  Services.prefs.clearUserPref(LAST_BUILD_ID_PREF);
});
