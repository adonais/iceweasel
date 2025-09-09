/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

add_setup(
  /* on Android FOG is set up through head.js */
  { skip_if: () => AppConstants.platform == "android" },
  function test_setup() {
    // FOG needs a profile directory to put its data in.
    do_get_profile();

    // We need to initialize it once, otherwise operations will be stuck in the pre-init queue.
    Services.fog.initializeFOG();
  }
);

add_task(function test_fog_init_works() {
  if (new Date().getHours() >= 3 && new Date().getHours() <= 4) {
    // We skip this test if it's too close to 4AM, when we might send a
    // "metrics" ping between init and this test being run.
    Assert.ok(true, "Too close to 'metrics' ping send window. Skipping test.");
    return;
  }
  const snapshot = Glean.fog.initializations.testGetValue();
  Assert.equal(snapshot.count, 1, "FOG init happened once.");
  Assert.greater(snapshot.sum, 0, "FOG init's time was measured.");
});

add_task(function test_fog_initialized_with_correct_rate_limit() {
  Assert.greater(
    Glean.fog.maxPingsPerMinute.testGetValue(),
    0,
    "FOG has been initialized with a ping rate limit of greater than 0."
  );
});

add_task(
  {
    skip_if: () => !AppConstants.NIGHTLY_BUILD,
  },
  function test_fog_gathers_dir_info_on_startup() {
    Assert.deepEqual(
      Glean.fog.dataDirectoryInfo.testGetValue(),
      [
        {
          dir_name: "db",
          dir_exists: false,
        },
        {
          dir_name: "events",
          dir_exists: false,
        },
        {
          dir_name: "pending_pings",
          dir_exists: false,
        },
      ],
      "Directory info was collected on first startup."
    );

    // Startup again to make sure we collect the directory info when the dirs exist.
    Services.fog.initializeFOG();

    // Record an event to ensure that the directory info is updated with the next startup.
    Glean.testOnly.anEvent.record();

    let dir_info = Glean.fog.dataDirectoryInfo.testGetValue();
    Assert.equal(dir_info[0].dir_name, "db");
    Assert.equal(dir_info[0].dir_exists, true);
    // There should be at most 2 files in the db directory, data.safe.bin and maybe data.safe.tmp
    Assert.lessOrEqual(dir_info[0].files.length, 2);
    Assert.greater(dir_info[0].files[0].file_size, 0);
    Assert.equal(dir_info[1].dir_name, "events");
    Assert.equal(dir_info[1].dir_exists, true);
    Assert.equal(dir_info[2].dir_name, "pending_pings");
    Assert.equal(dir_info[2].dir_exists, true);

    Services.fog.initializeFOG();

    let new_dir_info = Glean.fog.dataDirectoryInfo.testGetValue();
    Assert.equal(new_dir_info[1].dir_name, "events");
    Assert.equal(new_dir_info[1].dir_exists, true);
    Assert.equal(new_dir_info[1].file_count, 1);
    Assert.equal(new_dir_info[1].files[0].file_name, "test-ping");
    Assert.greater(new_dir_info[1].files[0].file_size, 0);

    console.log(
      "Directory info collected on startup: ",
      Glean.fog.dataDirectoryInfo.testGetValue()
    );
  }
);
