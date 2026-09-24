/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * These tests test that the initial browser tab has the right
 * process type assigned to it on creation, which avoids needless
 * process flips.
 */

"use strict";

const PRIVILEGEDABOUT_PROCESS_PREF =
  "browser.tabs.remote.separatePrivilegedContentProcess";
const PRIVILEGEDABOUT_PROCESS_ENABLED = Services.prefs.getBoolPref(
  PRIVILEGEDABOUT_PROCESS_PREF
);

const REMOTE_BROWSER_SHOWN = "remote-browser-shown";

// When the privileged content process is enabled, we expect about:home
// to load in it. Otherwise, it's in a normal web content process.
const EXPECTED_ABOUTHOME_REMOTE_TYPE = PRIVILEGEDABOUT_PROCESS_ENABLED
  ? E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE
  : E10SUtils.DEFAULT_REMOTE_TYPE;

/**
 * Test helper function that takes an nsICommandLine, and passes it
 * into the default command line handler for the browser. It expects
 * a new browser window to open, and then checks that the expected page
 * loads in the initial tab in the expected remote type, without doing
 * unnecessary process flips. The helper function then closes the window.
 *
 * @param aCmdLine (nsICommandLine)
 *        The command line to be processed by the default
 *        nsICommandLineHandler
 * @param aExpectedURL (string)
 *        The URL that the initial browser tab is expected to load.
 * @param aRemoteType (string)
 *        The expected remoteType on the initial browser tab.
 * @param aHandlerContract (string)
 *        The command-line handler contract to invoke.
 * @param aCheckBrowser (Function)
 *        An optional callback to inspect the loaded browser.
 * @returns Promise
 *        Resolves once the checks have completed, and the opened window
 *        have been closed.
 */
async function assertOneRemoteBrowserShown(
  aCmdLine,
  aExpectedURL,
  aRemoteType,
  aHandlerContract = "@mozilla.org/browser/final-clh;1",
  aCheckBrowser = null
) {
  let shownRemoteBrowsers = 0;
  let observer = () => {
    shownRemoteBrowsers++;
  };
  Services.obs.addObserver(observer, REMOTE_BROWSER_SHOWN);

  let newWinPromise = BrowserTestUtils.waitForNewWindow({
    url: aExpectedURL,
  });
  let newWin;
  try {
    let cmdLineHandler = Cc[aHandlerContract].getService(
      Ci.nsICommandLineHandler
    );
    cmdLineHandler.handle(aCmdLine);

    newWin = await newWinPromise;

    if (aRemoteType == E10SUtils.WEB_REMOTE_TYPE) {
      Assert.ok(
        E10SUtils.isWebRemoteType(newWin.gBrowser.selectedBrowser.remoteType)
      );
    } else {
      Assert.equal(newWin.gBrowser.selectedBrowser.remoteType, aRemoteType);
    }

    Assert.equal(
      shownRemoteBrowsers,
      1,
      "Should have only shown 1 remote browser"
    );
    if (aCheckBrowser) {
      await aCheckBrowser(newWin.gBrowser.selectedBrowser);
    }
  } finally {
    Services.obs.removeObserver(observer, REMOTE_BROWSER_SHOWN);
    if (newWin) {
      await BrowserTestUtils.closeWindow(newWin);
    }
  }
}

/**
 * Constructs an object that implements an nsICommandLine that should
 * cause the default nsICommandLineHandler to open aURL as the initial
 * tab in a new window. The returns nsICommandLine is stateful, and
 * shouldn't be reused.
 *
 * @param aURL (string)
 *        The URL to load in the initial tab of the new window.
 * @returns nsICommandLine
 */
function constructOnePageCmdLine(aURL) {
  return Cu.createCommandLine(
    ["-url", aURL],
    null,
    Ci.nsICommandLine.STATE_INITIAL_LAUNCH
  );
}

add_setup(async function () {
  NewTabPagePreloading.removePreloadedBrowser(window);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtab.preload", false],
      ["browser.startup.homepage", "about:home"],
      ["browser.startup.page", 1],
      ["browser.link.open_newwindow", 3],
      ["browser.link.open_newwindow.override.external", -1],
      ["security.data_uri.block_toplevel_data_uri_navigations", true],
    ],
  });
});

/**
 * This tests the default case, where no arguments are passed.
 */
add_task(async function test_default_args_and_homescreen() {
  let cmdLine = Cu.createCommandLine(
    [],
    null,
    Ci.nsICommandLine.STATE_INITIAL_LAUNCH
  );
  await assertOneRemoteBrowserShown(
    cmdLine,
    "about:home",
    EXPECTED_ABOUTHOME_REMOTE_TYPE
  );
});

/**
 * This tests the case where about:home is passed as the lone
 * argument.
 */
add_task(async function test_abouthome_arg() {
  const URI = "about:home";
  let cmdLine = constructOnePageCmdLine(URI);
  await assertOneRemoteBrowserShown(
    cmdLine,
    URI,
    EXPECTED_ABOUTHOME_REMOTE_TYPE
  );
});

/**
 * This tests the case where example.com is passed as the lone
 * argument.
 */
add_task(async function test_examplecom_arg() {
  const URI = "http://example.com/";
  let cmdLine = constructOnePageCmdLine(URI);
  await assertOneRemoteBrowserShown(
    cmdLine,
    URI,
    E10SUtils.DEFAULT_REMOTE_TYPE
  );
});

add_task(async function test_data_arg() {
  const URI = "data:text/html,data%20argument%20loaded";
  const tabPromise = BrowserTestUtils.waitForNewTab(gBrowser, URI, true);
  const cmdLine = Cu.createCommandLine(
    ["-data", URI],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );

  const cmdLineHandler = Cc["@mozilla.org/browser/clh;1"].getService(
    Ci.nsICommandLineHandler
  );
  cmdLineHandler.handle(cmdLine);

  const tab = await tabPromise;
  try {
    const { text, isNullPrincipal } = await SpecialPowers.spawn(
      tab.linkedBrowser,
      [],
      () => ({
        text: content.document.body.textContent,
        isNullPrincipal: content.document.nodePrincipal.isNullPrincipal,
      })
    );
    Assert.equal(text, "data argument loaded", "Should load the data: URL");
    Assert.ok(
      isNullPrincipal,
      "The data: document should have a null principal"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_data_arg_initial_launch() {
  const URI = "data:text/html,data%20argument%20loaded%20at%20startup";
  const cmdLine = Cu.createCommandLine(
    ["-data", URI],
    null,
    Ci.nsICommandLine.STATE_INITIAL_LAUNCH
  );
  await assertOneRemoteBrowserShown(
    cmdLine,
    URI,
    E10SUtils.WEB_REMOTE_TYPE,
    "@mozilla.org/browser/clh;1",
    async browser => {
      const { text, isNullPrincipal } = await SpecialPowers.spawn(
        browser,
        [],
        () => ({
          text: content.document.body.textContent,
          isNullPrincipal: content.document.nodePrincipal.isNullPrincipal,
        })
      );
      Assert.equal(
        text,
        "data argument loaded at startup",
        "Should load the data: URL at startup"
      );
      Assert.ok(
        isNullPrincipal,
        "The startup data: document should have a null principal"
      );
    }
  );
});

add_task(async function test_data_arg_new_window() {
  const URI = "data:text/html,data%20argument%20loaded%20in%20new%20window";
  const cmdLine = Cu.createCommandLine(
    ["-data", URI],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );
  await SpecialPowers.pushPrefEnv({
    set: [["browser.link.open_newwindow", 2]],
  });
  try {
    await assertOneRemoteBrowserShown(
      cmdLine,
      URI,
      E10SUtils.WEB_REMOTE_TYPE,
      "@mozilla.org/browser/clh;1",
      async browser => {
        const { text, isNullPrincipal } = await SpecialPowers.spawn(
          browser,
          [],
          () => ({
            text: content.document.body.textContent,
            isNullPrincipal: content.document.nodePrincipal.isNullPrincipal,
          })
        );
        Assert.equal(
          text,
          "data argument loaded in new window",
          "Should load the data: URL in a new window"
        );
        Assert.ok(
          isNullPrincipal,
          "The new-window data: document should have a null principal"
        );
      }
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_external_data_arg_remains_blocked() {
  const URI = "data:text/html,external%20data%20argument";
  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabOpen"
  );
  let warningSeen = false;
  function onConsoleMessage(msg) {
    if (
      msg instanceof Ci.nsIScriptError &&
      msg.category == "DATA_URI_BLOCKED"
    ) {
      warningSeen = true;
    }
  }
  Services.console.registerListener(onConsoleMessage);
  const cmdLine = Cu.createCommandLine(
    ["-url", URI],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );
  const cmdLineHandler = Cc["@mozilla.org/browser/final-clh;1"].getService(
    Ci.nsICommandLineHandler
  );

  cmdLineHandler.handle(cmdLine);

  const tab = (await tabOpenPromise).target;
  try {
    await TestUtils.waitForCondition(
      () =>
        warningSeen ||
        (!tab.linkedBrowser.isLoading &&
          tab.linkedBrowser.currentURI.spec == URI),
      "Wait for the external data: URL to be blocked or loaded"
    );
    Assert.ok(warningSeen, "Should report blocking an external data: URL");
    const text = await SpecialPowers.spawn(
      tab.linkedBrowser,
      [],
      () => content.document.body.textContent
    );
    Assert.notEqual(
      text,
      "external data argument",
      "Should block an external data: URL"
    );
  } finally {
    Services.console.unregisterListener(onConsoleMessage);
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(function test_data_arg_rejects_other_schemes() {
  const tabCount = gBrowser.tabs.length;
  const cmdLine = Cu.createCommandLine(
    ["-data", "https://example.com/"],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );
  const cmdLineHandler = Cc["@mozilla.org/browser/clh;1"].getService(
    Ci.nsICommandLineHandler
  );

  cmdLineHandler.handle(cmdLine);

  Assert.equal(
    gBrowser.tabs.length,
    tabCount,
    "Should not open a non-data URL"
  );
  Assert.ok(
    !cmdLine.preventDefault,
    "An invalid --data option should not suppress default startup handling"
  );
});
