const testUtils = Cc[
  "@mozilla.org/toolkit/crashreporter-test-utils;1"
].getService(Ci.nsICrashReporterTestUtils);

add_task(async function test_moz_crashreporter() {
  dump("INFO | test_crashreporter.js | Get crashreporter service.\n");
  var cr = Services.appinfo;
  Assert.ok(Services.appinfo.crashReporterEnabled);

  // We don't export the PID on Windows, skip that particular check there.
  if (AppConstants.platform != "win") {
    Assert.greater(testUtils.getCrashHelperPid(), 0);
  }

  try {
    cr.serverURL;
    do_throw("Getting serverURL when not set should have thrown!");
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_FAILURE);
  }

  // check setting/getting serverURL

  // try it with two different URLs, just for kicks
  var testspecs = [
    "http://example.com/submit",
    "https://example.org/anothersubmit",
  ];
  for (var i = 0; i < testspecs.length; ++i) {
    cr.serverURL = Services.io.newURI(testspecs[i]);
    Assert.equal(cr.serverURL.spec, testspecs[i]);
  }

  // should not allow setting non-http/https URLs
  try {
    cr.serverURL = Services.io.newURI("ftp://example.com/submit");
    do_throw("Setting serverURL to a non-http(s) URL should have thrown!");
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_INVALID_ARG);
  }

  // check getting/setting minidumpPath
  // it should be $TEMP by default, but I'm not sure if we can exactly test that
  // this will at least test that it doesn't throw
  Assert.notEqual(cr.minidumpPath.path, "");
  var cwd = do_get_cwd();
  cr.minidumpPath = cwd;
  Assert.equal(cr.minidumpPath.path, cwd.path);

  // Allow testing validation in debug builds (otherwise an assertion will trip
  // on invalid annotation keys).
  Services.prefs.setBoolPref(
    "toolkit.crash_annotation.testing_validation",
    true
  );

  // Test annotateCrashReport()
  try {
    cr.annotateCrashReport(undefined, "");
    do_throw(
      "Calling annotateCrashReport() with an undefined key should have thrown!"
    );
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_INVALID_ARG);
  }
  try {
    cr.annotateCrashReport("foobar", "");
    do_throw(
      "Calling annotateCrashReport() with a bogus key should have thrown!"
    );
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_INVALID_ARG);
  }
  cr.annotateCrashReport("TestKey", "testData1");
  // Replace previous data.
  cr.annotateCrashReport("TestKey", "testData2");
  // Allow nul chars in annotations.
  cr.annotateCrashReport("TestKey", "da\0ta");

  cr.appendAppNotesToCrashReport("additional testData3");
  // Add more data.
  cr.appendAppNotesToCrashReport("additional testData4");

  // Test removeCrashReportAnnotation()
  try {
    cr.removeCrashReportAnnotation(undefined);
    do_throw(
      "Calling removeCrashReportAnnotation() with an undefined key should have thrown!"
    );
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_INVALID_ARG);
  }
  try {
    cr.removeCrashReportAnnotation("foobar");
    do_throw(
      "Calling removeCrashReportAnnotation() with a bogus key should have thrown!"
    );
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_INVALID_ARG);
  }
  cr.removeCrashReportAnnotation("TestKey");

  // Testing setting the minidumpPath field
  cr.minidumpPath = cwd;
  Assert.equal(cr.minidumpPath.path, cwd.path);

  Services.prefs.clearUserPref("toolkit.crash_annotation.testing_validation");
});

add_task(async function test_moz_crashreporter_disable() {
  if (!AppConstants.MOZ_BACKGROUNDTASKS) {
    return;
  }

  const { Subprocess } = ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs"
  );

  let bin = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  if (AppConstants.platform === "win") {
    bin.append(AppConstants.MOZ_APP_NAME + ".exe");
  } else {
    bin.append(AppConstants.MOZ_APP_NAME);
  }

  let protocolHandler = Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler);
  let testingCommonURI = protocolHandler.getSubstitution("testing-common");

  const proc = await Subprocess.call({
    command: bin.path,
    arguments: ["--backgroundtask", "crashReporterStatus"],
    environment: {
      MOZ_CRASHREPORTER_DISABLE: "1",
      MOZ_CRASHREPORTER: "",
      XPCSHELL_TESTING_MODULES_URI: testingCommonURI.spec,
    },
    environmentAppend: true,
    stderr: "stdout",
  });

  let output = "";
  let chunk;
  while ((chunk = await proc.stdout.readString())) {
    output += chunk;
  }
  await proc.wait();

  const match = output.match(/CRASH_INFO=(\{.*\})/);
  Assert.ok(match, `subprocess emitted CRASH_INFO (output: ${output})`);
  const info = JSON.parse(match[1]);
  Assert.equal(info.crashReporterEnabled, false);
  Assert.equal(info.crashHelperPid, 0);
  Assert.equal(info.serverURL.error, Cr.NS_ERROR_NOT_INITIALIZED);
  Assert.equal(info.minidumpPath.error, Cr.NS_ERROR_NOT_INITIALIZED);
});
