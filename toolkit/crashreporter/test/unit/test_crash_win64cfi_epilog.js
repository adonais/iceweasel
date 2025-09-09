add_task(async function run_test() {
  await do_x64CFITest("CRASH_X64CFI_EPILOG", [
    { symbol: "CRASH_X64CFI_EPILOG", trust: "context" },
    { symbol: "CRASH_X64CFI_LAUNCHER", trust: "cfi" },
  ]);
})
  // Skip until bug 1980648 is addressed.
  .skip();
