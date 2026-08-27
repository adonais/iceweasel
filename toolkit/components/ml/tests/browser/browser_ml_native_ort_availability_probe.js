/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Covers the once-per-profile availability report backing the
// firefox.ai.runtime.onnx_native_availability metric. Retire this file
// together with the metric and the report machinery when the metric expires.

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const AVAILABLE_WORKER_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_native_ort_available_stub.worker.mjs";
const ERROR_WORKER_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_native_ort_error_stub.worker.mjs";
const UNAVAILABLE_WORKER_URL =
  "chrome://mochitests/content/browser/toolkit/components/ml/tests/browser/ml_native_ort_unavailable_stub.worker.mjs";

const REPORTED_PREF = "browser.ml.onnxNativeAvailabilityReported";
const LABELS = ["available", "unavailable", "probe_error"];

add_setup(async function () {
  // The testing profile presets the reported pref, so the report registered
  // on browser-idle-startup settles without probing or recording. Waiting for
  // it here keeps it from racing with the tasks below, which reset the pref.
  info("waiting for the startup report invocation to settle");
  await EngineProcess.nativeOnnxRuntimeAvailabilityReportSettled;

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.enable", true]],
  });

  registerCleanupFunction(async () => {
    await SpecialPowers.popPrefEnv();
  });
});

function assertAvailabilityMetric(expectedLabel, message) {
  for (const label of LABELS) {
    Assert.equal(
      Glean.firefoxAiRuntime.onnxNativeAvailability[label].testGetValue(),
      label === expectedLabel ? 1 : null,
      `${message}: ${label}`
    );
  }
}

async function testStubbedReport({ workerUrl, expectedLabel }) {
  await SpecialPowers.pushPrefEnv({ set: [[REPORTED_PREF, false]] });

  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .returns({ url: workerUrl, options: { type: "module" } });

  Services.fog.testResetFOG();

  try {
    await EngineProcess.maybeReportNativeOnnxRuntimeAvailability();
    assertAvailabilityMetric(
      expectedLabel,
      "The report recorded the availability"
    );
    Assert.ok(
      Services.prefs.getBoolPref(REPORTED_PREF),
      "The report marked the availability as reported"
    );
    Assert.equal(workerConfigStub.callCount, 1, "The report probed once");

    await EngineProcess.maybeReportNativeOnnxRuntimeAvailability();
    assertAvailabilityMetric(
      expectedLabel,
      "The availability is recorded once per profile"
    );
    Assert.equal(
      workerConfigStub.callCount,
      1,
      "A reported profile does not probe again"
    );

    await TestUtils.waitForCondition(
      () => EngineProcess.areAllEnginesTerminated(),
      "The report did not keep an inference process alive"
    );
  } finally {
    workerConfigStub.restore();
    EngineProcess.resetNativeOnnxRuntimeAvailabilityForTests();
    await SpecialPowers.popPrefEnv();
  }
}

add_task(async function test_report_available() {
  await testStubbedReport({
    workerUrl: AVAILABLE_WORKER_URL,
    expectedLabel: "available",
  });
});

add_task(async function test_report_unavailable() {
  await testStubbedReport({
    workerUrl: UNAVAILABLE_WORKER_URL,
    expectedLabel: "unavailable",
  });
});

add_task(async function test_report_probe_error() {
  await testStubbedReport({
    workerUrl: ERROR_WORKER_URL,
    expectedLabel: "probe_error",
  });
});

add_task(async function test_request_alone_does_not_record() {
  await SpecialPowers.pushPrefEnv({ set: [[REPORTED_PREF, false]] });

  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .returns({ url: AVAILABLE_WORKER_URL, options: { type: "module" } });

  Services.fog.testResetFOG();

  try {
    await EngineProcess.requestIsNativeOnnxRuntimeAvailable();
    assertAvailabilityMetric(null, "The request alone does not record");
    Assert.ok(
      !Services.prefs.getBoolPref(REPORTED_PREF),
      "The request alone does not mark the availability as reported"
    );

    await TestUtils.waitForCondition(
      () => EngineProcess.areAllEnginesTerminated(),
      "The request did not keep an inference process alive"
    );
  } finally {
    workerConfigStub.restore();
    EngineProcess.resetNativeOnnxRuntimeAvailabilityForTests();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_reported_profile_skips_probe() {
  // No prefEnv here: the testing profile leaves the reported pref set, the
  // same state as any startup after the first report.
  const workerConfigStub = sinon
    .stub(MLEngineParent, "getWorkerConfig")
    .returns({ url: AVAILABLE_WORKER_URL, options: { type: "module" } });

  Services.fog.testResetFOG();

  try {
    await EngineProcess.maybeReportNativeOnnxRuntimeAvailability();
    Assert.equal(
      workerConfigStub.callCount,
      0,
      "A reported profile does not probe"
    );
    assertAvailabilityMetric(null, "A reported profile does not record");
  } finally {
    workerConfigStub.restore();
    EngineProcess.resetNativeOnnxRuntimeAvailabilityForTests();
  }
});
