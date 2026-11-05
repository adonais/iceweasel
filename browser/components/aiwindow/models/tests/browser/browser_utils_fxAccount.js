/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { OAUTH_CLIENT_ID } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccountsCommon.sys.mjs"
);

const { getFxAccountsSingleton } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccounts.sys.mjs"
);

const { MODEL_FEATURES, SERVICE_TYPES, PURPOSES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const TEST_MODEL = "test-model";

add_task(async function test_getToken_passes_correct_service() {
  const fakeToken = "fake-oauth-token";
  const fxAccounts = getFxAccountsSingleton();

  const getOAuthTokenStub = sinon
    .stub(fxAccounts, "getOAuthToken")
    .resolves(fakeToken);

  try {
    const token = await AuthProvider.getToken();

    Assert.ok(
      getOAuthTokenStub.calledOnce,
      "getOAuthToken should be called once"
    );

    const callArgs = getOAuthTokenStub.getCall(0).args[0];
    Assert.ok(callArgs, "getOAuthToken should be called with arguments");
    Assert.equal(
      callArgs.service,
      "smartwindow",
      "getOAuthToken should be called for the smartwindow service"
    );
    Assert.equal(
      callArgs.client_id,
      OAUTH_CLIENT_ID,
      "getOAuthToken should be called with correct client_id"
    );
    Assert.equal(
      token,
      fakeToken,
      "getToken should return the token from getOAuthToken"
    );
  } finally {
    getOAuthTokenStub.restore();
  }
});

add_task(async function test_getToken_returns_null_on_error() {
  const fxAccounts = getFxAccountsSingleton();

  const getOAuthTokenStub = sinon
    .stub(fxAccounts, "getOAuthToken")
    .rejects(new Error("FxA authentication failed"));

  try {
    const token = await AuthProvider.getToken();

    Assert.ok(
      getOAuthTokenStub.calledOnce,
      "getOAuthToken should be called once"
    );
    Assert.equal(
      token,
      null,
      "getToken should return null when getOAuthToken throws an error"
    );
  } finally {
    getOAuthTokenStub.restore();
  }
});

add_task(async function test_invalidateToken_removes_cached_token() {
  const fxAccounts = getFxAccountsSingleton();

  const removeCachedOAuthTokenStub = sinon
    .stub(fxAccounts, "removeCachedOAuthToken")
    .resolves();

  try {
    await AuthProvider.invalidateToken("stale-token");
    Assert.ok(
      removeCachedOAuthTokenStub.calledOnce,
      "removeCachedOAuthToken should be called once"
    );
    Assert.deepEqual(
      removeCachedOAuthTokenStub.getCall(0).args[0],
      { token: "stale-token" },
      "removeCachedOAuthToken should be called with the token"
    );

    await AuthProvider.invalidateToken(null);
    Assert.ok(
      removeCachedOAuthTokenStub.calledOnce,
      "removeCachedOAuthToken should not be called without a token"
    );
  } finally {
    removeCachedOAuthTokenStub.restore();
  }
});

// Success run with no errors should return response from engine.run.
add_task(async function test_runWithAuth_success_no_errors() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const testContent = { messages: [{ role: "user", content: "test" }] };
  const expectedResponse = { success: true, data: "response" };

  const runStub = sinon
    .stub(engine.engineInstance, "run")
    .resolves(expectedResponse);

  try {
    const response = await engine._runWithAuth(testContent);

    Assert.ok(runStub.calledOnce, "engine.run should be called once");
    Assert.deepEqual(
      runStub.getCall(0).args[0],
      testContent,
      "run should be called with correct content"
    );
    Assert.deepEqual(
      response,
      expectedResponse,
      "_runWithAuth should return response from engine.run"
    );
  } finally {
    runStub.restore();
  }
});

// Test token refresh works on 401 error with successful retry
add_task(async function test_runWithAuth_retry_on_401_error() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const oldToken = "old-token";
  const newToken = "new-token";
  const testContent = {
    messages: [{ role: "user", content: "test" }],
    token: oldToken,
  };
  const expectedResponse = { success: true, data: "response" };

  const runStub = sinon.stub(engine.engineInstance, "run");
  runStub
    .onFirstCall()
    .rejects(new Error("Request failed with 401 status code"));
  runStub.onSecondCall().resolves(expectedResponse);

  const invalidateTokenStub = sinon
    .stub(AuthProvider, "invalidateToken")
    .resolves();
  const getTokenStub = sinon.stub(AuthProvider, "getToken").resolves(newToken);

  try {
    const response = await engine._runWithAuth(testContent);

    Assert.ok(runStub.calledTwice, "engine.run should be called twice");
    Assert.ok(
      invalidateTokenStub.calledOnce,
      "invalidateToken should be called once"
    );
    Assert.deepEqual(
      invalidateTokenStub.getCall(0).args[0],
      oldToken,
      "invalidateToken should be called with old token"
    );
    Assert.ok(getTokenStub.calledOnce, "getToken should be called once");

    const secondCallArgs = runStub.getCall(1).args[0];
    Assert.equal(
      secondCallArgs.token,
      newToken,
      "Second call should use new token"
    );
    Assert.deepEqual(
      response,
      expectedResponse,
      "_runWithAuth should return response from retry"
    );
  } finally {
    runStub.restore();
    invalidateTokenStub.restore();
    getTokenStub.restore();
  }
});

// Test token revocation and throw error if 401 error on both attempts
add_task(async function test_runWithAuth_fails_after_retry_401() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const oldToken = "old-token";
  const newToken = "new-token";
  const testContent = {
    messages: [{ role: "user", content: "test" }],
    token: oldToken,
  };

  const firstError = new Error("Request failed with 401 status code");
  const secondError = new Error("Request failed with 401 status code");
  const runStub = sinon.stub(engine.engineInstance, "run");
  runStub.onFirstCall().rejects(firstError);
  runStub.onSecondCall().rejects(secondError);

  const invalidateTokenStub = sinon
    .stub(AuthProvider, "invalidateToken")
    .resolves();
  const getTokenStub = sinon.stub(AuthProvider, "getToken").resolves(newToken);

  try {
    await Assert.rejects(
      engine._runWithAuth(testContent),
      ex => ex === secondError,
      "_runWithAuth should throw the retry error"
    );

    Assert.ok(runStub.calledTwice, "engine.run should be called twice");
    Assert.ok(
      invalidateTokenStub.calledTwice,
      "invalidateToken should be called twice (for old and new tokens)"
    );
    Assert.deepEqual(
      invalidateTokenStub.getCall(0).args[0],
      oldToken,
      "First invalidateToken call should be for old token"
    );
    Assert.deepEqual(
      invalidateTokenStub.getCall(1).args[0],
      newToken,
      "Second invalidateToken call should be for new token"
    );
  } finally {
    runStub.restore();
    invalidateTokenStub.restore();
    getTokenStub.restore();
  }
});

// Test 401 error is thrown immediately when custom endpoint is set (no retry)
add_task(async function test_runWithAuth_throws_401_with_custom_endpoint() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.customEndpoint", "https://example.test/v1"]],
  });

  try {
    const { baseURL, apiKey } = openAIEngine.resolveEndpointConfig("0");
    const engine = await openAIEngine.build({
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.AI,
      purpose: PURPOSES.CHAT,
      flowId: null,
      feature: MODEL_FEATURES.CHAT,
      baseURL,
      apiKey,
    });
    const testContent = { messages: [{ role: "user", content: "test" }] };
    const expectedError = new Error("Request failed with 401 status code");

    const runStub = sinon
      .stub(engine.engineInstance, "run")
      .rejects(expectedError);
    const invalidateTokenStub = sinon
      .stub(AuthProvider, "invalidateToken")
      .resolves();

    try {
      await Assert.rejects(
        engine._runWithAuth(testContent),
        ex => ex === expectedError,
        "_runWithAuth should throw 401 immediately when custom endpoint is set"
      );

      Assert.ok(runStub.calledOnce, "engine.run should be called once");
      Assert.ok(
        invalidateTokenStub.notCalled,
        "invalidateToken should not be called when custom endpoint is set"
      );
    } finally {
      runStub.restore();
      invalidateTokenStub.restore();
    }
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

// Test no retry for non-401 errors and error is thrown immediately
add_task(async function test_runWithAuth_throws_non_401_error() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const testContent = { messages: [{ role: "user", content: "test" }] };
  const expectedError = new Error("Network error");

  const runStub = sinon
    .stub(engine.engineInstance, "run")
    .rejects(expectedError);
  const invalidateTokenStub = sinon
    .stub(AuthProvider, "invalidateToken")
    .resolves();

  try {
    await Assert.rejects(
      engine._runWithAuth(testContent),
      ex => ex === expectedError,
      "_runWithAuth should throw non-401 errors immediately"
    );

    Assert.ok(runStub.calledOnce, "engine.run should be called once");
    Assert.ok(
      invalidateTokenStub.notCalled,
      "invalidateToken should not be called for non-401 errors"
    );
  } finally {
    runStub.restore();
    invalidateTokenStub.restore();
  }
});

// Test async generator streaming success with no errors
add_task(async function test_runWithGeneratorAuth_success_no_errors() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const testOptions = { messages: [{ role: "user", content: "test" }] };
  const expectedChunks = [{ text: "Hello" }, { text: " world" }, { text: "!" }];

  async function* mockGenerator() {
    for (const chunk of expectedChunks) {
      yield chunk;
    }
  }

  const runWithGeneratorStub = sinon
    .stub(engine.engineInstance, "runWithGenerator")
    .returns(mockGenerator());

  try {
    const chunks = [];
    for await (const chunk of engine._runWithGeneratorAuth(testOptions)) {
      chunks.push(chunk);
    }

    Assert.ok(
      runWithGeneratorStub.calledOnce,
      "engine.runWithGenerator should be called once"
    );
    Assert.deepEqual(
      runWithGeneratorStub.getCall(0).args[0],
      testOptions,
      "runWithGenerator should be called with correct options"
    );
    Assert.deepEqual(
      chunks,
      expectedChunks,
      "_runWithGeneratorAuth should yield all chunks"
    );
  } finally {
    runWithGeneratorStub.restore();
  }
});

// Test generator token refresh works on 401 error with successful retry
add_task(async function test_runWithGeneratorAuth_retry_on_401_error() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const oldToken = "old-token";
  const newToken = "new-token";
  const testOptions = {
    messages: [{ role: "user", content: "test" }],
    token: oldToken,
  };
  const expectedChunks = [{ text: "Hello" }, { text: " retry" }];

  // eslint-disable-next-line require-yield
  async function* mockFailingGenerator() {
    const error = new Error("Request failed");
    error.status = 401;
    throw error;
  }

  async function* mockSuccessGenerator() {
    for (const chunk of expectedChunks) {
      yield chunk;
    }
  }

  const runWithGeneratorStub = sinon.stub(
    engine.engineInstance,
    "runWithGenerator"
  );
  runWithGeneratorStub.onFirstCall().returns(mockFailingGenerator());
  runWithGeneratorStub.onSecondCall().returns(mockSuccessGenerator());

  const invalidateTokenStub = sinon
    .stub(AuthProvider, "invalidateToken")
    .resolves();
  const getTokenStub = sinon.stub(AuthProvider, "getToken").resolves(newToken);

  try {
    const chunks = [];
    for await (const chunk of engine._runWithGeneratorAuth(testOptions)) {
      chunks.push(chunk);
    }

    Assert.ok(
      runWithGeneratorStub.calledTwice,
      "engine.runWithGenerator should be called twice"
    );
    Assert.ok(
      invalidateTokenStub.calledOnce,
      "invalidateToken should be called once"
    );
    Assert.deepEqual(
      invalidateTokenStub.getCall(0).args[0],
      oldToken,
      "invalidateToken should be called with old token"
    );
    Assert.ok(getTokenStub.calledOnce, "getToken should be called once");

    const secondCallArgs = runWithGeneratorStub.getCall(1).args[0];
    Assert.equal(
      secondCallArgs.token,
      newToken,
      "Second call should use new token"
    );
    Assert.deepEqual(
      chunks,
      expectedChunks,
      "_runWithGeneratorAuth should yield all chunks from retry"
    );
  } finally {
    runWithGeneratorStub.restore();
    invalidateTokenStub.restore();
    getTokenStub.restore();
  }
});

// Test generator token revocation and throw error if 401 error on both attempts
add_task(async function test_runWithGeneratorAuth_fails_after_retry_401() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const oldToken = "old-token";
  const newToken = "new-token";
  const testOptions = {
    messages: [{ role: "user", content: "test" }],
    token: oldToken,
  };

  const firstError = new Error("Request failed");
  firstError.status = 401;
  const secondError = new Error("Request failed");
  secondError.status = 401;

  // eslint-disable-next-line require-yield
  async function* mockFailingGenerator1() {
    throw firstError;
  }

  // eslint-disable-next-line require-yield
  async function* mockFailingGenerator2() {
    throw secondError;
  }

  const runWithGeneratorStub = sinon.stub(
    engine.engineInstance,
    "runWithGenerator"
  );
  runWithGeneratorStub.onFirstCall().returns(mockFailingGenerator1());
  runWithGeneratorStub.onSecondCall().returns(mockFailingGenerator2());

  const invalidateTokenStub = sinon
    .stub(AuthProvider, "invalidateToken")
    .resolves();
  const getTokenStub = sinon.stub(AuthProvider, "getToken").resolves(newToken);

  try {
    const generator = engine._runWithGeneratorAuth(testOptions);
    await Assert.rejects(
      (async () => {
        // eslint-disable-next-line no-unused-vars
        for await (const _chunk of generator) {
          // Should not yield any chunks
        }
      })(),
      ex => ex === secondError,
      "_runWithGeneratorAuth should throw the retry error"
    );

    Assert.ok(
      runWithGeneratorStub.calledTwice,
      "engine.runWithGenerator should be called twice"
    );
    Assert.ok(
      invalidateTokenStub.calledTwice,
      "invalidateToken should be called twice (for old and new tokens)"
    );
    Assert.deepEqual(
      invalidateTokenStub.getCall(0).args[0],
      oldToken,
      "First invalidateToken call should be for old token"
    );
    Assert.deepEqual(
      invalidateTokenStub.getCall(1).args[0],
      newToken,
      "Second invalidateToken call should be for new token"
    );
  } finally {
    runWithGeneratorStub.restore();
    invalidateTokenStub.restore();
    getTokenStub.restore();
  }
});

// Test generator no retry for non-401 errors and error is thrown immediately
add_task(async function test_runWithGeneratorAuth_throws_non_401_error() {
  const engine = await openAIEngine.build({
    model: TEST_MODEL,
    serviceType: SERVICE_TYPES.AI,
    purpose: PURPOSES.CHAT,
    flowId: null,
    feature: MODEL_FEATURES.CHAT,
  });
  const testOptions = { messages: [{ role: "user", content: "test" }] };
  const expectedError = new Error("Network error");

  // eslint-disable-next-line require-yield
  async function* mockFailingGenerator() {
    throw expectedError;
  }

  const runWithGeneratorStub = sinon
    .stub(engine.engineInstance, "runWithGenerator")
    .returns(mockFailingGenerator());
  const invalidateTokenStub = sinon
    .stub(AuthProvider, "invalidateToken")
    .resolves();

  try {
    const generator = engine._runWithGeneratorAuth(testOptions);
    await Assert.rejects(
      (async () => {
        // eslint-disable-next-line no-unused-vars
        for await (const _chunk of generator) {
          // Should not yield any chunks
        }
      })(),
      ex => ex === expectedError,
      "_runWithGeneratorAuth should throw non-401 errors immediately"
    );

    Assert.ok(
      runWithGeneratorStub.calledOnce,
      "engine.runWithGenerator should be called once"
    );
    Assert.ok(
      invalidateTokenStub.notCalled,
      "invalidateToken should not be called for non-401 errors"
    );
  } finally {
    runWithGeneratorStub.restore();
    invalidateTokenStub.restore();
  }
});
