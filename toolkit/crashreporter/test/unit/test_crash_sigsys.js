/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(
  { skip_if: () => !("@mozilla.org/toolkit/crash-reporter;1" in Cc) },
  async function run_test() {
    // Trigger a SIGSYS crash by deliberately calling a bogus syscall.
    await do_crash(
      function () {
        crashType = CrashTestUtils.CRASH_SIGSYS;
        crashReporter.annotateCrashReport("TestKey", "TestValue");
      },
      async function (mdump, extra, extraFile) {
        runMinidumpAnalyzer(mdump);

        // Refresh updated extra data
        extra = await IOUtils.readJSON(extraFile.path);

        // Will be "EXC_SOFTWARE / SIGSYS" in future versions of minidump-common
        Assert.equal(
          JSON.parse(extra.StackTraces).crash_type,
          "EXC_SOFTWARE / 0x00010000"
        );
        Assert.equal(extra.TestKey, "TestValue");
      },
      // process will exit with a zero exit status
      true
    );
  }
);
