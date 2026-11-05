/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function checkBackgroundExternalURLs() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.loadDivertedInBackground", false]],
  });

  let handler = Cc["@mozilla.org/browser/final-clh;1"].getService(
    Ci.nsICommandLineHandler
  );
  let selectedTab = gBrowser.selectedTab;
  let focusSpy = sinon.spy(window, "focus");
  try {
    for (let url of ["https://example.com/", "about:blank"]) {
      let tabPromise = BrowserTestUtils.waitForNewTab(gBrowser, url);
      let cmdLine = Cu.createCommandLine(
        ["-url-background", url],
        null,
        Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
      );
      handler.handle(cmdLine);
      let tab = await tabPromise;
      try {
        is(
          gBrowser.selectedTab,
          selectedTab,
          "The selected tab stays selected"
        );
        ok(focusSpy.notCalled, "Opening the URL does not focus the window");
        ok(cmdLine.preventDefault, "The background URL command was handled");
      } finally {
        BrowserTestUtils.removeTab(tab);
      }
    }
  } finally {
    focusSpy.restore();
  }
}

add_task(async function test_background_external_url() {
  await checkBackgroundExternalURLs();
});

add_task(async function test_background_external_url_with_popup() {
  await BrowserTestUtils.withNewTab("https://example.com/", async browser => {
    let popupPromise = BrowserTestUtils.waitForNewWindow();
    await SpecialPowers.spawn(browser, [], () => {
      content.window.open(
        "about:blank",
        "_blank",
        "height=500,width=500,menubar=no,toolbar=no,status=1,resizable=1"
      );
    });
    let popup = await popupPromise;
    try {
      await BrowserTestUtils.ensureWindowActivated(popup);
      ok(!popup.toolbar.visible, "The foreground window is a popup");
      ok(popup.document.hasFocus(), "The popup starts with focus");
      await checkBackgroundExternalURLs();
      is(popup.gBrowser.tabs.length, 1, "No tab opens in the popup");
      ok(popup.document.hasFocus(), "The popup keeps focus");
    } finally {
      await BrowserTestUtils.closeWindow(popup);
    }
  });
});

add_task(function test_external_urls_reject_chrome() {
  let handler = Cc["@mozilla.org/browser/final-clh;1"].getService(
    Ci.nsICommandLineHandler
  );
  for (let args of [
    ["-url-background", "chrome://browser/content/browser.xhtml"],
    ["-url", "chrome://browser/content/browser.xhtml"],
    ["chrome://browser/content/browser.xhtml"],
  ]) {
    let tabs = Array.from(gBrowser.tabs);
    let windows = Array.from(Services.wm.getEnumerator("navigator:browser"));
    let cmdLine = Cu.createCommandLine(
      args,
      null,
      Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
    );
    handler.handle(cmdLine);
    Assert.deepEqual(
      Array.from(gBrowser.tabs),
      tabs,
      "No tab is opened for the rejected URL"
    );
    Assert.deepEqual(
      Array.from(Services.wm.getEnumerator("navigator:browser")),
      windows,
      "No default window is opened for the rejected URL"
    );
    ok(cmdLine.preventDefault, "The rejected URL is handled");
  }
});

add_task(async function test_multiple_background_external_urls() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.loadDivertedInBackground", false]],
  });
  let handler = Cc["@mozilla.org/browser/final-clh;1"].getService(
    Ci.nsICommandLineHandler
  );
  let urls = ["https://example.com/", "https://example.org/"];
  let selectedTab = gBrowser.selectedTab;
  let tabs = [];
  let tabPromises = urls.map(async url => {
    let tab = await BrowserTestUtils.waitForNewTab(gBrowser, url, false, true);
    tabs.push(tab);
    return tab;
  });
  registerCleanupFunction(() => {
    for (let tab of tabs) {
      if (tab.parentNode) {
        BrowserTestUtils.removeTab(tab);
      }
    }
  });
  let focusSpy = sinon.spy(window, "focus");
  try {
    let cmdLine = Cu.createCommandLine(
      [
        "-url-background",
        urls[0],
        "-url-background",
        "chrome://browser/content/browser.xhtml",
        "-url-background",
        urls[1],
      ],
      null,
      Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
    );
    handler.handle(cmdLine);
    await Promise.all(tabPromises);
    is(
      gBrowser.selectedTab,
      selectedTab,
      "Multiple URLs leave the selection unchanged"
    );
    ok(focusSpy.notCalled, "Multiple background URLs do not focus the window");
    ok(cmdLine.preventDefault, "The background URLs are handled");
  } finally {
    focusSpy.restore();
    for (let tab of tabs) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});
