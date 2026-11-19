/* import-globals-from ../unit/head_crashreporter.js */
load("../unit/head_crashreporter.js");

// The manifest forces the use of the remote executor, which runs in a process
// forked from the crashed one, hence the disabled content sandbox.
add_task(async function run_test() {
  if (!("@mozilla.org/toolkit/crash-reporter;1" in Cc)) {
    dump(
      "INFO | test_content_remote_executor.js | Can't test crashreporter in a non-libxul build.\n"
    );
    return;
  }

  await do_content_crash(
    function () {
      crashType = CrashTestUtils.CRASH_MOZ_CRASH;
    },
    function (mdump, extra) {
      Assert.equal(extra.MinidumpRemoteExecutorForTesting, "1");
      Assert.greater(mdump.fileSize, 0);
      // TODO: see bug 2082922 for annotation support
      Assert.ok(
        !("DumperError" in extra) ||
          extra.DumperError == "MissingChildProcessAnnotations",
        extra.DumperError
      );
      Assert.ok(
        CrashTestUtils.dumpHasStream(
          mdump.path,
          CrashTestUtils.MD_THREAD_LIST_STREAM
        )
      );
      Assert.ok(CrashTestUtils.dumpHasInstructionPointerMemory(mdump.path));
    }
  );
});
