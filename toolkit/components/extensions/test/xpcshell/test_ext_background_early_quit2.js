"use strict";

const { Management } = ChromeUtils.importESModule(
  "resource://gre/modules/Extension.sys.mjs"
);

// This test task quits in the middle of the test - do NOT add more tests below
// this, unless you explicitly want to verify the behavior after quitting.
//
// Regression test for bug 2051934, specifically the scenario described at
// https://bugzilla.mozilla.org/show_bug.cgi?id=2051934#c13
//
// The background page is loaded via HiddenXULWindow. When a quit is requested
// during browser/extension startup, HiddenXULWindow's initWindowlessBrowser()
// should settle instead of stalling forever.
//
// Note: test_ext_background_early_quit3.js seems identical, except it
// exercises the scenario where HiddenXULWindow already exists when quitting.
// test_ext_background_early_quit.js also exists, but tests a scenario that
// happens even later.
add_task(async function test_quit_while_background_starts_first_time() {
  let extension = ExtensionTestUtils.loadExtension({
    // Extension startup is blocked on background startup (bug 1543354).
    // If we somehow fail to make progress, then we should notice that.
    delayedStartup: false,
    background() {
      browser.test.fail(
        "Unexpected background page execution. eForceQuit should have aborted HiddenXULWindow load"
      );
    },
  });

  info("Waiting for extension to start up");
  let startupCount = 0;
  let runManifestCount = 0;
  // Verifies that background startup is interrupted; "startup" is emitted
  // before runManifest invokes the background initialization logic that
  // initializes HiddenXULWindow.
  // - https://searchfox.org/firefox-main/rev/d83a08d81de20f3b72db70f531fad19090e1db4b/toolkit/components/extensions/Extension.sys.mjs#4281,4284
  // - https://searchfox.org/firefox-main/rev/d83a08d81de20f3b72db70f531fad19090e1db4b/toolkit/components/extensions/parent/ext-backgroundPage.js#125
  Management.once("startup", (eventName, ext) => {
    ++startupCount;
    const origRunManifest = ext.runManifest;
    ext.runManifest = function () {
      ++runManifestCount;
      return Reflect.apply(origRunManifest, this, arguments);
    };

    // The Quit() call below calls ExitLastWindowClosingSurvivalArea() at
    // https://searchfox.org/mozilla-central/rev/38e462fe13ea42ae6cc391fb36e8b9e82e842b00/toolkit/components/startup/nsAppStartup.cpp#428,431
    // which expects an EnterLastWindowClosingSurvivalArea() to have called
    // before, or else the following assertion will be triggered at:
    // https://searchfox.org/mozilla-central/rev/38e462fe13ea42ae6cc391fb36e8b9e82e842b00/toolkit/components/startup/nsAppStartup.cpp#597-598
    // ASSERTION: consider quit stopper out of bounds: 'mConsiderQuitStopper > 0
    //
    // During normal (non-xpcshell) execution, nsAppStartup::Run() runs, which
    // calls EnterLastWindowClosingSurvivalArea(). In xpcshell tests, this is
    // not called, and we need to call it here:
    Services.startup.enterLastWindowClosingSurvivalArea();
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  });
  const { messages } = await promiseConsoleOutput(async () => {
    await extension.startup();
  });
  equal(startupCount, 1, "Observed one extension startup");
  equal(runManifestCount, 1, "Observed runManifest call after emit startup");

  equal(extension.extension.backgroundState, "stopped", "backgroundState");

  equal(
    messages.filter(m =>
      m.message.includes("Cannot create hidden browser past shutdown")
    ).length,
    1,
    "Found message when HiddenXULWindow initialization was aborted"
  );

  // To be most realistic, set the APP_SHUTDOWN flag when shutdown() is called
  // via extension.unload(). Otherwise we would run logic that ordinarily does
  // not run when extensions unload on browser shutdown.
  // E.g. ServiceWorkerCleanUp.removeFromPrincipal at
  // https://searchfox.org/firefox-main/rev/c0dff85fa67e5ab148ce20d4298c13f13ceec342/toolkit/components/extensions/Extension.sys.mjs#4542
  // throws NS_ERROR_XPC_GS_RETURNED_FAILURE upon calling
  // ServiceManager::GetService via unregisterServiceWorkersMatching.
  let shutdownCount = 0;
  const origShutdown = extension.extension.shutdown;
  extension.extension.shutdown = function () {
    // Sanity check: extension.unload() calls shutdown() without parameters.
    equal(arguments.length, 0, "shutdown() called without parameters");
    equal(++shutdownCount, 1, "shutdown() called once");
    return origShutdown.call(this, "APP_SHUTDOWN");
  };

  await extension.unload();
  equal(shutdownCount, 1, "extension.shutdown() was called");
});
