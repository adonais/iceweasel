/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { require } = ChromeUtils.importESModule(
  "resource://devtools/shared/loader/Loader.sys.mjs"
);
const {
  BrowserConsoleManager,
} = require("resource://devtools/client/webconsole/browser-console-manager.js");

// Opening a Browser Console window can be slow on CI.
requestLongerTimeout(2);

const DEVTOOLS_DISABLED_PREF = "devtools.policy.disabled";

// An open Browser Console is closed when DevTools are disabled live.
add_task(async function test_browser_console_closes_on_disable() {
  const hud = await BrowserConsoleManager.toggleBrowserConsole();
  ok(hud, "Browser Console opened");
  ok(
    BrowserConsoleManager.getBrowserConsole(),
    "Browser Console is open before DevTools are disabled"
  );

  await SpecialPowers.pushPrefEnv({
    set: [[DEVTOOLS_DISABLED_PREF, true]],
  });
  await TestUtils.waitForCondition(
    () => !BrowserConsoleManager.getBrowserConsole(),
    "The Browser Console is closed when DevTools are disabled live"
  );
});
