/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/* Test the firefox-on-glean profiler integration in child processes. */

"use strict";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const { ObjectUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ObjectUtils.sys.mjs"
);

const ARTIFACT_BUILD = Services.prefs.getBoolPref(
  "telemetry.fog.artifact_build",
  false
);

// Registration order must match in the parent and child so metric IDs agree.
const METRICS = [
  ["counter", "jog_counter"],
  ["event", "jog_event_no_extra"],
  ["event", "jog_event", { allowed_extra_keys: ["extra1", "extra2"] }],
  ["labeled_counter", "jog_labeled_counter"],
  [
    "labeled_counter",
    "jog_static_labeled_counter",
    { ordered_labels: ["label1", "label2"] },
  ],
  [
    "boolean",
    "jog_boolean",
    { permit_non_commutative_operations_over_ipc: true },
  ],
  [
    "labeled_boolean",
    "jog_labeled_boolean",
    { permit_non_commutative_operations_over_ipc: true },
  ],
  [
    "quantity",
    "jog_quantity",
    { permit_non_commutative_operations_over_ipc: true },
  ],
  ["memory_distribution", "jog_memory_dist", { memory_unit: "megabyte" }],
  [
    "labeled_memory_distribution",
    "jog_labeled_memory_dist",
    { memory_unit: "megabyte" },
  ],
  [
    "custom_distribution",
    "jog_custom_dist",
    {
      range_min: 1,
      range_max: 100,
      bucket_count: 10,
      histogram_type: "linear",
    },
  ],
  [
    "labeled_custom_distribution",
    "jog_labeled_custom_dist",
    {
      range_min: 1,
      range_max: 100,
      bucket_count: 10,
      histogram_type: "linear",
    },
  ],
  ["timing_distribution", "jog_timing_dist", { time_unit: "nanosecond" }],
  [
    "labeled_timing_distribution",
    "jog_labeled_timing_dist",
    { time_unit: "nanosecond" },
  ],
  ["rate", "jog_rate"],
  [
    "denominator",
    "jog_denominator",
    {
      numerators: [
        {
          name: "jog_rate_ext",
          category: "jog_ipc",
          send_in_pings: ["test-ping"],
          lifetime: "ping",
          disabled: false,
          in_session: false,
        },
      ],
    },
  ],
  ["numerator", "jog_rate_ext"],
];

add_setup(function test_setup() {
  if (runningInParent && AppConstants.platform != "android") {
    do_get_profile();
    Services.fog.initializeFOG();
  }

  // Ensure actual runtime metrics are registered before our test metrics.
  Glean.testOnly.badCode;
  for (let [type, name, extra = {}] of METRICS) {
    Services.fog.testRegisterRuntimeMetric(
      type,
      "jog_ipc",
      name,
      ["test-ping"],
      `"ping"`,
      false,
      false,
      JSON.stringify(extra)
    );
  }
});

function assertLabeledMarkers(markers, expected, runtime) {
  // Bug 1934947: runtime labeled metrics cannot resolve their names in children.
  // Compile-time labeled metrics pass a base ID where a submetric ID is expected.
  if (!runtime) {
    Assert.equal(markers.length, expected.length, JSON.stringify(markers));
    for (let [i, marker] of markers.entries()) {
      Assert.stringMatches(
        marker.id,
        /^Error looking up Id\(BaseMetricId\(\d+\)\): LabeledBaseMetricIsNotDynamic$/
      );
      let payload = { ...marker };
      delete payload.id;
      let expectedPayload = { ...expected[i] };
      delete expectedPayload.label;
      Assert.deepEqual(payload, expectedPayload);
    }
    return;
  }
  Assert.ok(
    ["JOGMetricMapLookupFailed", "JOGMetricMapWasUninit"].some(id =>
      ObjectUtils.deepEqual(
        markers,
        expected.map(marker => ({ ...marker, cat: "", id }))
      )
    ),
    `Expected labeled marker payloads with a lookup error: ${JSON.stringify(markers)}`
  );
}

for (let runtime of [false, true]) {
  const kind = runtime ? "jog" : "fog";
  const runtimeNames = runtime || ARTIFACT_BUILD;

  add_task({ skip_if: () => runningInParent }, async function test_counter() {
    info(`${kind}: counter`);
    let markers = await runWithProfilerAndGetMarkers("IntLikeMetric", () => {
      (runtime ? Glean.jogIpc.jogCounter : Glean.testOnly.badCode).add(31);
    });
    Assert.deepEqual(markers, [
      {
        type: "IntLikeMetric",
        cat: runtime ? "jog_ipc" : "test_only",
        id: runtime ? "jog_counter" : "bad_code",
        val: 31,
      },
    ]);
  });

  add_task(
    { skip_if: () => runningInParent },
    async function test_labeled_counter() {
      info(`${kind}: labeled counter`);
      let metric = runtime
        ? Glean.jogIpc.jogLabeledCounter
        : Glean.testOnly.mabelsKitchenCounters;
      let label = "label1";
      let markers = await runWithProfilerAndGetMarkers("IntLikeMetric", () => {
        metric[label].add(1);
        metric[label].add(2);
      });
      assertLabeledMarkers(
        markers,
        [1, 2].map(val => ({ type: "IntLikeMetric", label, val })),
        runtimeNames
      );
    }
  );

  add_task(
    { skip_if: () => runningInParent },
    async function test_static_labeled_counter() {
      info(`${kind}: counter with predefined labels`);
      let metric = runtime
        ? Glean.jogIpc.jogStaticLabeledCounter
        : Glean.testOnly.mabelsLabeledCounters;
      let label = runtime ? "label1" : "clean";
      let markers = await runWithProfilerAndGetMarkers("IntLikeMetric", () => {
        metric[label].add(1);
        metric[label].add(2);
      });
      assertLabeledMarkers(
        markers,
        [1, 2].map(val => ({ type: "IntLikeMetric", label, val })),
        runtimeNames
      );
    }
  );

  add_task({ skip_if: () => runningInParent }, async function test_boolean() {
    info(`${kind}: unordered boolean`);
    let metric = runtime
      ? Glean.jogIpc.jogBoolean
      : Glean.testOnlyIpc.anUnorderedBool;
    let markers = await runWithProfilerAndGetMarkers("BooleanMetric", () => {
      metric.set(true);
      metric.set(false);
    });
    Assert.deepEqual(
      markers,
      [true, false].map(val => ({
        type: "BooleanMetric",
        cat: runtime ? "jog_ipc" : "test_only.ipc",
        id: runtime ? "jog_boolean" : "an_unordered_bool",
        val,
      }))
    );
  });

  add_task(
    { skip_if: () => runningInParent },
    async function test_labeled_boolean() {
      info(`${kind}: unordered labeled boolean`);
      let metric = runtime
        ? Glean.jogIpc.jogLabeledBoolean
        : Glean.testOnlyIpc.anUnorderedLabeledBoolean;
      let markers = await runWithProfilerAndGetMarkers("BooleanMetric", () => {
        metric.label1.set(true);
        metric.label1.set(false);
      });
      assertLabeledMarkers(
        markers,
        [
          { type: "BooleanMetric", label: "label1", val: true },
          { type: "BooleanMetric", label: "label1", val: false },
        ],
        runtimeNames
      );
    }
  );

  add_task({ skip_if: () => runningInParent }, async function test_quantity() {
    info(`${kind}: unordered quantity`);
    let metric = runtime
      ? Glean.jogIpc.jogQuantity
      : Glean.testOnlyIpc.anUnorderedQuantity;
    let markers = await runWithProfilerAndGetMarkers("IntLikeMetric", () => {
      metric.set(42);
      metric.set(0);
    });
    Assert.deepEqual(
      markers,
      [42, 0].map(val => ({
        type: "IntLikeMetric",
        cat: runtime ? "jog_ipc" : "test_only.ipc",
        id: runtime ? "jog_quantity" : "an_unordered_quantity",
        val,
      }))
    );
  });

  add_task(
    { skip_if: () => runningInParent },
    async function test_memory_distribution() {
      info(`${kind}: memory distribution`);
      let metric = runtime
        ? Glean.jogIpc.jogMemoryDist
        : Glean.testOnly.doYouRemember;
      let markers = await runWithProfilerAndGetMarkers("DistMetric", () => {
        metric.accumulate(7);
        metric.accumulate(17);
      });
      Assert.deepEqual(
        markers,
        ["7", "17"].map(sample => ({
          type: "DistMetric",
          cat: runtime ? "jog_ipc" : "test_only",
          id: runtime ? "jog_memory_dist" : "do_you_remember",
          sample,
        }))
      );
    }
  );

  add_task(
    { skip_if: () => runningInParent },
    async function test_labeled_memory_distribution() {
      info(`${kind}: labeled memory distribution`);
      let metric = runtime
        ? Glean.jogIpc.jogLabeledMemoryDist
        : Glean.testOnly.whatDoYouRemember;
      let markers = await runWithProfilerAndGetMarkers("DistMetric", () => {
        metric.label1.accumulate(7);
        metric.label1.accumulate(17);
      });
      assertLabeledMarkers(
        markers,
        [
          { type: "DistMetric", label: "label1", sample: "7" },
          { type: "DistMetric", label: "label1", sample: "17" },
        ],
        runtimeNames
      );
    }
  );

  add_task(
    { skip_if: () => runningInParent },
    async function test_custom_distribution() {
      info(`${kind}: custom distribution`);
      let metric = runtime
        ? Glean.jogIpc.jogCustomDist
        : Glean.testOnlyIpc.aCustomDist;
      let markers = await runWithProfilerAndGetMarkers("DistMetric", () => {
        metric.accumulateSingleSample(120);
        metric.accumulateSamples([7, 268435458]);
        metric.accumulateSamples([-7]);
      });
      Assert.deepEqual(
        markers,
        [
          { sample: "120" },
          { samples: "[7,268435458]" },
          { samples: "[-7]" },
        ].map(value => ({
          type: "DistMetric",
          cat: runtime ? "jog_ipc" : "test_only.ipc",
          id: runtime ? "jog_custom_dist" : "a_custom_dist",
          ...value,
        }))
      );
    }
  );

  add_task(
    { skip_if: () => runningInParent },
    async function test_labeled_custom_distribution() {
      info(`${kind}: labeled custom distribution`);
      let metric = runtime
        ? Glean.jogIpc.jogLabeledCustomDist
        : Glean.testOnly.mabelsCustomLabelLengths;
      let markers = await runWithProfilerAndGetMarkers("DistMetric", () => {
        metric.label1.accumulateSingleSample(13);
        metric.label1.accumulateSamples([1, 42]);
      });
      assertLabeledMarkers(
        markers,
        [
          { type: "DistMetric", label: "label1", sample: "13" },
          { type: "DistMetric", label: "label1", samples: "[1,42]" },
        ],
        runtimeNames
      );
    }
  );

  add_task(
    { skip_if: () => runningInParent },
    async function test_timing_distribution() {
      info(`${kind}: timing distribution`);
      let metric = runtime
        ? Glean.jogIpc.jogTimingDist
        : Glean.testOnly.whatTimeIsIt;
      let timers;
      let markers = await runWithProfilerAndGetMarkers("TimingDist", () => {
        timers = [metric.start(), metric.start()];
        metric.cancel(timers[0]);
        metric.stopAndAccumulate(timers[1]);
      });
      Assert.notEqual(
        timers[0],
        timers[1],
        "Concurrent timers have distinct IDs"
      );
      Assert.deepEqual(
        markers,
        [...timers, ...timers].map(timer_id => ({
          type: "TimingDist",
          cat: runtime ? "jog_ipc" : "test_only",
          id: runtime ? "jog_timing_dist" : "what_time_is_it",
          timer_id,
        }))
      );
    }
  );

  add_task(
    { skip_if: () => runningInParent },
    async function test_labeled_timing_distribution() {
      info(`${kind}: labeled timing distribution`);
      let metric = (
        runtime
          ? Glean.jogIpc.jogLabeledTimingDist
          : Glean.testOnly.whereHasTheTimeGone
      ).label1;
      let timers;
      let markers = await runWithProfilerAndGetMarkers("TimingDist", () => {
        timers = [metric.start(), metric.start()];
        metric.cancel(timers[0]);
        metric.stopAndAccumulate(timers[1]);
      });
      Assert.notEqual(
        timers[0],
        timers[1],
        "Concurrent timers have distinct IDs"
      );
      // The timing submetric lookup uses the unlabeled metric map (bug 1934947).
      Assert.deepEqual(
        markers,
        [...timers, ...timers].map(timer_id => ({
          type: "TimingDist",
          cat: "",
          id: runtimeNames
            ? "JOGMetricMapLookupFailed"
            : "FOGMetricMapLookupFailed",
          timer_id,
        }))
      );
    }
  );

  add_task({ skip_if: () => runningInParent }, async function test_rate() {
    info(`${kind}: rate and external denominator`);
    let rate = runtime ? Glean.jogIpc.jogRate : Glean.testOnlyIpc.irate;
    let denominator = runtime
      ? Glean.jogIpc.jogDenominator
      : Glean.testOnlyIpc.anExternalDenominator;
    let numerator = runtime
      ? Glean.jogIpc.jogRateExt
      : Glean.testOnlyIpc.rateWithExternalDenominator;
    let markers = await runWithProfilerAndGetMarkers("IntLikeMetric", () => {
      rate.addToNumerator(22);
      rate.addToDenominator(7);
      denominator.add(11);
      numerator.addToNumerator(121);
    });
    let ids = runtime
      ? ["jog_rate", "jog_rate", "jog_denominator", "jog_rate_ext"]
      : [
          "irate",
          "irate",
          "an_external_denominator",
          "rate_with_external_denominator",
        ];
    Assert.deepEqual(
      markers,
      [22, 7, 11, 121].map((val, i) => ({
        type: "IntLikeMetric",
        cat: runtime ? "jog_ipc" : "test_only.ipc",
        id: ids[i],
        val,
      }))
    );
  });

  add_task({ skip_if: () => runningInParent }, async function test_event() {
    info(`${kind}: event`);
    let noExtra = runtime
      ? Glean.jogIpc.jogEventNoExtra
      : Glean.testOnlyIpc.noExtraEvent;
    let withExtra = runtime ? Glean.jogIpc.jogEvent : Glean.testOnlyIpc.anEvent;
    let markers = await runWithProfilerAndGetMarkers("EventMetric", () => {
      noExtra.record();
      withExtra.record({ extra1: "child process", extra2: "marker" });
    });
    for (let marker of markers) {
      if (marker.extra !== undefined) {
        marker.extra = JSON.parse(marker.extra);
      }
    }
    // Event marker names are looked up in the compile-time metric table.
    Assert.deepEqual(markers, [
      {
        type: "EventMetric",
        id: runtimeNames ? "id not found" : "testOnlyIpc.noExtraEvent",
      },
      {
        type: "EventMetric",
        id: runtimeNames ? "id not found" : "testOnlyIpc.anEvent",
        extra: { extra1: "child process", extra2: "marker" },
      },
    ]);
  });
}

// String, text, URL, UUID, datetime, timespan, object, labeled string and
// labeled quantity metrics do not support IPC. String-list additions do not
// emit child markers; dual-labeled counters await bug 1973287. Timing sample
// APIs and string-list set are also unsupported in children.

add_task(
  { skip_if: () => !runningInParent },
  async function test_child_markers() {
    await run_test_in_child("test_ProfilerMarkersIPC.js");
    await Services.fog.testFlushAllChildren();
    Assert.deepEqual(Glean.jogIpc.jogRateExt.testGetValue(), {
      numerator: 121,
      denominator: 11,
    });
  }
);
