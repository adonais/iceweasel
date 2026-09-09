/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The serialized samples table for a single counter in a Gecko profile.
 *
 * @typedef {object} CounterSamples
 * @property {object} schema - Maps column names to their index in each row.
 * @property {number} schema.count - Index of the delta-encoded count column.
 * @property {Array<Array<number>>} data - One row per sample.
 */

/**
 * A single counter as serialized into a Gecko profile.
 *
 * @typedef {object} SerializedCounter
 * @property {string} name
 * @property {string} category
 * @property {string} description
 * @property {CounterSamples} samples
 */

/**
 * The subset of the Gecko profile these tests inspect.
 *
 * @typedef {object} Profile
 * @property {SerializedCounter[]} [counters] - Absent when the session
 *   recorded no counters.
 */

/**
 * @param {SerializedCounter} counter
 * @returns {number}
 */
function sumCounterCounts(counter) {
  let total = 0;
  for (const sample of counter.samples.data) {
    total += sample[counter.samples.schema.count];
  }
  return total;
}

/**
 * @param {Profile} profile
 * @param {string} name
 * @returns {SerializedCounter | undefined}
 */
function findCounter(profile, name) {
  return (profile.counters ?? []).find(c => c.name === name);
}

/**
 * Force garbage collection twice to ensure the two independent collectors reliably
 * collect information. It may work with just doing each one once, but twice helps
 * guard against surprises.
 */
function collectGarbage() {
  for (let i = 0; i < 2; i++) {
    Cu.forceGC();
    Cu.forceCC();
  }
}

/**
 * Exercise the ChromeUtils.addProfilerCounter API.
 */
add_task(async function add_profiler_counter_basics() {
  const name = "Test Counter";
  const category = "Test";
  const description = "A simple counter showing how the feature works";

  const counter = ChromeUtils.addProfilerCounter({
    name,
    category,
    description,
  });

  await ProfilerTestUtils.startProfiler();

  counter.add(3);
  counter.add(-4);

  await Services.profiler.waitOnePeriodicSampling();

  /** @type {Profile} */
  const profile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  const serializedCounter = findCounter(profile, name);
  Assert.ok(serializedCounter, "The test counter was found in the profile.");
  Assert.equal(
    serializedCounter.category,
    category,
    "The counter has the expected category."
  );
  Assert.equal(
    serializedCounter.description,
    description,
    "The counter has the expected description."
  );

  Assert.equal(
    sumCounterCounts(serializedCounter),
    3 - 4,
    "The summed deltas agree"
  );
});

/**
 * Counters can be added when the profiler is inactive, and only counts added while
 * the profiler is active are counted.
 */
add_task(async function add_profiler_counter_before_start() {
  const counter = ChromeUtils.addProfilerCounter({
    name: "PreStartCounter",
    category: "Test",
  });

  counter.add(10);

  await ProfilerTestUtils.startProfiler();

  counter.add(5);

  await Services.profiler.waitOnePeriodicSampling();

  /** @type {Profile} */
  const profile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  const serialized = findCounter(profile, "PreStartCounter");
  Assert.ok(serialized, "A counter created before start is sampled.");
  Assert.equal(
    sumCounterCounts(serialized),
    5,
    "Only the add made after the profiler started is counted."
  );
});

/**
 * Counters can live between profiling sessions, but are only counting during the live
 * session.
 */
add_task(async function add_profiler_counter_spans_sessions() {
  const counter = ChromeUtils.addProfilerCounter({
    name: "SpanningCounter",
    category: "Test",
  });

  await ProfilerTestUtils.startProfiler();
  counter.add(1);
  await Services.profiler.waitOnePeriodicSampling();
  /** @type {Profile} */
  const firstProfile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  const first = findCounter(firstProfile, "SpanningCounter");
  Assert.ok(first, "The counter is present in the first session.");
  Assert.equal(sumCounterCounts(first), 1, "The first session sees its add.");

  counter.add(100);

  await ProfilerTestUtils.startProfiler();
  counter.add(2);
  await Services.profiler.waitOnePeriodicSampling();
  /** @type {Profile} */
  const secondProfile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  const second = findCounter(secondProfile, "SpanningCounter");
  Assert.ok(second, "The same counter is present in the second session.");
  Assert.equal(
    sumCounterCounts(second),
    2,
    "The second session sees only its own add, not the first session's value " +
      "or the add made while stopped."
  );
});

/**
 * Garbage collecting a counter should drop the counter from the JavaScript side, but
 * it should be retained at least until serialization happens.
 */
add_task(async function add_profiler_counter_collected_mid_session() {
  let doomed = ChromeUtils.addProfilerCounter({
    name: "DoomedCounter",
    category: "Test",
  });
  const survivor = ChromeUtils.addProfilerCounter({
    name: "SurvivorCounter",
    category: "Test",
  });

  await ProfilerTestUtils.startProfiler();

  doomed.add(7);
  survivor.add(1);
  await Services.profiler.waitOnePeriodicSampling();

  doomed = null;
  collectGarbage();

  survivor.add(1);
  await Services.profiler.waitOnePeriodicSampling();

  /** @type {Profile} */
  const profile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  const survivorCounter = findCounter(profile, "SurvivorCounter");
  Assert.ok(survivorCounter, "The surviving counter is still present.");
  Assert.equal(
    sumCounterCounts(survivorCounter),
    2,
    "The surviving counter kept accumulating after the other was collected."
  );

  const doomedCounter = findCounter(profile, "DoomedCounter");
  Assert.ok(
    doomedCounter,
    "The collected counter is still present in the profile."
  );
  Assert.equal(
    sumCounterCounts(doomedCounter),
    7,
    "The collected counter reflects the add made before it was collected."
  );
});

/**
 * Profiler counters can be created and never actually seen during profiling.
 */
add_task(async function add_profiler_counter_collected_before_start() {
  let counter = ChromeUtils.addProfilerCounter({
    name: "EphemeralCounter",
    category: "Test",
  });
  counter.add(1);
  counter = null;
  collectGarbage();

  await ProfilerTestUtils.startProfiler();
  await Services.profiler.waitOnePeriodicSampling();
  /** @type {Profile} */
  const profile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  Assert.ok(
    !findCounter(profile, "EphemeralCounter"),
    "A counter collected before profiling started does not appear."
  );
});

/**
 * Two counters created with the same name and category are independent objects.
 * Each registers separately, so dropping one must not disturb the other.
 */
add_task(async function add_profiler_counter_duplicate_names() {
  const first = ChromeUtils.addProfilerCounter({
    name: "DuplicateName",
    category: "Test",
  });
  let second = ChromeUtils.addProfilerCounter({
    name: "DuplicateName",
    category: "Test",
  });

  await ProfilerTestUtils.startProfiler();

  first.add(4);
  second.add(4);

  second = null;
  collectGarbage();

  first.add(4);
  await Services.profiler.waitOnePeriodicSampling();

  /** @type {Profile} */
  const profile = await Services.profiler.getProfileDataAsync();
  await Services.profiler.StopProfiler();

  const survivors = (profile.counters ?? []).filter(
    c => c.name === "DuplicateName"
  );
  Assert.greaterOrEqual(
    survivors.length,
    1,
    "At least one same-named counter remains after the other is collected."
  );
  const survivingTotal = Math.max(...survivors.map(sumCounterCounts));
  Assert.equal(
    survivingTotal,
    8,
    "The still-held counter recorded all of its own adds, independent of its " +
      "collected same-named sibling."
  );
});
