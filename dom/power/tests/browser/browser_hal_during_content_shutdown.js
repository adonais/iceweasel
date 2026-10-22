/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PAGE = "https://example.com/";

// A content process only creates its PHal actor lazily, e.g. when a top-level
// document becomes active. Use a background tab so that the first HAL call
// happens during XPCOM shutdown, after the PContent channel is gone.
add_task(async function test_first_hal_use_during_content_xpcom_shutdown() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.ipc.processPreload.enabled", false]],
  });
  Services.ppmm.releaseCachedProcesses();

  let tab = BrowserTestUtils.addTab(gBrowser, PAGE, { forceNewProcess: true });
  let browser = tab.linkedBrowser;
  await BrowserTestUtils.browserLoaded(browser, { wantLoad: PAGE });
  Assert.notEqual(gBrowser.selectedTab, tab, "Tab stays in the background");

  await SpecialPowers.spawn(browser, [], () => {
    Services.obs.addObserver(() => {
      Cc["@mozilla.org/power/powermanagerservice;1"].getService(
        Ci.nsIPowerManagerService
      );
    }, "xpcom-shutdown");
  });

  let remoteTab = browser.frameLoader.remoteTab;
  let destroyed = TestUtils.topicObserved(
    "ipc:browser-destroyed",
    subject => subject === remoteTab
  );
  BrowserTestUtils.removeTab(tab);
  await destroyed;
});
