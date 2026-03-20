/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the sources table is always present in the profile,
 * even when the "jssources" feature is not enabled.
 */
add_task(async function test_source_table() {
  Assert.ok(
    !Services.profiler.IsActive(),
    "The profiler is not currently active"
  );

  info("Start profiler with 'js' feature but without the 'jssources' feature");
  await ProfilerTestUtils.startProfiler({
    entries: 1000000,
    interval: 1,
    threads: ["GeckoMain"],
    features: ["js"],
  });

  // Execute some JavaScript to create sources
  function testFunction() {
    return Math.random();
  }

  for (let i = 0; i < 100; i++) {
    testFunction();
  }

  await ProfilerTestUtils.captureAtLeastOneJsSample();

  const profile = await ProfilerTestUtils.stopNowAndGetProfile();
  const [thread] = profile.threads;

  // Verify that the sources table exists
  Assert.ok(profile.sources, "Profile has a sources table");
  Assert.ok(profile.sources.schema, "Sources table has a schema");
  Assert.ok(profile.sources.data, "Sources table has data");

  // Verify the schema has the expected fields
  Assert.ok(
    "uuid" in profile.sources.schema,
    "Sources schema has 'uuid' field"
  );
  Assert.ok(
    "filename" in profile.sources.schema,
    "Sources schema has 'filename' field"
  );

  // Verify that we have at least one source entry
  Assert.greater(
    profile.sources.data.length,
    0,
    "Sources table has at least one entry"
  );

  // Verify each source has the expected structure
  const uuidCol = profile.sources.schema.uuid;
  const filenameCol = profile.sources.schema.filename;

  for (const source of profile.sources.data) {
    Assert.ok(source[uuidCol], "Source entry has a UUID");
    Assert.ok(source[filenameCol], "Source entry has a filename");
  }

  // Verify that frames reference valid source indices
  const { frameTable, stringTable } = thread;
  const FRAME_LOCATION_SLOT = frameTable.schema.location;

  let framesWithSourceIndex = 0;

  for (const frame of frameTable.data) {
    const location = stringTable[frame[FRAME_LOCATION_SLOT]];
    const sourceIndexMatch = location.match(/\[(\d+)\]$/);
    if (sourceIndexMatch) {
      framesWithSourceIndex++;
      const sourceIndexFromFrame = parseInt(sourceIndexMatch[1]);
      Assert.ok(
        sourceIndexFromFrame >= 0 &&
          sourceIndexFromFrame < profile.sources.data.length,
        `Source index ${sourceIndexFromFrame} is valid and references an entry in the sources table`
      );
      const filenameFromFrame = location.match(/\((.+):\d+:\d+\)/)[1];
      Assert.equal(
        filenameFromFrame,
        profile.sources.data[sourceIndexFromFrame][filenameCol],
        `Frame filename matches the source table entry for source index ${sourceIndexFromFrame}`
      );
    }
  }

  Assert.greater(
    framesWithSourceIndex,
    0,
    "Found at least one frame with a source index"
  );

  info(
    `Found ${profile.sources.data.length} sources in the table, ` +
      `referenced by ${framesWithSourceIndex} frames.`
  );
});
