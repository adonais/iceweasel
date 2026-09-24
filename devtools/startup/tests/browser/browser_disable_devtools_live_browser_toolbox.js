/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { require } = ChromeUtils.importESModule(
  "resource://devtools/shared/loader/Loader.sys.mjs"
);
const {
  gDevTools,
} = require("resource://devtools/client/framework/devtools.js");
const { BrowserToolboxLauncher } = ChromeUtils.importESModule(
  "resource://devtools/client/framework/browser-toolbox/Launcher.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
// Closing the Browser Toolbox process can leave "File closed" rejections.
PromiseTestUtils.allowMatchingRejectionsGlobally(/File closed/);

// Launching a Browser Toolbox process is slow.
requestLongerTimeout(4);

const DEVTOOLS_DISABLED_PREF = "devtools.policy.disabled";

function synthesizeToggleToolboxKey() {
  if (Services.appinfo.OS == "Darwin") {
    EventUtils.synthesizeKey("i", { accelKey: true, altKey: true });
  } else {
    EventUtils.synthesizeKey("i", { accelKey: true, shiftKey: true });
  }
}

async function openToolboxViaShortcut(tab) {
  gBrowser.selectedTab = tab;
  const onReady = gDevTools.once("toolbox-ready");
  synthesizeToggleToolboxKey();
  await onReady;
  return gDevTools.getToolboxForTab(tab);
}

// An open Browser Toolbox is closed when DevTools are disabled live.
add_task(async function test_browser_toolbox_closes_on_disable() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["devtools.chrome.enabled", true],
      ["devtools.debugger.remote-enabled", true],
      ["devtools.debugger.prompt-connection", false],
    ],
  });

  await BrowserTestUtils.withNewTab(
    "data:text/html,<title>browser toolbox live</title>",
    async browser => {
      const tab = gBrowser.getTabForBrowser(browser);

      // Mark DevTools initialized (the teardown path is guarded on it) by
      // opening then closing an in-window toolbox.
      const toolbox = await openToolboxViaShortcut(tab);
      await toolbox.destroy();

      info("Launching a Browser Toolbox");
      await new Promise(resolve => {
        BrowserToolboxLauncher.init({
          onRun: () => resolve(),
          overwritePreferences: true,
        });
      });
      ok(
        BrowserToolboxLauncher.getBrowserToolboxSessionState(),
        "Browser Toolbox is running before DevTools are disabled"
      );

      await SpecialPowers.pushPrefEnv({
        set: [[DEVTOOLS_DISABLED_PREF, true]],
      });
      await TestUtils.waitForCondition(
        () => !BrowserToolboxLauncher.getBrowserToolboxSessionState(),
        "The Browser Toolbox process is closed when DevTools are disabled live"
      );
    }
  );
});
