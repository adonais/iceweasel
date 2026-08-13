/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const AVAILABLE_WORKER_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_native_ort_available_stub.worker.mjs";
const ERROR_WORKER_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_native_ort_error_stub.worker.mjs";
const UNAVAILABLE_WORKER_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_native_ort_unavailable_stub.worker.mjs";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.enable", true]],
  });
  registerCleanupFunction(async () => {
    EngineProcess.resetNativeOnnxRuntimeAvailabilityForTests();
    await SpecialPowers.popPrefEnv();
  });
});

async function testStubbedAvailability({
  workerUrl,
  expectedIsAvailable,
  expectedProbeCount = 1,
}) {
  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .returns({ url: workerUrl, options: { type: "module" } });

  try {
    const first = await EngineProcess.requestIsNativeOnnxRuntimeAvailable();
    Assert.equal(
      first,
      expectedIsAvailable,
      `The probe returned ${expectedIsAvailable}`
    );

    await TestUtils.waitForCondition(
      () => EngineProcess.areAllEnginesTerminated(),
      "The availability probe did not keep an inference process alive"
    );

    const second = await EngineProcess.requestIsNativeOnnxRuntimeAvailable();
    Assert.equal(
      second,
      expectedIsAvailable,
      `The second request returned ${expectedIsAvailable}`
    );
    Assert.equal(
      workerConfigStub.callCount,
      expectedProbeCount,
      `The availability probe ran ${expectedProbeCount} time(s)`
    );

    await TestUtils.waitForCondition(
      () => EngineProcess.areAllEnginesTerminated(),
      "The availability probe did not keep an inference process alive"
    );
  } finally {
    workerConfigStub.restore();
    EngineProcess.resetNativeOnnxRuntimeAvailabilityForTests();
  }
}

add_task(async function test_native_ort_unavailable() {
  await testStubbedAvailability({
    workerUrl: UNAVAILABLE_WORKER_URL,
    expectedIsAvailable: false,
  });
});

add_task(async function test_native_ort_available() {
  await testStubbedAvailability({
    workerUrl: AVAILABLE_WORKER_URL,
    expectedIsAvailable: true,
  });
});

add_task(async function test_native_ort_probe_error() {
  await testStubbedAvailability({
    workerUrl: ERROR_WORKER_URL,
    expectedIsAvailable: false,
    expectedProbeCount: 2,
  });
});

add_task(async function test_native_ort_integration() {
  const first = await EngineProcess.requestIsNativeOnnxRuntimeAvailable();

  Assert.equal(typeof first, "boolean", "The real probe returns a boolean");

  await TestUtils.waitForCondition(
    () => EngineProcess.areAllEnginesTerminated(),
    "The real availability probe did not keep an inference process alive"
  );

  const second = await EngineProcess.requestIsNativeOnnxRuntimeAvailable();

  Assert.equal(second, first, "The real probe result is cached");
  Assert.ok(
    EngineProcess.areAllEnginesTerminated(),
    "The real cached result did not recreate the inference process"
  );
});
