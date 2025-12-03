/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { SmartAssistEngine } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/SmartAssistEngine.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

// Prefs
const PREF_API_KEY = "browser.ml.smartAssist.apiKey";
const PREF_ENDPOINT = "browser.ml.smartAssist.endpoint";
const PREF_MODEL = "browser.ml.smartAssist.model";

// Clean prefs after all tests
registerCleanupFunction(() => {
  for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

add_task(async function test_createOpenAIEngine_uses_prefs_and_static_fields() {
  Services.prefs.setStringPref(PREF_API_KEY, "test-key-123");
  Services.prefs.setStringPref(PREF_ENDPOINT, "https://example.test/v1");
  Services.prefs.setStringPref(PREF_MODEL, "gpt-fake");

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    const stub = sb
      .stub(SmartAssistEngine, "_createEngine")
      .resolves(fakeEngine);

    const engine = await SmartAssistEngine.createOpenAIEngine();

    Assert.strictEqual(
      engine,
      fakeEngine,
      "Should return engine from _createEngine"
    );
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const opts = stub.firstCall.args[0];
    Assert.equal(opts.apiKey, "test-key-123", "apiKey should come from pref");
    Assert.equal(
      opts.baseURL,
      "https://example.test/v1",
      "baseURL should come from pref"
    );
    Assert.equal(opts.modelId, "gpt-fake", "modelId should come from pref");
  } finally {
    sb.restore();
  }
});

add_task(async function test_fetchWithHistory_streams_and_forwards_args() {
  const sb = sinon.createSandbox();
  try {
    let capturedArgs = null;
    let capturedStreamOption = null;

    // Fake async generator that yields three text chunks and one empty (ignored)
    const fakeEngine = {
      runWithGenerator({ streamOptions, args }) {
        capturedArgs = args;
        capturedStreamOption = streamOptions;
        async function* gen() {
          yield { text: "Hello" };
          yield { text: " from" };
          yield { text: " fake engine!" };
          yield {}; // ignored by SmartAssistEngine
        }
        return gen();
      },
    };

    sb.stub(SmartAssistEngine, "_createEngine").resolves(fakeEngine);

    const messages = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi there" },
    ];

    // Collect streamed output
    let acc = "";
    for await (const t of SmartAssistEngine.fetchWithHistory(messages)) {
      acc += t;
    }

    Assert.equal(
      acc,
      "Hello from fake engine!",
      "Should concatenate streamed chunks"
    );
    Assert.deepEqual(
      capturedArgs,
      messages,
      "Should forward messages as args to runWithGenerator()"
    );
    Assert.deepEqual(
      capturedStreamOption.enabled,
      true,
      "Should enable streaming in runWithGenerator()"
    );
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_fetchWithHistory_propagates_engine_creation_rejection() {
    const sb = sinon.createSandbox();
    try {
      const err = new Error("creation failed (generic)");
      const stub = sb.stub(SmartAssistEngine, "_createEngine").rejects(err);
      const messages = [{ role: "user", content: "Hi" }];

      // Must CONSUME the async generator to trigger the rejection
      const consume = async () => {
        for await (const _message of SmartAssistEngine.fetchWithHistory(
          messages
        )) {
          void _message;
        }
      };

      await Assert.rejects(
        consume(),
        e => e === err,
        "Should propagate the same error thrown by _createEngine"
      );
      Assert.ok(stub.calledOnce, "_createEngine should be called once");
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_fetchWithHistory_propagates_stream_error() {
  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        async function* gen() {
          yield { text: "partial" };
          throw new Error("engine stream boom");
        }
        return gen();
      },
    };
    sb.stub(SmartAssistEngine, "_createEngine").resolves(fakeEngine);

    const consume = async () => {
      let acc = "";
      for await (const t of SmartAssistEngine.fetchWithHistory([
        { role: "user", content: "x" },
      ])) {
        acc += t;
      }
      return acc;
    };

    await Assert.rejects(
      consume(),
      e => /engine stream boom/.test(e.message),
      "Should propagate errors thrown during streaming"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPromptIntent_basic() {
  const sb = sinon.createSandbox();
  const cases = [
    { prompt: "please search for news on firefox", expected: "search" },
    { prompt: "Can you FIND me the docs for PageAssist?", expected: "search" }, // case-insensitive
    { prompt: "look up the best pizza in SF", expected: "search" },
    { prompt: "hello there, how are you?", expected: "chat" },
    { prompt: "tell me a joke", expected: "chat" },
  ];

  const fakeEngine = {
    run({ args: [[query]] }) {
      const searchKeywords = [
        "search",
        "find",
        "look",
        "query",
        "locate",
        "explore",
      ];
      const formattedPrompt = query.toLowerCase();
      const isSearch = searchKeywords.some(keyword =>
        formattedPrompt.includes(keyword)
      );

      // Simulate model confidence scores
      if (isSearch) {
        return [
          { label: "search", score: 0.95 },
          { label: "chat", score: 0.05 },
        ];
      }
      return [
        { label: "chat", score: 0.95 },
        { label: "search", score: 0.05 },
      ];
    },
  };

  sb.stub(SmartAssistEngine, "_createEngine").resolves(fakeEngine);

  for (const { prompt, expected } of cases) {
    const intent = await SmartAssistEngine.getPromptIntent(prompt);
    Assert.equal(
      intent,
      expected,
      `getPromptIntent("${prompt}") should return "${expected}"`
    );
  }

  sb.restore();
});

add_task(async function test_preprocessQuery_removes_question_marks() {
  const sb = sinon.createSandbox();

  // Use a minimal fake SmartAssistEngine to test only preprocessing
  const engine = Object.create(SmartAssistEngine);

  const cases = [
    { input: "hello?", expected: "hello" },
    { input: "?prompt", expected: "prompt" },
    { input: "multiple???", expected: "multiple" },
    { input: "mid?dle", expected: "middle" },
    { input: "question? ", expected: "question" },
    { input: " no?  spaces? ", expected: "no  spaces" },
    { input: "???", expected: "" },
    { input: "clean input", expected: "clean input" },
  ];

  for (const { input, expected } of cases) {
    const result = engine._preprocessQuery(input);
    Assert.equal(
      result,
      expected,
      `Expected "${input}" to preprocess to "${expected}", got "${result}"`
    );
  }

  sb.restore();
});
