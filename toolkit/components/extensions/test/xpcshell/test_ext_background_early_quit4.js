"use strict";

// This test task quits in the middle of the test - do NOT add more tests below
// this, unless you explicitly want to verify the behavior after quitting.
//
// Regression test for the class of bugs seen in bug 2051934, observed in the
// wild at https://bugzilla.mozilla.org/show_bug.cgi?id=2003265#c14
//
// This verifies the scenario where quit happens while waiting for
// XULFrameLoaderCreated. In terms of timing, this is after
// test_ext_background_early_quit3.js, before test_ext_background_early_quit.js
add_task(async function test_quit_while_background_starts_loading_browser() {
  // Need an existing background page to prepare hook for browser creation.
  let unrelatedExtension = ExtensionTestUtils.loadExtension({
    background() {
      // Nothing here, when startup() resolves we have loaded.
    },
  });
  await unrelatedExtension.startup();

  // The HiddenXULWindow's windowlessBrowser's document:
  const windowlessBrowserDocument =
    unrelatedExtension.extension.backgroundContext.xulBrowser.ownerDocument;

  function triggerRealQuit() {
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
  }

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
  let browserCount = 0;
  const origCreateXULElement = windowlessBrowserDocument.createXULElement;
  windowlessBrowserDocument.createXULElement = function () {
    ++browserCount;
    // Not expecting more than 1, but just in case we somehow get more:
    if (browserCount === 1) {
      triggerRealQuit();
    }
    return Reflect.apply(origCreateXULElement, this, arguments);
  };
  const { messages } = await promiseConsoleOutput(async () => {
    await extension.startup();
  });
  equal(browserCount, 1, "Seen one background browser creation attempt");

  equal(extension.extension.backgroundState, "stopped", "backgroundState");

  equal(
    messages.filter(m =>
      m.message.includes("Aborted hidden browser creation at shutdown")
    ).length,
    1,
    "Found message when quit while waiting for XULFrameLoaderCreated"
  );

  // To be most realistic, set the APP_SHUTDOWN flag when shutdown() is called
  // via extension.unload(). Otherwise we would run logic that ordinarily does
  // not run when extensions unload on browser shutdown.
  // E.g. ServiceWorkerCleanUp.removeFromPrincipal at
  // https://searchfox.org/firefox-main/rev/c0dff85fa67e5ab148ce20d4298c13f13ceec342/toolkit/components/extensions/Extension.sys.mjs#4542
  // throws NS_ERROR_XPC_GS_RETURNED_FAILURE upon calling
  // ServiceManager::GetService via unregisterServiceWorkersMatching.
  let shutdownCount = 0;
  const Extension_prototype = Object.getPrototypeOf(extension.extension);
  const origShutdown = Extension_prototype.shutdown;
  Extension_prototype.shutdown = function () {
    ++shutdownCount;
    return origShutdown.call(this, "APP_SHUTDOWN");
  };

  await extension.unload();
  await unrelatedExtension.unload();
  equal(shutdownCount, 2, "extension.shutdown() was called twice");
});
