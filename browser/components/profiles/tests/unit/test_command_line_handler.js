/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const execProcess = sinon.stub();
const sendCommandLine = sinon.stub().throws(Cr.NS_ERROR_NOT_AVAILABLE);
const commandLineHandler = sinon.stub();

add_setup(async () => {
  await initSelectableProfileService();

  sinon.replace(
    getSelectableProfileService(),
    "sendCommandLine",
    (path, args, raise) => sendCommandLine(path, [...args], raise)
  );
  sinon.replace(getSelectableProfileService(), "execProcess", execProcess);

  let { nsDefaultCommandLineHandler: browserClh } = ChromeUtils.importESModule(
    "moz-src:///browser/components/BrowserContentHandler.sys.mjs"
  );

  sinon.replace(browserClh.prototype, "handle", commandLineHandler);
});

function nextCall(stub) {
  let { promise, resolve } = Promise.withResolvers();

  stub.callsFake(() => resolve());
  return promise;
}

add_task(async function test_profiles_update() {
  let clh = Cc[
    "@mozilla.org/browser/selectable-profiles-service-clh;1"
  ].createInstance(Ci.nsICommandLineHandler);

  let observer = sinon.stub();
  Services.obs.addObserver(observer, "sps-profiles-updated");
  let observerArgsPromise = nextCall(observer);

  let cmdLine = Cu.createCommandLine(
    ["--profiles-updated"],
    null,
    Ci.nsICommandLine.STATE_REMOTE_AUTO
  );

  clh.handle(cmdLine);

  await observerArgsPromise;

  Assert.equal(observer.callCount, 1, "Should have called the observer");
  Assert.deepEqual(observer.firstCall.args, [
    null,
    "sps-profiles-updated",
    "remote",
  ]);

  Assert.ok(
    cmdLine.preventDefault,
    "Should have prevented the default handler"
  );

  Services.obs.removeObserver(observer, "sps-profiles-updated");
});

add_task(async function test_redirect_args() {
  if (Services.appinfo.OS !== "Darwin") {
    // This behaviour is specific to macOS
    return;
  }

  let clh = Cc[
    "@mozilla.org/browser/selectable-profiles-service-clh;1"
  ].createInstance(Ci.nsICommandLineHandler);

  let { rootDir } = getProfileService().currentProfile;

  let profilePath = rootDir.path;

  let cmdLine = Cu.createCommandLine(
    ["-url", "https://www.google.com/"],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );

  clh.handle(cmdLine);

  Assert.ok(
    cmdLine.preventDefault,
    "Should have prevented the default handler"
  );

  await nextCall(commandLineHandler);

  Assert.equal(
    commandLineHandler.callCount,
    1,
    "Should have called the main browser command line handler directly"
  );

  let [generatedCmdLine] = commandLineHandler.firstCall.args;
  Assert.equal(
    generatedCmdLine.length,
    2,
    "Should have generated a command line with the correct number of arguments"
  );
  Assert.equal(generatedCmdLine.getArgument(0), "-url");
  Assert.equal(
    generatedCmdLine.getArgument(1),
    "https://www.google.com/",
    "Should have generated a command line with the correct URL"
  );

  commandLineHandler.resetHistory();

  let backgroundArgs = [
    "-url-background",
    "https://www.example.com/",
    "-url-background",
    "https://www.mozilla.org/",
  ];
  let mixedArgs = [
    "-url-background",
    "https://www.example.com/",
    "-url",
    "https://www.mozilla.org/",
  ];
  let reversedMixedArgs = [...mixedArgs.slice(2), ...mixedArgs.slice(0, 2)];
  for (let args of [backgroundArgs, mixedArgs, reversedMixedArgs]) {
    cmdLine = Cu.createCommandLine(
      args,
      null,
      Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
    );
    let handledPromise = nextCall(commandLineHandler);
    clh.handle(cmdLine);
    await handledPromise;
    [generatedCmdLine] = commandLineHandler.firstCall.args;
    Assert.deepEqual(
      Array.from({ length: generatedCmdLine.length }, (_, i) =>
        generatedCmdLine.getArgument(i)
      ),
      args,
      "The current profile preserves the URL arguments"
    );
    commandLineHandler.resetHistory();
  }

  let profileData = readProfilesIni();

  for (let profile of profileData.profiles) {
    if (profile.storeID == getSelectableProfileService().storeID) {
      profile.path = profile.path.replace(rootDir.leafName, "other-profile");

      break;
    }
  }

  writeProfilesIni(profileData);

  rootDir.leafName = "other-profile";

  profilePath = rootDir.path;

  cmdLine = Cu.createCommandLine(
    ["-url", "https://www.example.com/", "-url", "https://www.mozilla.org/"],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );

  clh.handle(cmdLine);

  Assert.ok(
    cmdLine.preventDefault,
    "Should have prevented the default handler"
  );

  await nextCall(execProcess);

  Assert.equal(
    sendCommandLine.callCount,
    1,
    "Should have attempted to remote once"
  );
  Assert.deepEqual(
    sendCommandLine.firstCall.args,
    [
      profilePath,
      ["-url", "https://www.example.com/", "-url", "https://www.mozilla.org/"],
      true,
    ],
    "should have used the right arguments"
  );

  sendCommandLine.resetHistory();

  Assert.equal(execProcess.callCount, 1, "Should have attempted to exec once");
  Assert.deepEqual(
    execProcess.firstCall.args,
    [
      [
        "-foreground",
        "-url",
        "https://www.example.com/",
        "-url",
        "https://www.mozilla.org/",
      ],
    ],
    "should have used the right arguments"
  );

  execProcess.resetHistory();

  for (let { args, shouldActivate } of [
    { args: backgroundArgs, shouldActivate: false },
    { args: mixedArgs, shouldActivate: true },
    { args: reversedMixedArgs, shouldActivate: true },
  ]) {
    cmdLine = Cu.createCommandLine(
      args,
      null,
      Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
    );
    let launchedPromise = nextCall(execProcess);
    clh.handle(cmdLine);
    await launchedPromise;
    Assert.deepEqual(
      sendCommandLine.firstCall.args,
      [profilePath, args, shouldActivate],
      "Only background-only requests suppress activation when forwarding"
    );
    Assert.deepEqual(
      execProcess.firstCall.args,
      [[...(shouldActivate ? ["-foreground"] : []), ...args]],
      "Only background-only requests omit -foreground when relaunching"
    );
    sendCommandLine.resetHistory();
    execProcess.resetHistory();
  }

  sendCommandLine.resetBehavior();
  try {
    for (let { args, shouldActivate } of [
      { args: backgroundArgs, shouldActivate: false },
      { args: mixedArgs, shouldActivate: true },
      { args: reversedMixedArgs, shouldActivate: true },
    ]) {
      cmdLine = Cu.createCommandLine(
        args,
        null,
        Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
      );
      let sentPromise = nextCall(sendCommandLine);
      clh.handle(cmdLine);
      await sentPromise;
      Assert.deepEqual(
        sendCommandLine.firstCall.args,
        [profilePath, args, shouldActivate],
        "A running profile receives the correct activation request"
      );
      Assert.ok(
        execProcess.notCalled,
        "Successful forwarding does not relaunch"
      );
      sendCommandLine.resetHistory();
    }
  } finally {
    sendCommandLine.throws(Cr.NS_ERROR_NOT_AVAILABLE);
  }
});
