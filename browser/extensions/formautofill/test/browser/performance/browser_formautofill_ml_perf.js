/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

MLPerfTestUtils.init(this);

const perfMetadata = {
  owner: "Form Autofill Team",
  name: "browser_formautofill_ml_perf.js",
  description:
    "Integrated ML Autofill performance for the single- and double-engine classifiers",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        {
          name: "FORM-AUTOFILL-single-engine-focus-to-identification-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-single-engine-focus-to-identification-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-focus-to-identification-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-single-engine-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-single-engine-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-memory-before-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-single-engine-memory-before-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-memory-before-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-single-engine-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-single-engine-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-focus-to-identification-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-focus-to-identification-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-focus-to-identification-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-memory-before-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-memory-before-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-memory-before-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-encoder-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-engine-creation-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-engine-creation-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-engine-run-time-cold",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-memory-before-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-memory-before-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-memory-before-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-memory-after-run-cold",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "FORM-AUTOFILL-double-engine-head-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
      ],
      verbose: true,
      ml_services: true,
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      try_platform: ["linux", "mac", "win"],
    },
  },
};

/** The production ML architectures measured by this test. */
const ARCHITECTURES = [
  {
    name: "single-engine",
    twoHead: false,
    engines: [{ featureId: "formfill-classification" }],
  },
  {
    name: "double-engine",
    twoHead: true,
    engines: [
      { featureId: "formfill-encoder", metricName: "encoder" },
      { featureId: "formfill-head", metricName: "head" },
    ],
  },
];

requestLongerTimeout(10);

/** This test case measures production ML Form Autofill lifecycles. */
add_task(async function test_formautofill_ml_performance() {
  for (const architecture of ARCHITECTURES) {
    await SpecialPowers.pushPrefEnv({
      set: [["extensions.formautofill.useml.twoHead", architecture.twoHead]],
    });

    try {
      await MLPerfTestUtils.runPerfScenario({
        metricPrefix: `FORM-AUTOFILL-${architecture.name}`,
        scenario: runAutofillScenario,
        engines: architecture.engines,
        coldIterations: 5,
        warmIterations: 5,
        memoryIterations: 5,
        peakMemorySampleIntervalMs: 50,
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
});
