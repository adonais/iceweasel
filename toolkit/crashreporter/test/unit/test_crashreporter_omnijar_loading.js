const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

// Launch the crashreporter client without arguments, which will load all
// localization and omnijar info and then stop since there's no dump file.
add_task(async function test_omnijar_loading() {
  TestUtils.assertPackagedBuild();

  const path = getCrashReporterPath();
  const proc = await Subprocess.call({
    command: path.path,
    arguments: [],
    environment: {
      // Set auto submit so the crash reporter will exit on its own.
      MOZ_CRASHREPORTER_AUTO_SUBMIT: "1",
    },
    stderr: "pipe",
  });

  await proc.wait();
  let stderr = await proc.stderr.readString();
  stderr = stderr.trim();
  Assert.equal(stderr.length, 0, `expected empty stderr, got:\n${stderr}`);
});
