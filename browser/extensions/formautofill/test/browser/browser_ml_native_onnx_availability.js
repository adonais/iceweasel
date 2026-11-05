/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { FormAutofillML } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillML.sys.mjs"
);
const { EngineProcess } = ChromeUtils.importESModule(
  "chrome://global/content/ml/EngineProcess.sys.mjs"
);

const NATIVE_ONNX_AVAILABLE_PREF =
  "extensions.formautofill.useml.nativeOnnxAvailable";

const FIELD_NAMES = [
  "given-name",
  "family-name",
  "address-line1",
  "address-level2",
  "country",
  "email",
  "tel",
];

const TEST_CASES = [
  {
    // onnx model is not available, so no ML is used
    useML: true,
    successful: false,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
    expectDetectFields: 0,
  },
  {
    // model is available, so ML is used, but fails, so fallback to heuristics
    useML: true,
    successful: false,
    isNativeOnnxRuntimeAvailable: true,
    expectedNativeOnnxAvailablePref: true,
    expectedReason: "regex-heuristic",
    expectDetectFields: 1,
  },
  {
    // onnx model is not available, so no ML is used, successful flag ignored
    useML: true,
    successful: true,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
    expectDetectFields: 1,
  },
  {
    // model is available, so ML is used
    useML: true,
    successful: true,
    isNativeOnnxRuntimeAvailable: true,
    expectedNativeOnnxAvailablePref: true,
    expectedReason: "ml",
    expectDetectFields: 2,
  },
  {
    // ML is disabled
    useML: false,
    successful: false,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
    expectDetectFields: 2,
  },
  {
    // ML is disabled
    useML: false,
    successful: true,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
    expectDetectFields: 2,
  },
];

let nativeOnnxRuntimeAvailabilityStub;

let expectedDetectFieldsResult;
let detectFieldsCount = 0;

add_setup(function () {
  nativeOnnxRuntimeAvailabilityStub = sinon.stub(
    EngineProcess,
    "requestIsNativeOnnxRuntimeAvailable"
  );
  const detectFieldsStub = sinon
    .stub(FormAutofillML.prototype, "detectFields")
    .callsFake(async fieldDetails => {
      detectFieldsCount++;

      if (!expectedDetectFieldsResult) {
        return false;
      }

      const predictions = [...FIELD_NAMES];
      for (const field of fieldDetails) {
        if (!FormAutofillUtils.canUseML(field)) {
          continue;
        }
        field.fieldName = predictions.shift();
        field.reason = "ml";
      }
      return expectedDetectFieldsResult;
    });

  registerCleanupFunction(() => {
    nativeOnnxRuntimeAvailabilityStub.restore();
    detectFieldsStub.restore();
  });
});

add_heuristic_tests(
  TEST_CASES.map(
    ({
      useML,
      successful,
      isNativeOnnxRuntimeAvailable,
      expectedNativeOnnxAvailablePref,
      expectedReason,
      expectDetectFields,
    }) => ({
      description: `Classify fields with useml=${useML}, successful=${successful}, isNativeOnnxRuntimeAvailable=${isNativeOnnxRuntimeAvailable}`,
      prefs: [
        ["extensions.formautofill.useml", useML],
        [NATIVE_ONNX_AVAILABLE_PREF, false],
      ],
      onTestSetup: async () => {
        nativeOnnxRuntimeAvailabilityStub.reset();
        nativeOnnxRuntimeAvailabilityStub.resolves(
          isNativeOnnxRuntimeAvailable
        );

        expectedDetectFieldsResult = successful;

        const addon = await AddonManager.getAddonByID(
          "formautofill@mozilla.org"
        );
        await addon.reload();
        await new Promise(resolve => ChromeUtils.idleDispatch(resolve));

        if (useML) {
          sinon.assert.calledOnce(nativeOnnxRuntimeAvailabilityStub);
          await TestUtils.waitForCondition(
            () =>
              Services.prefs.getBoolPref(NATIVE_ONNX_AVAILABLE_PREF) ===
              expectedNativeOnnxAvailablePref,
            "Wait for the native ONNX availability pref to be updated"
          );
        } else {
          sinon.assert.notCalled(nativeOnnxRuntimeAvailabilityStub);
        }

        is(
          Services.prefs.getBoolPref(NATIVE_ONNX_AVAILABLE_PREF),
          expectedNativeOnnxAvailablePref,
          "The native ONNX availability pref matches the expected state"
        );
      },
      onTestComplete: async () => {
        const extension = WebExtensionPolicy.getByID(
          "formautofill@mozilla.org"
        ).extension;
        await extension.terminateBackground({
          disableResetIdleForTest: true,
        });
        is(
          extension.backgroundState,
          "stopped",
          "The Form Autofill background page is stopped"
        );

        // detectFields is only called when useML and isNativeOnnxRuntimeAvailable
        // are both true.
        is(
          detectFieldsCount,
          expectDetectFields,
          "detectFields called 2 times"
        );
      },
      fixtureData: `<form>
        <input id="given-name">
        <input id="family-name">
        <input id="street-addr">
        <input id="city">
        <select id="country"></select>
        <input id="email">
        <input id="phone">
      </form>`,
      expectedResult: [
        {
          default: { reason: expectedReason },
          fields: FIELD_NAMES.map(fieldName => ({ fieldName })),
        },
      ],
    })
  )
);
