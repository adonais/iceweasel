/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

dictionary ProfilerCounterOptions {
  /**
   * The name of the counter, used for its display in the profiler UI.
   */
  required UTF8String name;

  /**
   * See deriveCounterDisplay() in the Firefox Profiler for options on how different
   * counter types can map to display options in the profiler UI.
   *
   * https://github.com/firefox-devtools/profiler/blob/main/src/profile-logic/process-profile.ts
   *
   * Some categories will match (case-sensitive) existing UI display heuristics, which at
   * this time are: Bandwidth, Memory, power, CPU, processCPU
   *
   * If the category doesn't match, a gray "line-rate" graphType is used.
   */
  required UTF8String category;

  /**
   * A description for the counter. It's stored in the serialized profile, but is not
   * currently surfaced anywhere in the profiler UI.
   */
  UTF8String description = "";
};

/**
 * A counter that records the value of some quantity over the course of a
 * profile. The profiler samples the counter's value on each sample and shows
 * it as its own track, correlated in time with the sampled stacks and markers.
 * This is the same mechanism the profiler uses to track allocated memory, but
 * exposed for any quantity a caller wants to observe e.g. queue depth, open
 * connections, or cache size.
 *
 * Create one with ChromeUtils.addProfilerCounter(). The counter is sampled for
 * as long as this object is alive.
 */
[ChromeOnly, Exposed=Window]
interface ProfilerCounter {
  /**
   * Adds the signed delta to the counter's current value. Use a negative delta
   * to decrement. The track graphs the running total of all added deltas.
   */
  undefined add(long long delta);
};
