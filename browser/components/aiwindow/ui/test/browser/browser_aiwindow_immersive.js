/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AIWindowUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowUI.sys.mjs"
);

const FIRSTRUN_URL = "chrome://browser/content/aiwindow/firstrun.html";

async function navigateAndWait(win, url) {
  await BrowserTestUtils.loadURIString({
    browser: win.gBrowser.selectedTab.linkedBrowser,
    uriString: url,
  });
  await BrowserTestUtils.waitForCondition(
    () => win.gBrowser.selectedBrowser.currentURI.spec === url,
    `Should navigate to ${url}`
  );
}

function assertSidebarHidden(win, context) {
  const box = win.document.getElementById(AIWindowUI.BOX_ID);
  const splitter = win.document.getElementById(AIWindowUI.SPLITTER_ID);
  const isHidden = el =>
    el.collapsed || win.getComputedStyle(el).display === "none";

  Assert.ok(isHidden(box), `Box should be hidden ${context}`);
  Assert.ok(isHidden(splitter), `Splitter should be hidden ${context}`);
}

function assertSidebarVisible(win, context) {
  const box = win.document.getElementById(AIWindowUI.BOX_ID);
  const splitter = win.document.getElementById(AIWindowUI.SPLITTER_ID);

  Assert.ok(!box.collapsed, `Box should be visible ${context}`);
  Assert.ok(!splitter.collapsed, `Splitter should be visible ${context}`);
  Assert.equal(
    AIWindowUI.isSidebarOpen(win),
    true,
    `Sidebar should be open ${context}`
  );
}

add_task(async function test_firstrun_immersive_view() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.smartwindow.firstrun.hasCompleted", false],
    ],
  });

  const win = await openAIWindow({ waitForTabURL: false });
  const chromeRoot = win.document.documentElement;

  await navigateAndWait(win, FIRSTRUN_URL);

  Assert.ok(
    chromeRoot.hasAttribute("aiwindow-immersive-view"),
    "Chrome window has the aiwindow-immersive-view attribute"
  );
  Assert.ok(
    chromeRoot.hasAttribute("aiwindow-first-run"),
    "Chrome window has the aiwindow-first-run attribute"
  );

  await navigateAndWait(win, "https://example.com/");

  Assert.ok(
    !chromeRoot.hasAttribute("aiwindow-immersive-view"),
    "After firstrun tab is closed, the chrome window no longer has the aiwindow-immersive-view attribute"
  );
  Assert.ok(
    !chromeRoot.hasAttribute("aiwindow-first-run"),
    "After firstrun tab is closed, the chrome window no longer has the aiwindow-first-run attribute"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_open_sidebar_immersive_view() {
  const sb = this.sinon.createSandbox();
  registerCleanupFunction(() => sb.restore());

  sb.stub(this.openAIEngine, "build");

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.smartwindow.firstrun.hasCompleted", false],
    ],
  });

  const win = await openAIWindow({ waitForTabURL: false });
  const chromeRoot = win.document.documentElement;
  await navigateAndWait(win, FIRSTRUN_URL);

  Assert.ok(
    chromeRoot.hasAttribute("aiwindow-immersive-view"),
    "Chrome window has the aiwindow-immersive-view attribute"
  );

  await AIWindowUI.openSidebar(win);
  assertSidebarHidden(win, "when openSidebar called on firstrun page");

  await navigateAndWait(win, "https://example.com/");

  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => !chromeRoot.hasAttribute("aiwindow-immersive-view")
  );

  assertSidebarVisible(win, "after navigating away from firstrun");

  await navigateAndWait(win, AIWINDOW_URL);

  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => chromeRoot.hasAttribute("aiwindow-immersive-view")
  );

  assertSidebarHidden(win, "when viewing AI Window URL");

  AIWindowUI.closeSidebar(win);
  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(
  async function test_back_forward_buttons_visible_after_back_navigation() {
    const win = await openAIWindow();
    try {
      const chromeRoot = win.document.documentElement;
      const browser = win.gBrowser.selectedBrowser;

      await navigateAndWait(win, AIWINDOW_URL);

      Assert.ok(
        !chromeRoot.hasAttribute("aiwindow-has-nav-forward"),
        "No aiwindow-has-nav-forward on initial load with no history"
      );

      await promiseNavigateAndLoad(browser, "https://example.com/");

      let loaded = BrowserTestUtils.browserLoaded(browser, {
        wantLoad: AIWINDOW_URL,
      });
      win.gBrowser.goBack();
      await loaded;

      await BrowserTestUtils.waitForMutationCondition(
        chromeRoot,
        { attributes: true },
        () => chromeRoot.hasAttribute("aiwindow-has-nav-forward")
      );

      const backButton = win.document.getElementById("back-button");
      const forwardButton = win.document.getElementById("forward-button");

      Assert.equal(
        win.getComputedStyle(backButton).visibility,
        "visible",
        "Back button is visible after navigating back to AI window"
      );
      Assert.equal(
        win.getComputedStyle(forwardButton).visibility,
        "visible",
        "Forward button is visible after navigating back to AI window"
      );

      loaded = BrowserTestUtils.browserLoaded(browser, {
        wantLoad: "https://example.com/",
      });
      win.gBrowser.goForward();
      await loaded;

      Assert.ok(
        !chromeRoot.hasAttribute("aiwindow-has-nav-forward"),
        "aiwindow-has-nav-forward is removed after navigating forward to a page"
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
    }
  }
);
