/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the No Stack Sampling feature.
 *
 * Thread CPU utilization is always gathered, even when periodic stack sampling
 * is disabled (bug 2033816). Samples are therefore still recorded while the No
 * Stack Sampling feature is on, but they carry no captured stack: their stack
 * is only the synthetic "(root)" frame. This test checks that no stacks are
 * captured while the feature is on, and that real stacks reappear once it is
 * off.
 */

/**
 * Returns whether any of a thread's samples carries a captured stack
 *
 * @param {object} thread - The thread from the profile.
 * @returns {boolean}
 */
function hasCapturedStack(thread) {
  const { stackTable, frameTable, stringTable } = thread;
  const SAMPLE_STACK_SLOT = thread.samples.schema.stack;
  const STACK_PREFIX_SLOT = stackTable.schema.prefix;

  let rootStackIndex;

  for (const sample of thread.samples.data) {
    const stackIndex = sample[SAMPLE_STACK_SLOT];

    // Doesn't hit in practice. Matches format spec.
    if (stackIndex === null) {
      continue;
    }

    // We know the rootStackIndex
    if (rootStackIndex !== undefined) {
      if (stackIndex !== rootStackIndex) {
        return true;
      }
      continue;
    }

    if (stackTable.data[stackIndex][STACK_PREFIX_SLOT] !== null) {
      // This is not the rootStackIndex, a stack of at least one frame was captured.
      return true;
    }

    // Found the rootStackIndex
    rootStackIndex = stackIndex;

    // Assert that it is the rootStackIndex
    const STACK_FRAME_SLOT = stackTable.schema.frame;
    const FRAME_LOCATION_SLOT = frameTable.schema.location;
    const frameIndex = stackTable.data[rootStackIndex][STACK_FRAME_SLOT];
    Assert.equal(
      stringTable[frameTable.data[frameIndex][FRAME_LOCATION_SLOT]],
      "(root)",
      "RootStack is labeled '(root)'."
    );
  }

  return false;
}

add_task(async function test_profile_feature_nostacksampling() {
  await ProfilerTestUtils.assertProfilerInactive();

  await ProfilerTestUtils.startProfiler({
    features: ["js", "nostacksampling"],
  });

  const url = BASE_URL + "do_work_500ms.html";
  await BrowserTestUtils.withNewTab(url, async contentBrowser => {
    const contentPid = await SpecialPowers.spawn(
      contentBrowser,
      [],
      () => Services.appinfo.processID
    );

    // Wait 500ms so that the tab finishes executing.
    await wait(500);

    // Check that no stacks are captured when the feature is turned on. Thread
    // CPU utilization is still gathered, so samples may be present, but none of
    // them should carry a captured stack.
    {
      const { parentThread, contentThread } =
        await stopProfilerNowAndGetThreads(contentPid);
      Assert.ok(
        !hasCapturedStack(parentThread),
        "A stack was captured from the parent process' main thread " +
          "when the No Stack Sampling feature was turned on."
      );
      Assert.ok(
        !hasCapturedStack(contentThread),
        "A stack was captured from the content process' main thread " +
          "when the No Stack Sampling feature was turned on."
      );
    }

    // Flush out any straggling allocation markers that may have not been collected
    // yet by starting and stopping the profiler once.
    await ProfilerTestUtils.startProfiler({ features: ["js"] });

    // Now reload the tab with a clean run.
    gBrowser.reload();
    await wait(500);

    // Check that stacks were captured when the feature is turned off.
    {
      const { parentThread, contentThread } =
        await waitSamplingAndStopProfilerAndGetThreads(contentPid);
      Assert.ok(
        hasCapturedStack(parentThread),
        "No stack was captured from the parent process' main thread " +
          "when the No Stack Sampling feature was not turned on."
      );

      Assert.ok(
        hasCapturedStack(contentThread),
        "No stack was captured from the content process' main thread " +
          "when the No Stack Sampling feature was not turned on."
      );
    }
  });
});
