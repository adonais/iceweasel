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
    useML: true,
    successful: false,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
  },
  {
    useML: true,
    successful: false,
    isNativeOnnxRuntimeAvailable: true,
    expectedNativeOnnxAvailablePref: true,
    expectedReason: "regex-heuristic",
  },
  {
    useML: true,
    successful: true,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
  },
  {
    useML: true,
    successful: true,
    isNativeOnnxRuntimeAvailable: true,
    expectedNativeOnnxAvailablePref: true,
    expectedReason: "ml",
  },
  {
    useML: false,
    successful: false,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
  },
  {
    useML: false,
    successful: true,
    isNativeOnnxRuntimeAvailable: false,
    expectedNativeOnnxAvailablePref: false,
    expectedReason: "regex-heuristic",
  },
];

let nativeOnnxRuntimeAvailabilityStub;

add_setup(function () {
  nativeOnnxRuntimeAvailabilityStub = sinon.stub(
    EngineProcess,
    "requestIsNativeOnnxRuntimeAvailable"
  );
  const detectFieldsStub = sinon
    .stub(FormAutofillML.prototype, "detectFields")
    .callsFake(async fieldDetails => {
      const predictions = [...FIELD_NAMES];
      for (const field of fieldDetails) {
        if (field.fieldName || !field.mlData) {
          continue;
        }
        field.fieldName = predictions.shift();
        field.reason = "ml";
      }
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
    }) => ({
      description: `Classify fields with useml=${useML}, successful=${successful}, isNativeOnnxRuntimeAvailable=${isNativeOnnxRuntimeAvailable}`,
      prefs: [
        ["extensions.formautofill.useml", useML],
        ["extensions.formautofill.useml.successful", successful],
        [NATIVE_ONNX_AVAILABLE_PREF, false],
      ],
      onTestSetup: async () => {
        nativeOnnxRuntimeAvailabilityStub.reset();
        nativeOnnxRuntimeAvailabilityStub.resolves(
          isNativeOnnxRuntimeAvailable
        );

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
